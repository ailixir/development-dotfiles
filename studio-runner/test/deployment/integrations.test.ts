import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  byKind,
  deploymentNamed,
  envValues,
  podSpec,
  render,
  renderOutcome,
  runnerDeployment,
  soleContainer,
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
    expect(workerMounts.map((mount) => mount.name)).not.toContain('studio-gateway-credentials');
  });

  it.each([
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
