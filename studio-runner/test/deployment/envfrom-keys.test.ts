/**
 * Every ConfigMap key consumed through `envFrom` must be a valid environment-variable name.
 * Spring Boot's relaxed binding accepts the uppercase underscore form, so the chart converts
 * operator-friendly dotted `configOverrides` keys at render time and fails on invalid or colliding
 * results. These tests exercise the rendered manifest, not the source values.
 */
import { describe, expect, it } from 'vitest';

import { byKind, render, renderOutcome, VALUE_SETS, valueSetName } from './helm.js';
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

describe('AC-18 — every envFrom-consumed key is a valid environment-variable name', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: every consumed ConfigMap key is a valid environment-variable name`, () => {
      const violations = envFromViolations(render({ valuesFile }), label);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    it(`${label}: dotted properties are delivered with Spring-compatible relaxed-binding names`, () => {
      const outcome = render({ valuesFile });
      const maps = byKind(outcome, 'ConfigMap');
      const api = maps.find((item) => (item.metadata?.name ?? '').endsWith('-api-config'));
      const worker = maps.find((item) => (item.metadata?.name ?? '').endsWith('-worker-config'));
      expect(api?.data?.SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE).toBeDefined();
      expect(api?.data?.CHECKS_SCHEDULING_MININTERVALSECONDS).toBeDefined();
      expect(worker?.data?.CHECKS_EXECUTOR_MAXCONCURRENCY).toBeDefined();
      expect(worker?.data?.CHECKS_EXECUTOR_SOURCELIMITS_UI_TEST).toBeDefined();
      expect(worker?.data?.CHECKS_SCHEDULING_SHUTDOWNTIMEOUTSEC).toBeDefined();
    });
  }

  it('converts a newly added dotted property inside the rendered measurement window', () => {
    const outcome = render({
      args: ['--set', 'backend.configOverrides.checks\\.studio\\.qa-probe-7255=1'],
    });
    const api = byKind(outcome, 'ConfigMap').find((item) =>
      (item.metadata?.name ?? '').endsWith('-api-config'),
    );
    expect(api?.data?.CHECKS_STUDIO_QAPROBE7255).toBe('1');
    expect(envFromViolations(outcome, 'mutated')).toEqual([]);
  });

  it('fails the render when two source properties collapse to the same environment name', () => {
    const outcome = renderOutcome({
      args: [
        '--set',
        'backend.configOverrides.checks\\.studio\\.qa-probe=1',
        '--set',
        'backend.configOverrides.checks\\.studio\\.qaprobe=2',
      ],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain(
      'collides with another rendered environment variable "CHECKS_STUDIO_QAPROBE"',
    );
  });

  for (const collision of [
    {
      label: 'the API profile emitted explicitly by the Deployment',
      argument: 'backend.configOverrides.spring\\.profiles\\.active=evil',
      expected: 'SPRING_PROFILES_ACTIVE',
    },
    {
      label: 'the worker management port emitted explicitly by the Deployment',
      argument: 'worker.configOverrides.management\\.server\\.port=9999',
      expected: 'MANAGEMENT_SERVER_PORT',
    },
    {
      label: 'an API value from backend.env',
      argument: 'backend.configOverrides.java\\.opts=evil',
      expected: 'JAVA_OPTS',
    },
    {
      label: 'a worker value derived from a Secret',
      argument: 'worker.configOverrides.spring\\.datasource\\.url=evil',
      expected: 'SPRING_DATASOURCE_URL',
    },
  ] as const) {
    it(`fails the render when configOverrides collides with ${collision.label}`, () => {
      const outcome = renderOutcome({ args: ['--set', collision.argument] });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain(
        `collides with another rendered environment variable "${collision.expected}"`,
      );
    });
  }
});
