import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  byKind,
  CHART_DIR,
  deploymentNamed,
  envValues,
  mountedSpringProperties,
  podSpec,
  render,
  renderOutcome,
  runnerDeployment,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';

/**
 * The API's Spring `configOverrides` as delivered: story 10.27 mounts them read-only as
 * `application.yaml` (volume `spring-config`) instead of converting them into `envFrom` names.
 */
function apiSpringProperties(outcome: ReturnType<typeof render>): Record<string, unknown> {
  const deployment = deploymentNamed(outcome, '-api');
  const volume = podSpec(deployment).volumes?.find((entry) => entry.name === 'spring-config');
  const configMap = byKind(outcome, 'ConfigMap').find(
    (item) => item.metadata?.name === volume?.configMap?.name,
  );
  return parse(configMap?.data?.['application.yaml'] ?? '') as Record<string, unknown>;
}

describe('production integration provider wiring', () => {
  it('ships production-safe Vertex translation and an enabled UI_TEST source by default', () => {
    const outcome = render();
    const api = envValues(soleContainer(deploymentNamed(outcome, '-api')));
    const worker = envValues(soleContainer(deploymentNamed(outcome, '-worker')));
    const runner = envValues(soleContainer(runnerDeployment(outcome)));

    expect(api.STUDIO_EVIDENCE_PROVIDER).toBe('local');
    expect(worker.STUDIO_EVIDENCE_PROVIDER).toBe('local');
    expect(runner.STUDIO_RUNNER_OBJECT_STORE_PROVIDER).toBe('local');
    expect(api.STUDIO_VAULT_PROVIDER).toBe('none');
    expect(worker.STUDIO_VAULT_PROVIDER).toBe('none');
    expect(api.STUDIO_GATEWAY_PROVIDER).toBe('vertex');
    expect(api.STUDIO_GATEWAY_MODEL).toBe('gemini-3.8-flash');
    expect(apiSpringProperties(outcome)['checks.sources.UI_TEST']).toBe('true');

    const deployments = [
      deploymentNamed(outcome, '-api'),
      deploymentNamed(outcome, '-worker'),
      runnerDeployment(outcome),
    ];
    const claims = deployments.map((deployment) =>
      (podSpec(deployment).volumes ?? []).find((volume) => volume.name === 'local-object-store')
        ?.persistentVolumeClaim?.claimName,
    );
    expect(new Set(claims).size).toBe(1);
    expect(claims[0]).toBeDefined();
    expect(byKind(outcome, 'PersistentVolumeClaim')).toHaveLength(1);
    expect(runner.STUDIO_RUNNER_OBJECT_STORE_DIR).toBe(api.STUDIO_EVIDENCE_DIRECTORY);
    expect(worker.STUDIO_EVIDENCE_DIRECTORY).toBe(api.STUDIO_EVIDENCE_DIRECTORY);
  });

  it('passes a test-scoped Vault path template the backend accepts, with the provider off', () => {
    // studio-vault-secrets (F17): the chart always passes its template to both pods, and the
    // backend refuses to start `hashicorp` with a template lacking {testId} or not ending in
    // /{referenceName}. The chart default must therefore be the backend's own.
    const outcome = render();
    for (const suffix of ['-api', '-worker']) {
      const env = envValues(soleContainer(deploymentNamed(outcome, suffix)));
      expect(env.STUDIO_VAULT_PATH_TEMPLATE, suffix).toContain('{testId}');
      expect(env.STUDIO_VAULT_PATH_TEMPLATE, suffix).toMatch(/\/\{referenceName\}$/u);
      expect(env.STUDIO_VAULT_PATH_TEMPLATE, suffix).toBe(
        'studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}',
      );
      expect(env.STUDIO_VAULT_PROVIDER, suffix).toBe('none');
    }
  });

  it('renders one Sonic endpoint/bucket into writer and readers with file credentials', () => {
    const outcome = render({
      set: {
        'objectStore.provider': 's3',
        'objectStore.endpoint': 'https://sonic.internal.example',
        'objectStore.bucket': 'studio-evidence',
      },
    });
    const api = envValues(soleContainer(deploymentNamed(outcome, '-api')));
    const worker = envValues(soleContainer(deploymentNamed(outcome, '-worker')));
    const runner = envValues(soleContainer(runnerDeployment(outcome)));

    expect(api.STUDIO_EVIDENCE_ENDPOINT).toBe('https://sonic.internal.example');
    expect(worker.STUDIO_EVIDENCE_ENDPOINT).toBe(api.STUDIO_EVIDENCE_ENDPOINT);
    expect(runner.STUDIO_RUNNER_OBJECT_STORE_ENDPOINT).toBe(api.STUDIO_EVIDENCE_ENDPOINT);
    expect(runner.STUDIO_RUNNER_OBJECT_STORE_BUCKET).toBe(api.STUDIO_EVIDENCE_BUCKET);
    expect(runner.STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE).toMatch(/accessKeyId$/u);
    expect(api.STUDIO_EVIDENCE_SECRET_ACCESS_KEY_FILE).toMatch(/secretAccessKey$/u);
  });

  it('fails rendering an incomplete Sonic selection instead of falling back', () => {
    const outcome = renderOutcome({ set: { 'objectStore.provider': 's3' } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('objectStore.endpoint is required for provider=s3');
  });

  it('can reuse one pre-provisioned local claim and rejects an unbound local store', () => {
    const existing = render({
      set: {
        'objectStore.local.createClaim': 'false',
        'objectStore.local.existingClaim': 'platform-studio-evidence',
      },
    });
    expect(byKind(existing, 'PersistentVolumeClaim')).toHaveLength(0);
    for (const deployment of [
      deploymentNamed(existing, '-api'),
      deploymentNamed(existing, '-worker'),
      runnerDeployment(existing),
    ]) {
      const claim = (podSpec(deployment).volumes ?? []).find(
        (volume) => volume.name === 'local-object-store',
      )?.persistentVolumeClaim?.claimName;
      expect(claim).toBe('platform-studio-evidence');
    }

    const incomplete = renderOutcome({
      set: { 'objectStore.local.createClaim': 'false' },
    });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.error).toContain('objectStore.local.existingClaim is required');
  });

  it('mounts Vault and Vertex credentials only when their real providers are selected', () => {
    const outcome = render({
      set: {
        'studioVault.provider': 'hashicorp',
        'studioVault.address': 'https://vault.internal.example',
        'studioGateway.provider': 'vertex',
        'studioGateway.endpoint': 'r2d2.internal.example',
        'studioGateway.project': 'checks',
        'studioGateway.location': 'us-east1',
        'studioGateway.model': 'gemini-3.8-flash',
        'studioGateway.credentialsMode': 'service-account-file',
        'studioGateway.credentialsSecret': 'studio-gateway',
      },
    });
    const apiPod = podSpec(deploymentNamed(outcome, '-api'));
    const workerPod = podSpec(deploymentNamed(outcome, '-worker'));
    const apiMounts = soleContainer(deploymentNamed(outcome, '-api')).volumeMounts ?? [];
    const workerMounts = soleContainer(deploymentNamed(outcome, '-worker')).volumeMounts ?? [];

    expect(apiPod.volumes?.map((volume) => volume.name)).toContain('studio-vault-token');
    expect(workerPod.volumes?.map((volume) => volume.name)).toContain('studio-vault-token');
    expect(apiMounts.map((mount) => mount.name)).toContain('studio-gateway-credentials');
    // The worker builds the same Vertex transport (the readiness guard runs in every pod), so the
    // key file is mounted there too.
    expect(workerMounts.map((mount) => mount.name)).toContain('studio-gateway-credentials');
    expect(workerPod.volumes?.map((volume) => volume.name)).toContain('studio-gateway-credentials');
  });

  it.each([
    // values-dev.yaml joined on the user decision of 2026-11-02 (same Studio flexibility everywhere).
    ['values-dev.yaml', 'checks-studio-vertex-dev'],
    ['values-uat.yaml', 'checks-studio-vertex-uat'],
    ['values-prod.yaml', 'checks-studio-vertex-prod'],
  ] as const)(
    '%s selects Vertex Gemini Flash and environment-owned routing configuration',
    (valuesFile, configMapName) => {
      const outcome = render({ valuesFile });
      const apiContainer = soleContainer(deploymentNamed(outcome, '-api'));
      const api = envValues(apiContainer);

      expect(api.STUDIO_GATEWAY_PROVIDER).toBe('vertex');
      expect(api.STUDIO_GATEWAY_MODEL).toBe('gemini-3.8-flash');
      expect(api.STUDIO_GATEWAY_CREDENTIALS_MODE).toBe('application-default');
      expect(apiSpringProperties(outcome)['checks.sources.UI_TEST']).toBe('true');

      const gatewayEnv = new Map((apiContainer.env ?? []).map((entry) => [entry.name, entry]));
      for (const [name, key] of [
        ['STUDIO_GATEWAY_ENDPOINT', 'endpoint'],
        ['STUDIO_GATEWAY_PROJECT', 'project'],
        ['STUDIO_GATEWAY_LOCATION', 'location'],
      ] as const) {
        expect(gatewayEnv.get(name)?.value).toBeUndefined();
        expect(gatewayEnv.get(name)?.valueFrom?.configMapKeyRef).toEqual({
          name: configMapName,
          key,
        });
      }
    },
  );

  it.each([
    ['values-dev.yaml', 'checks-studio-vertex-dev'],
    ['values-uat.yaml', 'checks-studio-vertex-uat'],
    ['values-prod.yaml', 'checks-studio-vertex-prod'],
  ] as const)(
    '%s gives the worker the API\'s Vertex gateway: StudioGatewayConfig refuses to start any pod without it',
    (valuesFile, configMapName) => {
      const outcome = render({ valuesFile });
      const api = soleContainer(deploymentNamed(outcome, '-api'));
      const worker = soleContainer(deploymentNamed(outcome, '-worker'));
      const gateway = (container: typeof api) =>
        (container.env ?? []).filter((entry) => entry.name.startsWith('STUDIO_GATEWAY_'));

      expect(envValues(worker).STUDIO_GATEWAY_PROVIDER).toBe('vertex');
      expect(gateway(worker).length).toBeGreaterThanOrEqual(7);
      // Identical to the API's: provider, model, credentials and the three ConfigMap references.
      expect(gateway(worker)).toEqual(gateway(api));
      const byName = new Map(gateway(worker).map((entry) => [entry.name, entry]));
      for (const [name, key] of [
        ['STUDIO_GATEWAY_ENDPOINT', 'endpoint'],
        ['STUDIO_GATEWAY_PROJECT', 'project'],
        ['STUDIO_GATEWAY_LOCATION', 'location'],
      ] as const) {
        expect(byName.get(name)?.valueFrom?.configMapKeyRef).toEqual({ name: configMapName, key });
      }
    },
  );

  it.each([
    ['values-uat.yaml', 'worker.springProfile', 'worker,prod', 'requires studioGateway.environment=production'],
    ['values-prod.yaml', 'worker.springProfile', 'worker,staging', 'requires studioGateway.environment=staging'],
  ] as const)(
    '%s: the environment label cannot be weakened through the worker profile (%s=%s)',
    (valuesFile, key, profile, message) => {
      const outcome = renderOutcome({ valuesFile, args: ['--set-string', `${key}=${profile.replace(',', '\\,')}`] });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain(message);
    },
  );

  it.each(['values-uat.yaml', 'values-prod.yaml'])(
    '%s: the worker cannot disable UI_TEST to dodge the gateway it now renders',
    (valuesFile) => {
      const outcome = renderOutcome({
        valuesFile,
        args: ['--set-string', 'worker.configOverrides.checks\\.sources\\.UI_TEST=false'],
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('worker.springProfile');
      expect(outcome.error).toContain('must not set checks.sources.UI_TEST=false');
    },
  );

  it.each(['values-uat.yaml', 'values-prod.yaml'])(
    '%s rejects disabled translation',
    (valuesFile) => {
      const outcome = renderOutcome({ valuesFile, set: { 'studioGateway.provider': 'disabled' } });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('requires studioGateway.provider=vertex');
    },
  );

  it('fails a Vertex selection that provides neither direct routing values nor a ConfigMap', () => {
    const outcome = renderOutcome({
      set: {
        'studioGateway.provider': 'vertex',
        'studioGateway.vertexConfigMap.name': '',
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(
      'studioGateway.endpoint or studioGateway.vertexConfigMap.name is required',
    );
  });

  it.each(['values-uat.yaml', 'values-prod.yaml'])(
    '%s cannot disable UI_TEST to bypass the application readiness guard',
    (valuesFile) => {
      const outcome = renderOutcome({
        valuesFile,
        args: ['--set-string', 'backend.configOverrides.checks\\.sources\\.UI_TEST=false'],
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('requires checks.sources.UI_TEST=true');
    },
  );

  it.each([
    ['values-uat.yaml', 'local'],
    ['values-prod.yaml', 'local'],
  ] as const)(
    '%s cannot relabel a deployed Spring profile as %s to weaken provider guards',
    (valuesFile, environment) => {
      const outcome = renderOutcome({
        valuesFile,
        set: {
          'studioGateway.environment': environment,
          'studioGateway.provider': 'disabled',
        },
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('environment label cannot weaken deployed Studio guards');
    },
  );
});

// Only facts with dedicated studioGateway values are reserved. Transport budgets and provider
// feature switches deliberately remain ordinary Spring configuration.
const GATEWAY_CHART_PROPERTIES = [
  'studio.gateway.provider',
  'studio.gateway.endpoint',
  'studio.gateway.project',
  'studio.gateway.location',
  'studio.gateway.model',
  'studio.gateway.credentials.mode',
  'studio.gateway.credentials.service-account-key-file',
  // application.yml resolves this differently named placeholder for that same key-file fact.
  'STUDIO_GATEWAY_CREDENTIALS_KEY_FILE',
] as const;

function gatewayOverride(
  property: string,
  shape: 'flat' | 'nested' | 'relaxed',
): { properties: Record<string, unknown>; path: string } {
  // Express the placeholder alias as a dotted path for the nested case; normalization is the
  // chart's existing contract, not a claim about Spring binding every spelling in this matrix.
  const dotted = property === 'STUDIO_GATEWAY_CREDENTIALS_KEY_FILE'
    ? 'studio.gateway.credentials.key-file' : property;
  if (shape === 'nested') {
    const parts = dotted.split('.');
    const leaf = parts.pop();
    if (leaf === undefined) throw new Error('a gateway override must name a property');
    const properties = parts.reduceRight<Record<string, unknown>>(
      (value, key) => ({ [key]: value }),
      { [leaf]: 'override' },
    );
    return { properties, path: dotted };
  }
  const path = shape === 'relaxed' ? dotted.replaceAll('.', '_').replaceAll('-', '_').toUpperCase() : property;
  return { properties: { [path]: 'override' }, path };
}

const gatewayScratch: string[] = [];
afterAll(() => {
  for (const directory of gatewayScratch) rmSync(directory, { recursive: true, force: true });
});

/** Remove only exact new guard tokens in a private chart copy; never alter the real template. */
function withoutGatewayTokens(properties: readonly string[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'studio-gateway-guard-'));
  gatewayScratch.push(directory);
  const chart = join(directory, 'chart');
  cpSync(CHART_DIR, chart, { recursive: true });
  const file = join(chart, 'templates', '_helpers.tpl');
  let text = readFileSync(file, 'utf8');
  for (const property of properties) {
    const token = `"${property.toLowerCase().replace(/[^a-z0-9]/gu, '')}"`;
    expect(text.split(token).length - 1, `mutation anchor ${token}`).toBe(1);
    text = text.replace(token, '');
  }
  writeFileSync(file, text, 'utf8');
  return chart;
}

describe('gateway chart-owned facts in mounted Spring configuration', () => {
  for (const component of ['backend', 'worker'] as const) {
    for (const shape of ['flat', 'nested', 'relaxed'] as const) {
      it.each(GATEWAY_CHART_PROPERTIES)(`${component} rejects ${shape} %s`, (property) => {
        const { properties, path } = gatewayOverride(property, shape);
        const outcome = renderOutcome({
          args: ['--set-json', `${component}.configOverrides=${JSON.stringify(properties)}`],
        });
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toContain(
          `configOverrides property ${path} is managed by the chart`,
        );
      });
    }

    it.each(GATEWAY_CHART_PROPERTIES.slice(0, 7))(
      `${component} keeps legacy compile spelling %s reserved`,
      (property) => {
        const legacy = property.replace('studio.gateway.', 'studio.compile.gateway.');
        const outcome = renderOutcome({
          args: ['--set-json', `${component}.configOverrides=${JSON.stringify({ [legacy]: 'override' })}`],
        });
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toContain(
          `configOverrides property ${legacy} is managed by the chart`,
        );
      },
    );

    it(`${component} keeps gateway tuning and custom properties available`, () => {
      const properties = {
        'studio.gateway.request-timeout': '120s',
        'studio.gateway.max-concurrency': '3',
        'studio.gateway.max-input-bytes': '131072',
        'studio.gateway.max-output-bytes': '131072',
        'studio.gateway.max-output-tokens': '16384',
        'studio.gateway.thinking-level': 'MEDIUM',
        'studio.gateway.provider-features.system-instruction': 'false',
        'studio.gateway.provider-features.thinking-config': 'false',
        'custom.gateway-note': 'ordinary non-secret configuration',
      };
      const outcome = render({
        args: ['--set-json', `${component}.configOverrides=${JSON.stringify(properties)}`],
      });
      const role = component === 'backend' ? 'api' : 'worker';
      expect(mountedSpringProperties(outcome, role)).toMatchObject(properties);
    });
  }

  it.each(GATEWAY_CHART_PROPERTIES)('mutation: removing only %s defeats its refusal', (property) => {
    const chartDir = withoutGatewayTokens([property]);
    for (const component of ['backend', 'worker']) {
      const { properties } = gatewayOverride(property, 'flat');
      const outcome = renderOutcome({
        chartDir,
        args: ['--set-json', `${component}.configOverrides=${JSON.stringify(properties)}`],
      });
      expect(outcome.ok, outcome.error).toBe(true);
    }
  });

  for (const credentialsMode of ['application-default', 'service-account-file']) {
    it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
      `%s: valid ${credentialsMode} manifests stay byte-identical after adding the guards`,
      (_label, valuesFile) => {
        const chartDir = withoutGatewayTokens(GATEWAY_CHART_PROPERTIES);
        const options = {
          valuesFile,
          set: {
            'studioGateway.credentialsMode': credentialsMode,
            'studioGateway.credentialsSecret': 'test-only-gateway',
          },
        };
        expect(render(options).raw).toBe(render({ ...options, chartDir }).raw);
      },
    );
  }
});

describe('frontend run-time configuration (window.__CHECKS_CONFIG__ from /config.js)', () => {
  // The same URLs the values files already gave REACT_APP_API_BASE_URL.
  it.each([
    [null, 'http://checks-api.dev.citi.com/api/v1'],
    ['values-dev.yaml', 'https://checks-api.dev.citi.com/api/v1'],
    ['values-uat.yaml', 'https://checks-api.uat.citi.com/api/v1'],
    ['values-prod.yaml', 'https://checks-api.citi.com/api/v1'],
  ] as const)('%s renders a config.js carrying %s and mounts it at the configured path', (valuesFile, apiBaseUrl) => {
    const outcome = render({ valuesFile });
    const deployment = deploymentNamed(outcome, '-frontend');
    const pod = podSpec(deployment);
    const container = soleContainer(deployment);

    const volume = pod.volumes?.find((entry) => entry.name === 'runtime-config');
    const configMap = byKind(outcome, 'ConfigMap').find(
      (item) => item.metadata?.name === volume?.configMap?.name,
    );
    expect(configMap, 'the frontend runtime-config ConfigMap is rendered').toBeDefined();
    const script = configMap?.data?.['config.js'] ?? '';
    expect(script).toContain(`apiBaseUrl: ${JSON.stringify(apiBaseUrl)},`);
    expect(script).toContain('window.__CHECKS_CONFIG__ = {');

    // The legacy env still names the same URL, so the two cannot say different things.
    const env = byKind(outcome, 'ConfigMap').find((item) => item.metadata?.name?.endsWith('-frontend-config'));
    expect(env?.data?.REACT_APP_API_BASE_URL).toBe(apiBaseUrl);

    const mount = container.volumeMounts?.find((entry) => entry.name === 'runtime-config');
    expect(mount?.mountPath).toBe('/usr/share/nginx/html/config.js');
    expect(mount?.subPath).toBe('config.js');
    expect(mount?.readOnly).toBe(true);
  });

  it('JSON-encodes the values, and leaves debugMode undefined unless set', () => {
    const hostile = render({
      args: ['--set-string', 'frontend.runtimeConfig.apiBaseUrl=x";alert(1)//', '--set', 'frontend.runtimeConfig.debugMode=true'],
    });
    const script = byKind(hostile, 'ConfigMap').find((item) => item.metadata?.name?.endsWith('-runtime-config'))
      ?.data?.['config.js'] ?? '';
    expect(script).toContain('apiBaseUrl: "x\\";alert(1)//",');
    expect(script).toContain('debugMode: true,');

    const unset = render();
    const defaults = byKind(unset, 'ConfigMap').find((item) => item.metadata?.name?.endsWith('-runtime-config'))
      ?.data?.['config.js'] ?? '';
    expect(defaults).toContain('debugMode: undefined,');
  });

  it('renders no ConfigMap, volume or mount when runtimeConfig.enabled is false', () => {
    const outcome = render({ set: { 'frontend.runtimeConfig.enabled': 'false' } });
    expect(byKind(outcome, 'ConfigMap').some((item) => item.metadata?.name?.endsWith('-runtime-config'))).toBe(false);
    expect(podSpec(deploymentNamed(outcome, '-frontend')).volumes ?? []).toEqual([]);
    expect(soleContainer(deploymentNamed(outcome, '-frontend')).volumeMounts ?? []).toEqual([]);
  });
});
