/**
 * STUDIO-OBS-009 AC-2 / AC-3, the chart's half: the TLS chain between the backend and the one
 * runner listener, asserted on the output of `helm template`.
 *
 * What the chart is responsible for, and what these tests therefore pin:
 *
 * - the backend (API and worker) PRESENTS a client certificate to the runner: a key store and a
 *   trust store on a Secret of their own, mounted read-only at mode 0440 as a directory (no
 *   `subPath`), and named in the mounted `application.yaml` as `studio.runner.tls.*`;
 * - the runner's private key and the backend's private key never share a pod: the two Secrets are
 *   different, and neither pod references the other's;
 * - the runner base URL both backend pods use is `https`, and its host is the Service the runner
 *   certificate's SANs must cover;
 * - with guided mode on, the API pod terminates a guided TLS connector (`clientAuth=need`) that is
 *   exposed through its own Service and admitted from the runner by the NetworkPolicy, and the
 *   issuer, public key and worker id are each rendered from ONE values key into both sides;
 * - the chain fails closed: a missing part is a failed render with a named key.
 *
 * What it cannot show: that a certificate chain validates, that the JDK accepts these stores, or
 * that a connector exists in the API (the connector code is lane D3's; the property the chart
 * renders for it, `studio.guided-authoring.connector.port`, is the name the backend reads, kept in
 * one helper). Those are owed to the backend tier and to a cluster.
 */
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  byKind,
  deploymentNamed,
  envValues,
  GUIDED_FIXTURE,
  named,
  one,
  podSpec,
  referencedSecretNames,
  render,
  renderOutcome,
  runnerDeployment,
  RUNNER_FRAGMENT,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';
import type { Container, K8sDocument, PodSpec, RenderOutcome } from './helm.js';

const MODES = VALUE_SETS.flatMap((file) =>
  [false, true].map((guided) => [`${valueSetName(file)} guided=${String(guided)}`, file, guided] as const),
);

type Volume = NonNullable<PodSpec['volumes']>[number];

function volumeNamed(pod: PodSpec, name: string): Volume | undefined {
  return (pod.volumes ?? []).find((volume) => volume.name === name);
}

function backendPod(outcome: RenderOutcome, role: 'api' | 'worker'): { pod: PodSpec; container: Container } {
  const deployment = deploymentNamed(outcome, `-${role}`);
  return { pod: podSpec(deployment), container: soleContainer(deployment) };
}

function properties(outcome: RenderOutcome, role: 'api' | 'worker'): Record<string, unknown> {
  const { pod } = backendPod(outcome, role);
  const volume = volumeNamed(pod, 'spring-config');
  const configMap = one(
    byKind(outcome, 'ConfigMap').filter((d) => d.metadata?.name === volume?.configMap?.name),
    'mounted Spring config',
  );
  return parseYaml(configMap.data?.['application.yaml'] ?? '') as Record<string, unknown>;
}

function runnerService(outcome: RenderOutcome): K8sDocument {
  return one(
    named(outcome, RUNNER_FRAGMENT).filter((d) => d.kind === 'Service'),
    'runner Service',
  );
}

describe('AC-3 — the backend presents a client certificate to the runner, on every value set', () => {
  it.each(MODES)('%s: the API and worker mount a read-only 0440 key store and trust store, and name them', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    for (const role of ['api', 'worker'] as const) {
      const { pod, container } = backendPod(outcome, role);
      const volume = volumeNamed(pod, 'runner-tls');
      expect(volume?.secret, `${role} has no runner-tls Secret volume`).toBeDefined();
      expect(volume?.secret?.defaultMode, 'a private key at the 0644 default').toBe(0o440);
      const mount = (container.volumeMounts ?? []).find((m) => m.name === 'runner-tls');
      expect(mount?.readOnly).toBe(true);
      expect(mount?.subPath, 'a subPath mount never receives a Secret update').toBeUndefined();

      const props = properties(outcome, role);
      const projected = (volume?.secret?.items ?? []).map((item) => `${mount?.mountPath ?? ''}/${item.path ?? ''}`);
      for (const key of [
        'studio.runner.tls.key-store',
        'studio.runner.tls.key-store-password-file',
        'studio.runner.tls.trust-store',
        'studio.runner.tls.trust-store-password-file',
      ]) {
        expect(projected, `${role}: ${key} names a file the volume does not project`).toContain(props[key]);
      }
      expect(props['studio.runner.tls.key-store-type']).toBe('PKCS12');
      expect(props['studio.runner.tls.trust-store-type']).toBe('PKCS12');
      // Passwords are FILES (`StudioRunnerTls.Settings`), never inline values: every property that
      // mentions a password is a `-password-file` path.
      const passwordKeys = Object.keys(props).filter((key) => /password/iu.test(key));
      expect(passwordKeys.length).toBeGreaterThan(0);
      for (const key of passwordKeys) {
        expect(key.endsWith('-password-file'), `${key} is not a file reference`).toBe(true);
        expect(String(props[key]).startsWith('/')).toBe(true);
      }
    }
  });

  it.each(MODES)('%s: the runner private key and the backend private key never share a pod', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    const runnerPod = podSpec(runnerDeployment(outcome));
    const runnerTls = volumeNamed(runnerPod, 'tls')?.secret?.secretName;
    const backendTls = volumeNamed(backendPod(outcome, 'api').pod, 'runner-tls')?.secret?.secretName;
    expect(runnerTls).toBeDefined();
    expect(backendTls).toBeDefined();
    expect(runnerTls, 'one Secret holds both private keys').not.toBe(backendTls);
    for (const role of ['api', 'worker'] as const) {
      expect(referencedSecretNames(backendPod(outcome, role).pod), `${role} can read the runner key`).not.toContain(
        runnerTls,
      );
    }
    expect(referencedSecretNames(runnerPod), 'the runner can read the backend key').not.toContain(backendTls);
  });

  it.each(MODES)('%s: both backend pods address the runner over https, at the Service the certificate must cover', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    const service = runnerService(outcome);
    const port = (service.spec as { ports?: readonly { port?: number; name?: string; targetPort?: string }[] }).ports?.[0];
    for (const role of ['api', 'worker'] as const) {
      const url = new URL(envValues(backendPod(outcome, role).container)['STUDIO_RUNNER_BASE_URL'] ?? '');
      expect(url.protocol, `${role} would dispatch to the runner in plaintext`).toBe('https:');
      expect(url.hostname).toBe(service.metadata?.name);
      expect(Number(url.port)).toBe(port?.port);
    }
    // The Service and the container name the port the same way, so nobody reads it as plaintext.
    const containerPorts = soleContainer(runnerDeployment(outcome)).ports ?? [];
    expect(port?.targetPort).toBe('https');
    expect(containerPorts.map((p) => p.name)).toEqual(['https']);
  });

  it.each(MODES)('%s: the runner is addressed by the same trust anchors on both sides (CA file and trust store are both mounted)', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    const runnerItems = (volumeNamed(podSpec(runnerDeployment(outcome)), 'tls')?.secret?.items ?? []).map((i) => i.path);
    const backendItems = (volumeNamed(backendPod(outcome, 'api').pod, 'runner-tls')?.secret?.items ?? []).map((i) => i.path);
    expect(runnerItems).toEqual(expect.arrayContaining(['ca.crt', 'tls.key', 'tls.crt']));
    expect(backendItems).toEqual(expect.arrayContaining(['keystore.p12', 'truststore.p12']));
  });

  it('renders no runner TLS properties when the runner is disabled', () => {
    const props = properties(render({ enableRunner: false }), 'api');
    expect(Object.keys(props).filter((key) => key.startsWith('studio.runner.tls.'))).toEqual([]);
  });

  it('fails the render when either TLS Secret name is empty, naming the key', () => {
    for (const [key, fragment] of [
      ['studioRunner.tls.secretName', 'studioRunner.tls.secretName'],
      ['studioRunner.backendTls.secretName', 'studioRunner.backendTls.secretName'],
    ] as const) {
      const outcome = renderOutcome({ set: { [key]: '' } });
      expect(outcome.ok, `${key} empty rendered a runner with no TLS source`).toBe(false);
      expect(outcome.error).toContain(fragment);
    }
  });

  it('keeps a configOverrides entry from replacing a chart-owned TLS or guided property', () => {
    for (const property of [
      'studio.runner.tls.key-store',
      'studio.runner.tls.trust-store-password-file',
      'studio.guided-authoring.service-public-key',
      'studio.guided-authoring.mtls-required',
      'studio.guided-authoring.translation.worker-id',
      'studio.guided-authoring.connector.port',
    ]) {
      for (const component of ['backend', 'worker']) {
        const outcome = renderOutcome({
          args: ['--set-string', `${component}.configOverrides.${property.replaceAll('.', '\\.')}=override`],
        });
        expect(outcome.ok, `${component} accepted an override of ${property}`).toBe(false);
        expect(outcome.error).toContain('is managed by the chart');
      }
    }
  });
});

describe('AC-2 — the guided bridge chain: connector, pins, tokens, each from one key', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: the API terminates a guided TLS connector with clientAuth=need, exposed only through its own Service',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const { container } = backendPod(outcome, 'api');
      const props = properties(outcome, 'api');
      const connectorPort = container.ports?.find((p) => p.name === 'guided-tls')?.containerPort;
      expect(connectorPort, 'no guided-tls container port on the API').toBeDefined();
      // The name is the one the backend reads (`GuidedSessionConfiguration`), and the value is the
      // one values key that also names the container port: one fact, rendered once (architect
      // ruling 4(iv)). The connector hard-codes `clientAuth` as required, so there is no knob.
      expect(props['studio.guided-authoring.connector.port']).toBe(connectorPort);
      // Exactly one connector property: no second spelling, no client-auth knob nobody reads.
      expect(Object.keys(props).filter((key) => key.includes('connector'))).toEqual([
        'studio.guided-authoring.connector.port',
      ]);
      expect(props['studio.guided-authoring.mtls-required']).toBe(true);

      const apiHttp = container.ports?.find((p) => p.name === 'http')?.containerPort;
      expect(connectorPort, 'the connector shares the HTTP port').not.toBe(apiHttp);

      const tlsService = one(
        byKind(outcome, 'Service').filter((d) => (d.metadata?.name ?? '').endsWith('-api-guided-tls')),
        'guided TLS Service',
      );
      const spec = tlsService.spec as {
        type?: string;
        ports?: readonly { name?: string; port?: number; targetPort?: string }[];
        selector?: Record<string, string>;
      };
      expect(spec.type).toBe('ClusterIP');
      expect(spec.ports).toHaveLength(1);
      expect(spec.ports?.[0]?.targetPort).toBe('guided-tls');
      expect(spec.selector?.['app.kubernetes.io/component']).toBe('api');

      // The ordinary API Service is byte-for-byte what it was: the connector is not reachable
      // through the API's usual name.
      const apiService = (o: RenderOutcome): K8sDocument =>
        one(
          byKind(o, 'Service').filter((d) => d.metadata?.name?.endsWith('-api') === true),
          'API Service',
        );
      expect(apiService(outcome)).toEqual(apiService(render({ valuesFile })));
    },
  );

  it('renders the connector port the backend reads from the one values key, and moves it with that key', () => {
    // Architect ruling 4(iv): the backend reads `studio.guided-authoring.connector.port`. A chart
    // that renders any other name leaves a guided API pod at port 0, which it refuses to start on.
    // The value is mutated INSIDE the measurement window: the container port, the Service target
    // and the property all follow `studioRunner.guided.tlsConnector.port`.
    const outcome = render({ guided: true, set: { 'studioRunner.guided.tlsConnector.port': '9443' } });
    const { container } = backendPod(outcome, 'api');
    expect(properties(outcome, 'api')['studio.guided-authoring.connector.port']).toBe(9443);
    expect(container.ports?.find((p) => p.name === 'guided-tls')?.containerPort).toBe(9443);
    expect(properties(outcome, 'worker')).not.toHaveProperty('studio.guided-authoring.connector.port');
  });

  it('no guided TLS Service, port or property exists while guided mode is off', () => {
    const outcome = render();
    expect(byKind(outcome, 'Service').filter((d) => (d.metadata?.name ?? '').endsWith('-guided-tls'))).toEqual([]);
    expect(backendPod(outcome, 'api').container.ports?.map((p) => p.name)).toEqual(['http']);
    expect(Object.keys(properties(outcome, 'api')).filter((k) => k.startsWith('studio.guided-authoring.'))).toEqual([]);
  });

  it('admits the runner to the connector port, as a second port on the SAME callback-api rule, only while guided', () => {
    const portsOf = (outcome: RenderOutcome): number[] => {
      const policy = one(
        byKind(outcome, 'NetworkPolicy').filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
        'runner NetworkPolicy',
      );
      const egress = (policy.spec as { egress?: readonly { to?: readonly unknown[]; ports?: readonly { port?: number }[] }[] }).egress ?? [];
      const callback = egress.filter((rule) => JSON.stringify(rule).includes('component":"api'));
      expect(callback, 'exactly one callback-api rule: a second destination class is a divergence').toHaveLength(1);
      return (callback[0]?.ports ?? []).map((p) => p.port ?? 0);
    };
    const off = render();
    const on = render({ guided: true });
    const connector = backendPod(on, 'api').container.ports?.find((p) => p.name === 'guided-tls')?.containerPort;
    const httpPort = backendPod(off, 'api').container.ports?.find((p) => p.name === 'http')?.containerPort;
    expect(portsOf(off)).toEqual([httpPort]);
    expect(portsOf(on)).toEqual([httpPort, connector]);
    // Ingress to the runner is unchanged by guided mode: still API and worker on the one port.
    const ingress = (o: RenderOutcome): unknown =>
      (one(
        byKind(o, 'NetworkPolicy').filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
        'runner NetworkPolicy',
      ).spec as { ingress?: unknown }).ingress;
    expect(ingress(on)).toEqual(ingress(off));
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: issuer, public key and subject are single-source across the runner and the backend',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const env = envValues(soleContainer(runnerDeployment(outcome)));
      const api = properties(outcome, 'api');
      const worker = properties(outcome, 'worker');

      expect(env['STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER']).toBe(GUIDED_FIXTURE.issuer);
      expect(api['studio.guided-authoring.service-issuer']).toBe(env['STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER']);
      expect(env['STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT']).toBe(GUIDED_FIXTURE.controllerSubject);

      // The runner reads a FILE that this chart renders; the backend reads the same PEM as a value.
      const keyMap = one(
        byKind(outcome, 'ConfigMap').filter((d) => (d.metadata?.name ?? '').endsWith('-studio-guided-controller-key')),
        'controller key ConfigMap',
      );
      const fileName = env['STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE']?.split('/').pop() ?? '';
      expect(keyMap.data?.[fileName]?.trim()).toBe(GUIDED_FIXTURE.publicKey);
      expect(String(api['studio.guided-authoring.service-public-key']).trim()).toBe(keyMap.data?.[fileName]?.trim());

      // The worker only calls out: it verifies no guided token and terminates no connector.
      for (const key of [
        'studio.guided-authoring.service-issuer',
        'studio.guided-authoring.service-public-key',
        'studio.guided-authoring.mtls-required',
        'studio.guided-authoring.connector.port',
      ]) {
        expect(worker, `the worker carries ${key}`).not.toHaveProperty(key);
      }
    },
  );

  it('moves issuer and public key on both sides from the one key each (rotation inputs)', () => {
    const rotated = render({
      guided: true,
      set: { 'studioRunner.guided.token.issuer': 'https://rotated.example' },
    });
    expect(envValues(soleContainer(runnerDeployment(rotated)))['STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER']).toBe(
      'https://rotated.example',
    );
    expect(properties(rotated, 'api')['studio.guided-authoring.service-issuer']).toBe('https://rotated.example');
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: the three audience-scoped token files are separate mounts, and no pod reads another pod’s',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const runnerPod = podSpec(runnerDeployment(outcome));
      const runnerEnv = envValues(soleContainer(runnerDeployment(outcome)));
      const callbackSecret = volumeNamed(runnerPod, 'guided-callback-token')?.secret?.secretName;
      const backendTokens = volumeNamed(backendPod(outcome, 'api').pod, 'guided-controller-tokens')?.secret?.secretName;
      expect(callbackSecret).toBeDefined();
      expect(backendTokens).toBeDefined();
      expect(callbackSecret, 'one Secret carries both directions of token').not.toBe(backendTokens);
      for (const role of ['api', 'worker'] as const) {
        expect(referencedSecretNames(backendPod(outcome, role).pod)).not.toContain(callbackSecret);
        const props = properties(outcome, role);
        const mount = (backendPod(outcome, role).container.volumeMounts ?? []).find((m) => m.name === 'guided-controller-tokens');
        const items = (volumeNamed(backendPod(outcome, role).pod, 'guided-controller-tokens')?.secret?.items ?? []).map(
          (item) => `${mount?.mountPath ?? ''}/${item.path ?? ''}`,
        );
        expect(items).toContain(props['studio.guided-authoring.controller-token-file']);
        expect(items).toContain(props['studio.guided-authoring.translation.controller-token-file']);
        expect(props['studio.guided-authoring.controller-token-file']).not.toBe(
          props['studio.guided-authoring.translation.controller-token-file'],
        );
      }
      expect(referencedSecretNames(runnerPod)).not.toContain(backendTokens);
      expect(runnerEnv['STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE']).toMatch(/\/token$/u);
    },
  );

  it('points the backend at the runner Service for guided traffic, and the coordinator at the callback URL', () => {
    const outcome = render({ guided: true });
    const service = runnerService(outcome);
    const callback = envValues(soleContainer(runnerDeployment(outcome)))['STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL'];
    for (const role of ['api', 'worker'] as const) {
      const props = properties(outcome, role);
      const origin = new URL(String(props['studio.guided-authoring.runner-origin']));
      expect(origin.protocol).toBe('https:');
      expect(origin.hostname).toBe(service.metadata?.name);
      expect(props['studio.guided-authoring.translation.controller-origin']).toBe(callback);
    }
  });

  it('fails the chain closed: every missing part is a failed render naming its key', () => {
    // The negative test AC-2 asks for, for the chart's half: no pin, no key, no issuer, no token
    // source, no TLS Secret. (The Java half, that the filter refuses an empty key, is the backend tier's.)
    const parts: readonly (readonly [string, string])[] = [
      ['studioRunner.guided.token.publicKey', 'token.publicKey'],
      ['studioRunner.guided.token.issuer', 'token.issuer'],
      ['studioRunner.guided.callbackToken.secretName', 'callbackToken.secretName'],
      ['studioRunner.guided.backendTokens.secretName', 'backendTokens.secretName'],
      ['studioRunner.backendTls.secretName', 'backendTls.secretName'],
      ['studioRunner.tls.secretName', 'tls.secretName'],
    ];
    for (const [key, fragment] of parts) {
      const outcome = renderOutcome({ guided: true, set: { [key]: '' } });
      expect(outcome.ok, `${key} empty rendered`).toBe(false);
      expect(outcome.error).toContain(fragment);
    }
    expect(renderOutcome({ guided: true, omitPin: true }).ok, 'no controller pin rendered').toBe(false);
  });
});

// ── The API ingress NetworkPolicy for the guided connector (architect ruling 4(i) b) ─────────────

interface IngressRule {
  readonly from?: readonly { podSelector?: { matchLabels?: Record<string, string> } }[];
  readonly ports?: readonly { port?: number | string; protocol?: string }[];
}

interface PolicySpec {
  readonly podSelector?: { matchLabels?: Record<string, string> };
  readonly policyTypes?: readonly string[];
  readonly ingress?: readonly IngressRule[];
  readonly egress?: readonly unknown[];
}

function apiGuidedPolicies(outcome: RenderOutcome): readonly K8sDocument[] {
  return byKind(outcome, 'NetworkPolicy').filter((d) => (d.metadata?.name ?? '').endsWith('-api-guided-tls-ingress'));
}

function apiGuidedPolicy(outcome: RenderOutcome): PolicySpec {
  return one(apiGuidedPolicies(outcome), 'API guided-connector NetworkPolicy').spec as PolicySpec;
}

describe('AC-2 — the API ingress NetworkPolicy: the connector port is open to runner and worker pods only', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: not rendered while guided mode is off (the API has no ingress policy, as today)',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      expect(apiGuidedPolicies(outcome)).toEqual([]);
      // The only NetworkPolicy is still the runner's.
      expect(byKind(outcome, 'NetworkPolicy').map((d) => d.metadata?.name)).toEqual(
        named(outcome, RUNNER_FRAGMENT)
          .filter((d) => d.kind === 'NetworkPolicy')
          .map((d) => d.metadata?.name),
      );
    },
  );

  it('is not rendered when the runner is disabled: guided without the runner refuses to render at all', () => {
    // There is no state with guided on and the runner off, so this policy cannot render in it.
    const outcome = renderOutcome({ guided: true, enableRunner: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('studioRunner.guided.enabled is true but studioRunner.enabled is false');
    expect(apiGuidedPolicies(render({ enableRunner: false }))).toEqual([]);
  });

  it('follows the existing networkPolicy.enabled switch off, like the runner policy', () => {
    const outcome = render({ guided: true, set: { 'studioRunner.networkPolicy.enabled': 'false' } });
    expect(apiGuidedPolicies(outcome)).toEqual([]);
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: selects the API pods and governs ingress only',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const spec = apiGuidedPolicy(outcome);
      const apiLabels = deploymentNamed(outcome, '-api').spec as {
        selector?: { matchLabels?: Record<string, string> };
      };
      expect(spec.podSelector?.matchLabels).toEqual(apiLabels.selector?.matchLabels);
      expect(spec.policyTypes, 'egress must not be touched by this policy').toEqual(['Ingress']);
      expect(spec).not.toHaveProperty('egress');
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: rule 1 re-admits exactly the API container ports other than guided-tls, from every source',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const spec = apiGuidedPolicy(outcome);
      const containerPorts = backendPod(outcome, 'api').container.ports ?? [];
      // Derived from the rendered Deployment, so a port added to the API later without a rule here
      // (which this policy would then close) fails this test rather than a cluster.
      const expected = containerPorts.filter((p) => p.name !== 'guided-tls').map((p) => p.containerPort);
      expect(expected.length, 'the API renders no ordinary port').toBeGreaterThan(0);
      const open = (spec.ingress ?? []).filter((rule) => rule.from === undefined);
      expect(open, 'exactly one all-sources rule').toHaveLength(1);
      expect((open[0]?.ports ?? []).map((p) => p.port).sort()).toEqual([...expected].sort());
      expect((open[0]?.ports ?? []).every((p) => p.protocol === 'TCP')).toBe(true);
      // The connector is never in the open rule.
      const connector = containerPorts.find((p) => p.name === 'guided-tls')?.containerPort;
      expect(connector).toBeDefined();
      expect((open[0]?.ports ?? []).map((p) => p.port)).not.toContain(connector);
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: rule 2 opens the connector port to the runner and worker pods, and to nobody else',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile, guided: true });
      const spec = apiGuidedPolicy(outcome);
      const connector = backendPod(outcome, 'api').container.ports?.find((p) => p.name === 'guided-tls')?.containerPort;
      const restricted = (spec.ingress ?? []).filter((rule) => rule.from !== undefined);
      expect(restricted, 'exactly one source-restricted rule').toHaveLength(1);
      const rule = restricted[0];
      expect((rule?.ports ?? []).map((p) => p.port)).toEqual([connector]);

      const runnerLabels = (runnerDeployment(outcome).spec as { selector?: { matchLabels?: Record<string, string> } })
        .selector?.matchLabels;
      const workerLabels = (deploymentNamed(outcome, '-worker').spec as {
        selector?: { matchLabels?: Record<string, string> };
      }).selector?.matchLabels;
      expect(runnerLabels).toBeDefined();
      expect(workerLabels).toBeDefined();
      // Exactly {runner selector, worker selector}: no namespaceSelector, no ipBlock, no API pods,
      // no frontend, no empty selector that would mean "every pod".
      const sources = (rule?.from ?? []).map((peer) => peer.podSelector?.matchLabels);
      expect(rule?.from?.every((peer) => Object.keys(peer).join() === 'podSelector')).toBe(true);
      expect(sources).toHaveLength(2);
      expect(sources).toEqual(expect.arrayContaining([runnerLabels, workerLabels]));
      // The runner selector must be the runner's and not the API's.
      for (const labels of sources) {
        expect(labels?.['app.kubernetes.io/component']).not.toBe('api');
        expect(Object.keys(labels ?? {}).length).toBeGreaterThan(0);
      }
    },
  );

  it('moves the connector rule with the one port key, and keeps the ordinary-port rule where it was', () => {
    const outcome = render({ guided: true, set: { 'studioRunner.guided.tlsConnector.port': '9443' } });
    const spec = apiGuidedPolicy(outcome);
    const byOpen = (open: boolean): IngressRule[] => (spec.ingress ?? []).filter((r) => (r.from === undefined) === open);
    expect((byOpen(false)[0]?.ports ?? []).map((p) => p.port)).toEqual([9443]);
    expect((byOpen(true)[0]?.ports ?? []).map((p) => p.port)).toEqual(
      (backendPod(outcome, 'api').container.ports ?? []).filter((p) => p.name === 'http').map((p) => p.containerPort),
    );
  });
});
