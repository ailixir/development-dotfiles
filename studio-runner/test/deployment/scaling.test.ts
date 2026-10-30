/**
 * Studio v1 WP7 (decision D3): how the runner scales, on the rendered manifest.
 *
 * Static `replicaCount: 2` by default; a KEDA `ScaledObject` driven by the worker's
 * `studio_dispatch_backlog` gauge, rendered only when `studioRunner.autoscaling.enabled`; a
 * PodDisruptionBudget; and no CPU-based HorizontalPodAutoscaler for the runner in any configuration.
 *
 * Same rule as `chart.test.ts`: every assertion reads `helm template` output, and a bound is written
 * as a comparison between two values in the same rendered manifest (the cooldown against the
 * runner's rendered run deadline, the scale target against the rendered Deployment's name), never
 * against a constant restated here. Each criterion names the render mutation that turns it red.
 */
import { describe, expect, it } from 'vitest';

import {
  byKind,
  envValues,
  one,
  podSpec,
  render,
  renderOutcome,
  runnerDeployment,
  RUNNER_FRAGMENT,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';
import type { K8sDocument, RenderOutcome } from './helm.js';

/** Turns autoscaling on. The Prometheus address is required and has no default by design. */
const AUTOSCALING_ON: Readonly<Record<string, string>> = {
  'studioRunner.autoscaling.enabled': 'true',
  'studioRunner.autoscaling.prometheus.serverAddress': 'http://prometheus.monitoring:9090',
};

interface ScaledObjectSpec {
  readonly scaleTargetRef?: { readonly kind?: string; readonly name?: string };
  readonly minReplicaCount?: number;
  readonly maxReplicaCount?: number;
  readonly cooldownPeriod?: number;
  readonly advanced?: {
    readonly horizontalPodAutoscalerConfig?: {
      readonly behavior?: { readonly scaleDown?: { readonly stabilizationWindowSeconds?: number } };
    };
  };
  readonly triggers?: readonly {
    readonly type?: string;
    readonly metricType?: string;
    readonly metadata?: Record<string, string>;
  }[];
}

function scaledObjects(outcome: RenderOutcome): readonly K8sDocument[] {
  return byKind(outcome, 'ScaledObject');
}

function runnerScaledObject(outcome: RenderOutcome): ScaledObjectSpec {
  return one(scaledObjects(outcome), 'runner ScaledObject').spec as ScaledObjectSpec;
}

/** The runner's run deadline in seconds, read from the env the rendered pod actually receives. */
function renderedRunDeadlineSeconds(outcome: RenderOutcome): number {
  const env = envValues(soleContainer(runnerDeployment(outcome)));
  const ms = Number(env['STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS']);
  expect(Number.isFinite(ms), 'the runner renders no STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS').toBe(true);
  return Math.floor(ms / 1000);
}

/** Every HPA that targets the runner, by its scale target rather than by its own name. */
function runnerHpas(outcome: RenderOutcome): readonly K8sDocument[] {
  return byKind(outcome, 'HorizontalPodAutoscaler').filter((hpa) => {
    const target = (hpa.spec as { scaleTargetRef?: { name?: string } } | undefined)?.scaleTargetRef;
    return (target?.name ?? '').includes(RUNNER_FRAGMENT) || JSON.stringify(hpa).includes(RUNNER_FRAGMENT);
  });
}

/**
 * `AUTOSCALING_ON`, with guided learning off for the value set that ships it on (`values-uat.yaml`,
 * STUDIO-FLEX-001 item 5): guided mode and the autoscaler are exclusive, and the exclusion is asserted
 * by its own block below.
 */
function autoscalingOn(valuesFile: string | null): Readonly<Record<string, string>> {
  return valuesFile === 'values-uat.yaml' ? { ...AUTOSCALING_ON, 'studioRunner.guided.enabled': 'false' } : AUTOSCALING_ON;
}

/** Static replicas per value set: two, except UAT, whose guided learning needs exactly one pod (A2.6). */
function staticReplicas(valuesFile: string | null): number {
  return valuesFile === 'values-uat.yaml' ? 1 : 2;
}

const EACH_SET = VALUE_SETS.map((file) => [valueSetName(file), file] as const);

describe('WP7 — the default: static pods (two; one where guided learning is on) and no autoscaler', () => {
  it.each(EACH_SET)('%s renders its static replicas, no ScaledObject and no runner HPA', (_label, valuesFile) => {
    const outcome = render({ valuesFile });

    expect((runnerDeployment(outcome).spec as { replicas?: number }).replicas).toBe(staticReplicas(valuesFile));
    expect(scaledObjects(outcome), 'a ScaledObject rendered while autoscaling is off').toEqual([]);
    expect(runnerHpas(outcome), 'an HPA targets the runner').toEqual([]);
  });

  it('render mutation: turning autoscaling on makes the ScaledObject appear', () => {
    // The control for the absence above: the same render with one key flipped is not empty, so the
    // empty result is about the switch and not about a template that never renders.
    expect(scaledObjects(render({ set: AUTOSCALING_ON }))).toHaveLength(1);
  });
});

describe('WP7 — autoscaling on: a backlog trigger, never CPU', () => {
  it.each(EACH_SET)('%s renders one ScaledObject aimed at the runner Deployment', (_label, valuesFile) => {
    const outcome = render({ valuesFile, set: autoscalingOn(valuesFile) });
    const spec = runnerScaledObject(outcome);

    expect(spec.scaleTargetRef?.kind).toBe('Deployment');
    expect(spec.scaleTargetRef?.name).toBe(runnerDeployment(outcome).metadata?.name);
  });

  it.each(EACH_SET)('%s triggers on the dispatch backlog at about one queued run per pod', (_label, valuesFile) => {
    const spec = runnerScaledObject(render({ valuesFile, set: autoscalingOn(valuesFile) }));
    const trigger = one((spec.triggers ?? []) as unknown as K8sDocument[], 'trigger') as unknown as NonNullable<
      ScaledObjectSpec['triggers']
    >[number];

    expect(trigger.type).toBe('prometheus');
    expect(trigger.metricType).toBe('AverageValue');
    expect(trigger.metadata?.['threshold']).toBe('1');
    const query = trigger.metadata?.['query'] ?? '';
    expect(query).toContain('studio_dispatch_backlog');
    expect(query).toContain('QUEUED');
    expect(query).toContain('CLAIMED');
    // Every worker replica exports the same global count; a `sum` over replicas would multiply it.
    expect(query).toMatch(/max by \(state\)/u);
    expect(trigger.metadata?.['serverAddress']).toBe(
      AUTOSCALING_ON['studioRunner.autoscaling.prometheus.serverAddress'],
    );
  });

  it.each(EACH_SET)('%s renders min/max replicas and a cooldown no shorter than the run deadline', (_label, valuesFile) => {
    const outcome = render({ valuesFile, set: autoscalingOn(valuesFile) });
    const spec = runnerScaledObject(outcome);

    expect(spec.minReplicaCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(spec.maxReplicaCount ?? 0).toBeGreaterThanOrEqual(spec.minReplicaCount ?? Infinity);
    expect(spec.cooldownPeriod ?? 0).toBeGreaterThanOrEqual(renderedRunDeadlineSeconds(outcome));
    // KEDA's cooldown governs only scale-to-zero; the HPA window is what delays scale-in above min.
    expect(spec.advanced?.horizontalPodAutoscalerConfig?.behavior?.scaleDown?.stabilizationWindowSeconds).toBe(
      spec.cooldownPeriod,
    );
  });

  it.each(EACH_SET)('%s still renders no HPA, and no replica count for the scaler to fight', (_label, valuesFile) => {
    const outcome = render({ valuesFile, set: autoscalingOn(valuesFile) });

    expect(runnerHpas(outcome), 'an HPA targets the runner').toEqual([]);
    expect((runnerDeployment(outcome).spec as { replicas?: number }).replicas).toBeUndefined();
  });

  it('render mutation: a cooldown below the run deadline fails the render', () => {
    const outcome = renderOutcome({
      set: { ...AUTOSCALING_ON, 'studioRunner.autoscaling.cooldownPeriodSeconds': '60' },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('cooldownPeriodSeconds');
  });

  it('render mutation: raising the run deadline past the cooldown fails the render', () => {
    // The other direction: the bound follows the deadline rather than a literal.
    const outcome = renderOutcome({
      set: AUTOSCALING_ON,
      args: ['--set-string', 'studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS=600000'],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS');
  });

  it('render mutations: no Prometheus address, and scale-to-zero, both fail the render', () => {
    const noAddress = renderOutcome({ set: { 'studioRunner.autoscaling.enabled': 'true' } });
    expect(noAddress.ok).toBe(false);
    expect(noAddress.error).toContain('serverAddress');

    const toZero = renderOutcome({
      set: { ...AUTOSCALING_ON, 'studioRunner.autoscaling.minReplicaCount': '0' },
    });
    expect(toZero.ok).toBe(false);
    expect(toZero.error).toContain('minReplicaCount');
  });
});

describe('WP7 — disruption and drain', () => {
  it.each(EACH_SET)('%s renders a PodDisruptionBudget that selects exactly the runner pods', (_label, valuesFile) => {
    const outcome = render({ valuesFile });
    const pdb = one(
      byKind(outcome, 'PodDisruptionBudget').filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
      'runner PodDisruptionBudget',
    );
    const spec = pdb.spec as { maxUnavailable?: number; selector?: { matchLabels?: Record<string, string> } };
    expect(spec.maxUnavailable).toBe(1);

    const podLabels =
      (runnerDeployment(outcome).spec as { template?: { metadata?: { labels?: Record<string, string> } } })
        .template?.metadata?.labels ?? {};
    const selector = spec.selector?.matchLabels ?? {};
    expect(Object.keys(selector).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(selector)) {
      expect(podLabels[key], `the PDB selector ${key} does not match the runner pods`).toBe(value);
    }
  });

  it.each(EACH_SET)('%s gives the pod at least 150 s and at least the runner drain timeout to stop', (_label, valuesFile) => {
    const deployment = runnerDeployment(render({ valuesFile }));
    const grace = podSpec(deployment).terminationGracePeriodSeconds ?? 0;
    const drainSeconds = Math.floor(
      Number(envValues(soleContainer(deployment))['STUDIO_RUNNER_DRAIN_TIMEOUT_MS']) / 1000,
    );

    expect(grace).toBeGreaterThanOrEqual(150);
    expect(grace, 'SIGKILL would land inside the runner drain').toBeGreaterThanOrEqual(drainSeconds);
  });

  it('render mutation: a short runtime cap pulls the derived grace period below 150 s', () => {
    // The grace period is derived (chart.test.ts AC-6), not floored, so this is the input that would
    // break the criterion above. It is caught here, by comparison, rather than hidden by a floor.
    const deployment = runnerDeployment(
      render({ args: ['--set-string', 'studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS=30000'] }),
    );
    expect(podSpec(deployment).terminationGracePeriodSeconds ?? 0).toBeLessThan(150);
  });
});


describe('STUDIO-OBS-009 A2.6 — guided mode and the autoscaler are exclusive', () => {
  it.each(EACH_SET)('%s: guided mode on renders one replica and no ScaledObject', (_label, valuesFile) => {
    const outcome = render({ valuesFile, guided: true });
    expect((runnerDeployment(outcome).spec as { replicas?: number }).replicas).toBe(1);
    expect(scaledObjects(outcome)).toEqual([]);
    expect(runnerHpas(outcome)).toEqual([]);
  });

  it.each(EACH_SET)('%s: guided mode with the autoscaler on fails the render, and the autoscaler alone still renders', (_label, valuesFile) => {
    const refused = renderOutcome({ valuesFile, guided: true, set: AUTOSCALING_ON });
    expect(refused.ok, 'a ScaledObject would own the replica count of a pod guided mode needs to be exactly one').toBe(false);
    expect(refused.error).toContain('autoscaling.enabled: false');
    // The control: without guided mode the very same autoscaler values render a ScaledObject.
    expect(scaledObjects(render({ valuesFile, set: autoscalingOn(valuesFile) }))).toHaveLength(1);
  });

  it('a guided pod does not shrink the replay drain: the grace period is still at least the drain timeout', () => {
    const deployment = runnerDeployment(render({ guided: true }));
    const grace = podSpec(deployment).terminationGracePeriodSeconds ?? 0;
    expect(grace).toBeGreaterThanOrEqual(
      Math.floor(Number(envValues(soleContainer(deployment))['STUDIO_RUNNER_DRAIN_TIMEOUT_MS']) / 1000),
    );
  });
});
