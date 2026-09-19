/**
 * Studio v1 gaps — every environment variable the three Studio processes need to talk to each
 * other, asserted on the output of `helm template` over all four value sets.
 *
 * Before this file the API Deployment rendered neither `STUDIO_CALLBACK_SERVICE_TOKEN` nor the
 * runner's base URL and bearer, so a chart-deployed API refused every runner callback
 * (`ServiceIdentityAuthenticationFilter` refuses all callers when its token is empty) and reported
 * `VALIDATOR_UNAVAILABLE` for every compile. The runner's callback URL was the literal
 * `http://put-checks-api:8080`, correct only for a release named `put-checks`, and the runner's
 * NetworkPolicy admitted the worker only, so the API's `POST /v1/validate` could not have reached
 * it even with an address.
 *
 * Every criterion is a **comparison inside one rendered manifest** — the API's reference against
 * the runner's, the runner's callback URL against the API Service that render produced — never a
 * comparison against a literal copy of the fact.
 */
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/server/config.js';

import {
  byKind,
  deploymentNamed,
  envNames,
  envValues,
  one,
  podSpec,
  render,
  runnerDeployment,
  RUNNER_FRAGMENT,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';
import type { Container, K8sDocument, RenderOutcome } from './helm.js';

const EACH = VALUE_SETS.map((file) => [valueSetName(file), file] as const);

function secretRefOf(container: Container, name: string): { name?: string; key?: string } | undefined {
  return (container.env ?? []).find((entry) => entry.name === name)?.valueFrom?.secretKeyRef;
}

function api(outcome: RenderOutcome): Container {
  return soleContainer(deploymentNamed(outcome, '-api'));
}

function worker(outcome: RenderOutcome): Container {
  return soleContainer(deploymentNamed(outcome, '-worker'));
}

/** The rendered API Service's in-cluster URL. */
function apiServiceUrl(outcome: RenderOutcome): string {
  const service = one(
    byKind(outcome, 'Service').filter((d) => (d.metadata?.name ?? '').endsWith('-api')),
    'API Service',
  );
  const ports = (service.spec as { ports?: readonly { port?: number }[] } | undefined)?.ports ?? [];
  return `http://${service.metadata?.name ?? ''}:${String(ports[0]?.port)}`;
}

/**
 * The backend variables with **no usable default** that a deployed pod must receive, per
 * component. Each is a `${NAME:}` (empty default) or a property the deployed profiles leave unset
 * in `backend/src/main/resources/application*.yml`; the comment says what breaks without it.
 */
const REQUIRED_BACKEND_ENV = {
  api: [
    'SPRING_PROFILES_ACTIVE',
    // application-prod.yml / application-staging.yml carry no datasource: the pod cannot start.
    'SPRING_DATASOURCE_URL',
    'SPRING_DATASOURCE_USERNAME',
    'SPRING_DATASOURCE_PASSWORD',
    // studio.execution.callback.service-token: empty refuses every runner callback.
    'STUDIO_CALLBACK_SERVICE_TOKEN',
    // studio.runner.*: empty makes every compile VALIDATOR_UNAVAILABLE.
    'STUDIO_RUNNER_BASE_URL',
    'STUDIO_RUNNER_SERVICE_TOKEN',
  ],
  worker: [
    'SPRING_PROFILES_ACTIVE',
    'SPRING_DATASOURCE_URL',
    'SPRING_DATASOURCE_USERNAME',
    'SPRING_DATASOURCE_PASSWORD',
    // studio.runner.*: empty closes every dispatch DISPATCH_FAILED (DEF-05).
    'STUDIO_RUNNER_BASE_URL',
    'STUDIO_RUNNER_SERVICE_TOKEN',
    // application-worker.yml pins management to 8081; the probes use the http port.
    'MANAGEMENT_SERVER_PORT',
  ],
} as const;

describe('Studio v1 gaps — the API receives both runner-facing identities from Secret references', () => {
  it.each(EACH)(
    '%s: STUDIO_CALLBACK_SERVICE_TOKEN is the runner’s callback identity key, never inline',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const container = api(outcome);
      const runner = soleContainer(runnerDeployment(outcome));

      const entry = (container.env ?? []).find((e) => e.name === 'STUDIO_CALLBACK_SERVICE_TOKEN');
      expect(entry, 'the API would refuse every runner callback').toBeDefined();
      expect(entry?.value, 'the token must never be inlined into the manifest').toBeUndefined();

      const runnerRef = secretRefOf(runner, 'STUDIO_RUNNER_CALLBACK_IDENTITY');
      expect(runnerRef?.name).toBeDefined();
      expect(secretRefOf(container, 'STUDIO_CALLBACK_SERVICE_TOKEN')).toEqual(runnerRef);
    },
  );

  it.each(EACH)(
    '%s: the API reaches /v1/validate at the worker’s address with the runner’s service identity',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const container = api(outcome);
      const runner = soleContainer(runnerDeployment(outcome));

      const token = (container.env ?? []).find((e) => e.name === 'STUDIO_RUNNER_SERVICE_TOKEN');
      expect(token?.value, 'the bearer must never be inlined into the manifest').toBeUndefined();
      expect(secretRefOf(container, 'STUDIO_RUNNER_SERVICE_TOKEN')).toEqual(
        secretRefOf(runner, 'STUDIO_RUNNER_SERVICE_IDENTITY'),
      );

      const apiUrl = envValues(container).STUDIO_RUNNER_BASE_URL;
      expect(apiUrl, 'the API has no runner address').toBeDefined();
      expect(apiUrl).toBe(envValues(worker(outcome)).STUDIO_RUNNER_BASE_URL);
    },
  );

  it('render mutation: moving the identity Secret moves the API’s two references with the runner’s', () => {
    const outcome = render({
      set: {
        'studioRunner.identity.secretName': 'moved-identity',
        'studioRunner.identity.serviceIdentityKey': 'movedService',
        'studioRunner.identity.callbackIdentityKey': 'movedCallback',
      },
    });
    const container = api(outcome);
    expect(secretRefOf(container, 'STUDIO_CALLBACK_SERVICE_TOKEN')).toEqual({
      name: 'moved-identity',
      key: 'movedCallback',
    });
    expect(secretRefOf(container, 'STUDIO_RUNNER_SERVICE_TOKEN')).toEqual({
      name: 'moved-identity',
      key: 'movedService',
    });
  });

  it('renders none of the three on the API when the runner is disabled', () => {
    const names = envNames(api(render({ enableRunner: false })));
    expect(names).not.toContain('STUDIO_CALLBACK_SERVICE_TOKEN');
    expect(names).not.toContain('STUDIO_RUNNER_BASE_URL');
    expect(names).not.toContain('STUDIO_RUNNER_SERVICE_TOKEN');
  });
});

describe('Studio v1 gaps — the runner calls back to this release’s API Service', () => {
  it.each(EACH)('%s: STUDIO_RUNNER_CALLBACK_BASE_URL is the rendered API Service', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    const runner = soleContainer(runnerDeployment(outcome));
    expect(envValues(runner).STUDIO_RUNNER_CALLBACK_BASE_URL).toBe(apiServiceUrl(outcome));
  });

  it('render mutation: another release name and API port move the callback URL with them', () => {
    const outcome = render({ set: { fullnameOverride: 'other', 'backend.service.port': '9443' } });
    const runner = soleContainer(runnerDeployment(outcome));
    expect(apiServiceUrl(outcome)).toBe('http://other-api:9443');
    expect(envValues(runner).STUDIO_RUNNER_CALLBACK_BASE_URL).toBe('http://other-api:9443');
  });

  it('an explicit studioRunner.callbackBaseUrl still wins', () => {
    const outcome = render({ set: { 'studioRunner.callbackBaseUrl': 'http://gateway.internal:80' } });
    expect(envValues(soleContainer(runnerDeployment(outcome))).STUDIO_RUNNER_CALLBACK_BASE_URL).toBe(
      'http://gateway.internal:80',
    );
  });

  it.each(EACH)('%s: the runner’s own loader accepts the environment the chart renders', (_label, valuesFile) => {
    // Secret-backed entries get a placeholder: the loader must see every required key present.
    const env: Record<string, string> = {};
    for (const entry of soleContainer(runnerDeployment(render({ valuesFile }))).env ?? []) {
      env[entry.name] = entry.value ?? 'secret-placeholder';
    }
    expect(() => loadConfig(env)).not.toThrow();
  });
});

describe('Studio v1 gaps — the runner admits the API as well as the worker', () => {
  function runnerPolicy(outcome: RenderOutcome): K8sDocument {
    return one(
      byKind(outcome, 'NetworkPolicy').filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
      'the runner NetworkPolicy',
    );
  }

  it.each(EACH)('%s: ingress admits API and worker pods on the runner port, and nothing else', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    const spec = runnerPolicy(outcome).spec as {
      ingress?: readonly { from?: readonly { podSelector?: { matchLabels?: Record<string, string> } }[] }[];
    };
    const components = (spec.ingress ?? [])
      .flatMap((rule) => rule.from ?? [])
      .map((peer) => peer.podSelector?.matchLabels?.['app.kubernetes.io/component'])
      .sort();
    expect(components).toEqual(['api', 'worker']);
  });
});

describe('Studio v1 gaps — every required backend variable is rendered on its component', () => {
  it.each(EACH)('%s: API and worker each carry their required set', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    expect(envNames(api(outcome))).toEqual(expect.arrayContaining([...REQUIRED_BACKEND_ENV.api]));
    expect(envNames(worker(outcome))).toEqual(expect.arrayContaining([...REQUIRED_BACKEND_ENV.worker]));
  });

  it.each(EACH)('%s: the datasource is a Secret reference on both, never a literal', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    for (const container of [api(outcome), worker(outcome)]) {
      for (const name of ['SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD']) {
        const ref = secretRefOf(container, name);
        expect(ref?.name, `${container.name ?? ''} ${name}`).toBeTruthy();
        expect(ref?.key).toBe(name);
      }
    }
  });

  it.each(EACH)('%s: the worker’s actuator shares the port its probes use', (_label, valuesFile) => {
    const deployment = deploymentNamed(render({ valuesFile }), '-worker');
    const container = soleContainer(deployment) as Container & {
      ports?: readonly { name?: string; containerPort?: number }[];
      readinessProbe?: { httpGet?: { port?: string | number } };
    };
    const http = (container.ports ?? []).find((p) => p.name === 'http');
    expect(container.readinessProbe?.httpGet?.port).toBe('http');
    expect(envValues(container).MANAGEMENT_SERVER_PORT).toBe(String(http?.containerPort));
    expect(podSpec(deployment).containers).toHaveLength(1);
  });
});
