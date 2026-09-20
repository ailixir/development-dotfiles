import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config.js';
import { deploymentNamed, envValues, render, renderOutcome, runnerDeployment, soleContainer, VALUE_SETS } from './helm.js';
import type { Container } from './helm.js';

function identity(container: Container, name: string): unknown {
  return container.env?.find((entry) => entry.name === name)?.valueFrom?.secretKeyRef;
}

describe('Studio integration wiring', () => {
  it.each(VALUE_SETS)('connects API, worker and runner for %s', (valuesFile) => {
    const outcome = render({ valuesFile, set: {
      'objectStore.bucket': 'test-studio-evidence', 'objectStore.region': 'us-east-1',
      'studioRunner.service.port': '8182', 'backend.service.port': '8180',
    } });
    const runner = soleContainer(runnerDeployment(outcome));
    expect(runner.readinessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/ready']);
    expect(runner.livenessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/health']);
    const env = envValues(runner);
    const config = loadConfig({ ...env, STUDIO_RUNNER_SERVICE_IDENTITY: 'runner-identity', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback-identity' });
    expect(config.objectStoreProvider).toBe('s3');
    expect(config.objectStoreBucket).toBe('test-studio-evidence');
    expect(config.objectStoreRegion).toBe('us-east-1');
    expect(env['STUDIO_RUNNER_OBJECT_STORE_DIR']).toBeUndefined();
    const runnerName = runnerDeployment(outcome).metadata?.name ?? '';
    const apiName = deploymentNamed(outcome, '-api').metadata?.name ?? '';
    expect(config.callbackBaseUrl).toBe(`http://${apiName}:8180`);
    expect(identity(runner, 'STUDIO_RUNNER_SERVICE_IDENTITY')).toBeDefined();
    expect(identity(runner, 'STUDIO_RUNNER_CALLBACK_IDENTITY')).toBeDefined();
    for (const suffix of ['-api', '-worker']) {
      const consumer = soleContainer(deploymentNamed(outcome, suffix));
      const values = envValues(consumer);
      expect(values['STUDIO_RUNNER_BASE_URL']).toBe(`http://${runnerName}:8182`);
      expect(identity(consumer, 'STUDIO_RUNNER_SERVICE_TOKEN')).toEqual(identity(runner, 'STUDIO_RUNNER_SERVICE_IDENTITY'));
      expect(identity(consumer, 'STUDIO_CALLBACK_SERVICE_TOKEN')).toEqual(identity(runner, 'STUDIO_RUNNER_CALLBACK_IDENTITY'));
      expect(values['STUDIO_STORAGE_PROVIDER']).toBe('s3');
      expect(values['STUDIO_STORAGE_BUCKET']).toBe(config.objectStoreBucket);
      expect(values['STUDIO_STORAGE_REGION']).toBe(config.objectStoreRegion);
      expect(consumer.volumeMounts).toContainEqual(expect.objectContaining({ mountPath: values['STUDIO_STORAGE_CREDENTIALS_DIRECTORY'], readOnly: true }));
    }
    expect(runner.volumeMounts).toContainEqual(expect.objectContaining({ mountPath: config.objectStoreCredentialsDirectory, readOnly: true }));
  });
  it('refuses filesystem storage in the remote chart', () => {
    const outcome = renderOutcome({ set: { 'objectStore.provider': 'filesystem' } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('filesystem is local only');
  });
  it('cannot override the provider through a duplicate runner environment entry', () => {
    const outcome = renderOutcome({ set: { 'studioRunner.runnerEnv.STUDIO_RUNNER_OBJECT_STORE_PROVIDER': 'filesystem' } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('managed by the chart');
  });
  it('unconfigured remote storage is rejected by the runner loader', () => {
    const env = envValues(soleContainer(runnerDeployment(render())));
    expect(() => loadConfig({ ...env, STUDIO_RUNNER_SERVICE_IDENTITY: 'runner-identity', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback-identity' })).toThrow('S3 requires');
  });
});
