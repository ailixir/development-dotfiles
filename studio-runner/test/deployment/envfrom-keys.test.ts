/** Story 10.27: lossless mounted Spring configuration and valid envFrom names. */
import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { byKind, CHART_DIR, deploymentNamed, envValues, one, podSpec, render, renderOutcome, soleContainer, VALUE_SETS, valueSetName } from './helm.js';
import type { Container, K8sDocument, RenderOutcome } from './helm.js';

/**
 * The name a Kubernetes environment variable must have.
 *
 * Kubernetes validates `envFrom`-derived names with `IsCEnvIdentifier`; a key that fails it is
 * skipped and reported as an `InvalidVariableNames` event. This is the same expression AC-18
 * names: `[A-Za-z_][A-Za-z0-9_]*`.
 */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface Violation {
  readonly valueSet: string;
  readonly configMap: string;
  readonly consumedBy: string;
  readonly key: string;
}

function containersOf(document: K8sDocument): readonly Container[] {
  const spec = document.spec as { template?: { spec?: { containers?: readonly Container[] } } } | undefined;
  return spec?.template?.spec?.containers ?? [];
}

/**
 * Every `envFrom`-consumed ConfigMap key in the rendered manifest that cannot become an
 * environment variable.
 *
 * Deliberately driven from the **consumer** side: it walks the containers, follows each
 * `envFrom: configMapRef` to the ConfigMap that render produced, and checks that ConfigMap's keys.
 * Walking the ConfigMaps instead would report keys nothing consumes — and would miss the one thing
 * that matters, which is that a container believes it received them.
 */
export function envFromViolations(outcome: RenderOutcome, valueSet: string): Violation[] {
  const configMaps = new Map<string, Record<string, string>>();
  for (const document of byKind(outcome, 'ConfigMap')) {
    configMaps.set(document.metadata?.name ?? '', document.data ?? {});
  }

  const violations: Violation[] = [];
  for (const document of byKind(outcome, 'Deployment')) {
    for (const container of containersOf(document)) {
      for (const source of container.envFrom ?? []) {
        const reference = source['configMapRef'] as { name?: string } | undefined;
        const name = reference?.name;
        if (name === undefined) continue;
        const data = configMaps.get(name);
        if (data === undefined) {
          // A container consuming a ConfigMap this chart does not render is a different defect,
          // and a silent one: every key would be missing rather than some.
          violations.push({
            valueSet,
            configMap: name,
            consumedBy: `${document.metadata?.name ?? ''}/${container.name ?? ''}`,
            key: '<the ConfigMap itself is not rendered by this chart>',
          });
          continue;
        }
        for (const key of Object.keys(data)) {
          if (!ENV_NAME.test(key)) {
            violations.push({
              valueSet,
              configMap: name,
              consumedBy: `${document.metadata?.name ?? ''}/${container.name ?? ''}`,
              key,
            });
          }
        }
      }
    }
  }
  return violations;
}

function describeViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => `  ${v.valueSet}: ${v.configMap}[${v.key}] → ${v.consumedBy}`)
    .join('\n');
}

function springProperties(outcome: RenderOutcome, role: 'api' | 'worker'): Record<string, unknown> {
  const deployment = deploymentNamed(outcome, `-${role}`);
  const container = soleContainer(deployment);
  const mount = container.volumeMounts?.find((entry) => entry.name === 'spring-config');
  expect(mount).toMatchObject({ mountPath: '/etc/put-checks/config', readOnly: true });
  expect(envValues(container)['SPRING_CONFIG_ADDITIONAL_LOCATION']).toBe(
    'file:/etc/put-checks/config/application.yaml',
  );
  const volume = podSpec(deployment).volumes?.find((entry) => entry.name === mount?.name);
  const configMap = one(byKind(outcome, 'ConfigMap').filter((entry) => entry.metadata?.name === volume?.configMap?.name), 'mounted Spring config');
  expect(container.envFrom?.some((source) =>
    (source.configMapRef as { name?: string } | undefined)?.name === configMap.metadata?.name,
  )).toBe(false);
  const yaml = configMap.data?.['application.yaml'];
  expect(typeof yaml).toBe('string');
  return parse(yaml ?? '') as Record<string, unknown>;
}

interface ChartValues {
  backend: { configOverrides: Record<string, unknown> };
  worker: { configOverrides: Record<string, unknown> };
}
const base = parse(readFileSync(join(CHART_DIR, 'values.yaml'), 'utf8')) as ChartValues;

describe('AC-18 — envFrom names and lossless Spring configuration delivery', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);
    it(`${label}: all consumed envFrom keys are valid environment names`, () => {
      const violations = envFromViolations(render({ valuesFile }), label);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
    it(`${label}: every configured Spring key reaches the read-only mounted source unchanged`, () => {
      const overlay = valuesFile === null ? undefined : parse(readFileSync(join(CHART_DIR, valuesFile), 'utf8')) as Partial<ChartValues>;
      const outcome = render({ valuesFile });
      for (const [component, role] of [['backend', 'api'], ['worker', 'worker']] as const) {
        const expected = { ...base[component].configOverrides, ...overlay?.[component]?.configOverrides };
        expect(Object.keys(expected).length).toBeGreaterThan(0);
        expect(springProperties(outcome, role)).toEqual(expected);
      }
    });
  }
  for (const property of ['studio.sse.heartbeat', 'checks.studio.qa-probe-7255']) {
    it(`new dotted property ${property} is delivered without env-name conversion`, () => {
      const outcome = render({ args: ['--set-string', `backend.configOverrides.${property.replaceAll('.', '\\.')}=probe-value`] });
      expect(envFromViolations(outcome, 'mutation')).toEqual([]);
      expect(springProperties(outcome, 'api')[property]).toBe('probe-value');
    });
  }
  it('detects invalid envFrom names outside any Studio prefix (negative control)', () => {
    const outcome = render({ args: ['--set-string', 'frontend.env.checks\\.qa-probe=1'] });
    const violations = envFromViolations(outcome, 'negative-control');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.key).toBe('checks.qa-probe');
  });
  it('preserves nested maps, lists and escaped scalar content in the mounted source', () => {
    const outcome = render({ args: ['--set-json', 'backend.configOverrides={"custom.map":{"HTTP":"a:b # quoted"},"custom.list":["one","two"],"custom.enabled":true}'] });
    expect(springProperties(outcome, 'api')).toMatchObject({
      'custom.map': { HTTP: 'a:b # quoted' }, 'custom.list': ['one', 'two'], 'custom.enabled': true,
    });
  });
  for (const component of ['backend', 'worker']) {
    it(`${component}: mounted-source selector cannot be replaced through generic environment`, () => {
      const outcome = renderOutcome({ set: { [`${component}.env.SPRING_CONFIG_ADDITIONAL_LOCATION`]: 'file:/missing.yaml' } });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('SPRING_CONFIG_ADDITIONAL_LOCATION is managed by the chart');
    });
    it(`${component}: mounted-source selector cannot be replaced through secret environment`, () => {
      const outcome = renderOutcome({ args: ['--set-json', `${component}.envFromSecrets=[{"secretName":"probe","keys":["SPRING_CONFIG_ADDITIONAL_LOCATION"]}]`] });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('SPRING_CONFIG_ADDITIONAL_LOCATION is managed by the chart');
    });
  }
  it('changing mounted properties changes the workload rollout checksum', () => {
    const original = render();
    const changed = render({ args: ['--set-string', 'backend.configOverrides.checks\\.scheduling\\.min-interval-seconds=123'] });
    const annotation = (outcome: RenderOutcome): unknown => (deploymentNamed(outcome, '-api').spec?.template as { metadata: { annotations: Record<string, unknown> } }).metadata.annotations['checksum/config'];
    expect(annotation(original)).not.toBe(annotation(changed));
  });
  for (const property of [
    'checks.cors.allowed-origins', 'checks.core-service.base-url',
    'checks.security.bypass.core-service', 'checks.security.bypass.identity-headers',
    'checks.security.bypass.csi-read', 'studio.execution.enabled',
    'studio.execution.dispatcher.enabled', 'studio.execution.evidence-retention',
    'studio.execution.callback.service-token', 'studio.execution.sse.heartbeat',
    'studio.execution.sse.lifetime', 'studio.runner.base-url',
    'studio.runner.service-identity-token', 'studio.storage.provider', 'studio.storage.bucket',
    'studio.storage.region', 'studio.storage.credentials-directory', 'spring.profiles.active',
    'spring.config.import',
  ]) {
    it(`additional properties cannot override chart-managed ${property}`, () => {
      for (const component of ['backend', 'worker']) {
        const outcome = renderOutcome({ args: ['--set-string', `${component}.configOverrides.${property.replaceAll('.', '\\.')}=override`] });
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toContain('is managed by the chart');
      }
    });
  }
  it('nested and relaxed property spellings cannot bypass the chart-managed guards', () => {
    for (const value of [
      '{"studio":{"execution":{"dispatcher":{"enabled":true}}}}',
      '{"checks.security.bypass.identityHeaders":true}',
      '{"studio.storage.credentialsDirectory":"/override"}',
    ]) {
      const outcome = renderOutcome({ args: ['--set-json', `backend.configOverrides=${value}`] });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('is managed by the chart');
    }
  });

  it('all profile activation mechanisms are reserved across flat and nested properties', () => {
    for (const component of ['backend', 'worker']) {
      for (const values of [
        '{"spring.profiles.include":"local"}',
        '{"spring.profiles.default":"test"}',
        '{"spring.profiles.group.prod":["local"]}',
        '{"spring":{"profiles":{"group":{"prod":["local"]}}}}',
        '{"SPRING_PROFILES_INCLUDE":"local"}',
      ]) {
        expect(renderOutcome({ args: ['--set-json', `${component}.configOverrides=${values}`] }).ok).toBe(false);
      }
    }
  });
  it('environment and secret selectors cannot activate development profiles indirectly', () => {
    for (const component of ['backend', 'worker']) {
      for (const key of ['SPRING_PROFILES_ACTIVE', 'SPRING_PROFILES_INCLUDE', 'SPRING_PROFILES_DEFAULT',
        'SPRING_PROFILES_GROUP_PROD', 'SPRING_APPLICATION_JSON', 'SPRING_CONFIG_IMPORT', 'SPRING_CONFIG_LOCATION']) {
        expect(renderOutcome({ args: ['--set-string', `${component}.env.${key}=local`] }).ok).toBe(false);
        expect(renderOutcome({ args: ['--set-json', `${component}.envFromSecrets=[{"secretName":"probe","keys":["${key}"]}]`] }).ok).toBe(false);
      }
      expect(renderOutcome({ args: ['--set-string', `${component}.springProfile=local`] }).ok).toBe(false);
      expect(renderOutcome({ args: ['--set-string', `${component}.springProfile=test`] }).ok).toBe(false);
    }
  });

});
