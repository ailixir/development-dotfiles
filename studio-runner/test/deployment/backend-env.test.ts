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
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

import { loadConfig } from '../../src/server/config.js';
import { packageRoot } from '../helpers/corpus.js';

import {
  byKind,
  CHART_DIR,
  deploymentNamed,
  envNames,
  envValues,
  mountedSpringProperties,
  OBSERVED_FIXTURE,
  one,
  podSpec,
  render,
  renderOutcome,
  runnerDeployment,
  RUNNER_FRAGMENT,
  soleContainer,
  VALUE_SETS,
  valueSetName,
  writeValuesOverlay,
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


// ══════════════════════════════════════════════════════════════════════════════════════════════
// STUDIO-OBS-009 AC-5 — the studio audit stream reaches the platform SIEM sink through values.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const scratchDirs: string[] = [];
afterAll(() => {
  for (const directory of scratchDirs) rmSync(directory, { recursive: true, force: true });
});

/** The stream and logger the APPLICATION writes, read from the two files that define them. */
function auditConstants(): { stream: string; logger: string; javaCategory: string } {
  const backend = join(packageRoot, '..', 'backend', 'src', 'main');
  const logback = readFileSync(join(backend, 'resources', 'logback-spring.xml'), 'utf8');
  const stream = /"stream"\s*:\s*"([^"]+)"/u.exec(logback)?.[1];
  const logger = /<logger name="([^"]*audit\.studio)"/u.exec(logback)?.[1];
  const java = readFileSync(
    join(backend, 'java', 'com', 'citi', 'put', 'checks', 'studio', 'guided', 'audit', 'StudioActionAudit.java'),
    'utf8',
  );
  const javaCategory = /CATEGORY\s*=\s*"([^"]+)"/u.exec(java)?.[1];
  if (stream === undefined || logger === undefined || javaCategory === undefined) {
    throw new Error('the audit stream, logger or category moved: the SIEM selector can no longer be checked');
  }
  return { stream, logger, javaCategory };
}

const SIEM_ON: Readonly<Record<string, string>> = {
  'studioAuditSiem.enabled': 'true',
  'studioAuditSiem.sink.name': 'put-platform-siem-studio',
};

/** What the routing contract must say, compared against the application's own constants. */
function siemViolations(outcome: RenderOutcome): string[] {
  const constants = auditConstants();
  const violations: string[] = [];
  const map = byKind(outcome, 'ConfigMap').filter((d) => (d.metadata?.name ?? '').endsWith('-studio-audit-siem'));
  if (map.length !== 1) return [`expected one siem ConfigMap, found ${String(map.length)}`];
  const data = map[0]?.data ?? {};
  if (data['STUDIO_AUDIT_STREAM'] !== constants.stream) violations.push(`stream ${String(data['STUDIO_AUDIT_STREAM'])} != ${constants.stream}`);
  if (data['STUDIO_AUDIT_LOGGER'] !== constants.logger) violations.push(`logger ${String(data['STUDIO_AUDIT_LOGGER'])} != ${constants.logger}`);
  if (constants.logger !== constants.javaCategory) violations.push('logback logger and StudioActionAudit.CATEGORY disagree');
  for (const role of ['-api', '-worker']) {
    const annotations =
      (deploymentNamed(outcome, role).spec as { template?: { metadata?: { annotations?: Record<string, string> } } }).template?.metadata
        ?.annotations ?? {};
    if (annotations['put.citi.com/studio-audit-stream'] !== constants.stream) {
      violations.push(`${role} pod does not carry the stream selector`);
    }
  }
  return violations;
}

describe('AC-5 — the studio audit stream is marked for the SIEM forwarder by values', () => {
  it.each(EACH)('%s: off by default — no routing contract and no annotation on either pod', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    expect(byKind(outcome, 'ConfigMap').filter((d) => (d.metadata?.name ?? '').endsWith('-studio-audit-siem'))).toEqual([]);
    for (const role of ['-api', '-worker']) {
      const annotations =
        (deploymentNamed(outcome, role).spec as { template?: { metadata?: { annotations?: Record<string, string> } } }).template?.metadata
          ?.annotations ?? {};
      expect(Object.keys(annotations).filter((key) => key.startsWith('put.citi.com/studio-audit'))).toEqual([]);
    }
  });

  it.each(EACH)('%s: enabled — the selector equals the application’s own stream and logger, on both pods', (_label, valuesFile) => {
    const outcome = render({ valuesFile, set: SIEM_ON });
    expect(siemViolations(outcome)).toEqual([]);
    const data = byKind(outcome, 'ConfigMap').find((d) => (d.metadata?.name ?? '').endsWith('-studio-audit-siem'))?.data;
    expect(data?.['STUDIO_AUDIT_SINK']).toBe('put-platform-siem-studio');
  });

  it('passes the platform’s own forwarder annotations through, and only while enabled', () => {
    const set = { ...SIEM_ON, 'studioAuditSiem.podAnnotations.fluentbit\\.io/parser': 'studio-audit-json' };
    const annotated = render({ set });
    for (const role of ['-api', '-worker']) {
      const annotations =
        (deploymentNamed(annotated, role).spec as { template?: { metadata?: { annotations?: Record<string, string> } } }).template
          ?.metadata?.annotations ?? {};
      expect(annotations['fluentbit.io/parser']).toBe('studio-audit-json');
    }
    const off = render({ set: { 'studioAuditSiem.podAnnotations.fluentbit\\.io/parser': 'studio-audit-json' } });
    const offAnnotations =
      (deploymentNamed(off, '-api').spec as { template?: { metadata?: { annotations?: Record<string, string> } } }).template?.metadata
        ?.annotations ?? {};
    expect(offAnnotations['fluentbit.io/parser']).toBeUndefined();
  });

  it('refuses to claim routing it did not name: enabled with no sink name fails the render', () => {
    const outcome = renderOutcome({ set: { 'studioAuditSiem.enabled': 'true' } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('studioAuditSiem.sink.name');
    // …and the same set with a name renders, so the failure above is about the name.
    expect(renderOutcome({ set: SIEM_ON }).ok).toBe(true);
  });

  it('chart mutation: a renamed stream in the contract turns the comparison red', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'studio-chart-siem-'));
    scratchDirs.push(scratch);
    const chart = join(scratch, 'put-checks');
    cpSync(CHART_DIR, chart, { recursive: true });
    const path = join(chart, 'templates', 'configmap.yaml');
    const text = readFileSync(path, 'utf8');
    expect(text.split('STUDIO_AUDIT_STREAM: "studio-audit"').length - 1).toBe(1);
    writeFileSync(path, text.replace('STUDIO_AUDIT_STREAM: "studio-audit"', 'STUDIO_AUDIT_STREAM: "studio-audit-v2"'), 'utf8');
    const mutated = render({ chartDir: chart, set: SIEM_ON });
    expect(siemViolations(mutated).join()).toContain('stream studio-audit-v2');
  });

  it('is rendered on guided sets too, with the same selector', () => {
    expect(siemViolations(render({ guided: true, set: SIEM_ON }))).toEqual([]);
  });
});

/**
 * STUDIO-OBS-009 OI-06 B5 — the backend's trusted catalog is delivered by the chart.
 *
 * `application.yml` defaults `studio.observed-replay.catalog-json` to `[]`, and
 * with an empty catalog `ObservedReplayPins.selected()` answers 409 RUNTIME_INCOMPATIBLE, so a
 * chart-deployed stack could not publish a plan, authorize a replay or run any Studio test. The
 * chart renders the property from the SAME `studioObserved` values the runner's file comes from,
 * into the mounted `application.yaml` (never an environment variable). The fixture values are TEST
 * VALUES.
 */
describe('STUDIO-OBS-009 OI-06 B5 — the backend receives the same catalog as the runner', () => {
  const CATALOG_KEY = 'studio.observed-replay.catalog-json';

  it('uses the property names the backend binds (read out of application.yml, not restated)', () => {
    const documents = parseAllDocuments(
      readFileSync(join(packageRoot, '..', 'backend', 'src', 'main', 'resources', 'application.yml'), 'utf8'),
    ).map((document) => document.toJS() as { studio?: Record<string, Record<string, unknown> | undefined> } | null);
    const bound = documents.map((document) => document?.studio?.['observed-replay']).find((value) => value !== undefined);
    expect(bound, 'application.yml no longer binds studio.observed-replay').toBeDefined();
    const prefix = 'studio.observed-replay.';
    expect(Object.keys(bound ?? {})).toEqual(
      expect.arrayContaining([CATALOG_KEY].map((key) => key.slice(prefix.length))),
    );
  });

  it.each(['api', 'worker'] as const)('%s: the property is delivered as a JSON string, the runner’s entry first', (role) => {
    const properties = mountedSpringProperties(render({ observed: true }), role);
    expect(typeof properties[CATALOG_KEY]).toBe('string');
    expect(JSON.parse(String(properties[CATALOG_KEY]))).toEqual([OBSERVED_FIXTURE.catalog]);
  });

  it.each(['api', 'worker'] as const)('%s: the property is not delivered through the environment', (role) => {
    const container = role === 'api' ? api(render({ observed: true })) : worker(render({ observed: true }));
    expect(envNames(container).filter((name) => name.includes('OBSERVED_CATALOG_JSON'))).toEqual([]);
  });

  it('puts additionalBackendCatalog after the runner’s entry, and the runner never receives it', () => {
    const older = {
      profile: { placeholder: 'TEST-ONLY older profile' },
      build: { ...OBSERVED_FIXTURE.catalog.build, executableImageDigest: '8'.repeat(64) },
    };
    const outcome = render({
      observed: true,
      args: ['-f', writeValuesOverlay('observed-additional-catalog.json', { studioObserved: { additionalBackendCatalog: [older] } })],
    });
    for (const role of ['api', 'worker'] as const) {
      const catalog = JSON.parse(String(mountedSpringProperties(outcome, role)[CATALOG_KEY])) as unknown[];
      expect(catalog, role).toEqual([OBSERVED_FIXTURE.catalog, older]);
    }
    const runnerFile = one(
      byKind(outcome, 'ConfigMap').filter((d) => (d.metadata?.name ?? '').endsWith('-studio-observed-trust')),
      'observed trust ConfigMap',
    ).data?.['catalog.json'];
    expect(JSON.parse(runnerFile ?? 'null')).toEqual(OBSERVED_FIXTURE.catalog);
  });

  it('delivers no property while both flags are off, and the pod rolls when the catalog changes', () => {
    const off = render({ set: { 'studioObserved.validationEnabled': 'false', 'studioObserved.replayEnabled': 'false' } });
    for (const role of ['api', 'worker'] as const) {
      const properties = mountedSpringProperties(off, role);
      expect(properties).not.toHaveProperty(CATALOG_KEY);
    }
    const changed = render({
      observed: true,
      args: ['-f', writeValuesOverlay('observed-catalog-rolled.json', { studioObserved: { catalog: { ...OBSERVED_FIXTURE.catalog, build: { ...OBSERVED_FIXTURE.catalog.build, chromiumBuild: 'TEST-ONLY-chromium-1' } } } })],
    });
    const annotation = (outcome: RenderOutcome, role: string): unknown =>
      (deploymentNamed(outcome, `-${role}`).spec?.template as { metadata: { annotations: Record<string, unknown> } }).metadata.annotations['checksum/config'];
    for (const role of ['api', 'worker']) {
      expect(annotation(changed, role), role).not.toBe(annotation(render({ observed: true }), role));
    }
  });
});
