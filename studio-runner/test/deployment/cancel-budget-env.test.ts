/**
 * Studio v1 WP16 — the worker derives its reaper cancel margin from the runner's DEPLOYED bounds.
 *
 * The worker's `RunningReaper` closes a cancel the runner never finished once
 * `RunnerCancelBudget.effectiveMargin()` has passed, and that margin is arithmetic over four runner
 * bounds read under the runner's own env names. If the worker does not receive those values, it
 * derives the margin from defaults while the runner runs with whatever the values file says — and a
 * runner given a longer delivery or evidence window can then have its cancelled row closed under it.
 *
 * Every assertion compares the two rendered containers to each other, over all four value sets, and
 * a render mutation proves the comparison moves when the values key moves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CHART_DIR,
  deploymentNamed,
  envValues,
  render,
  runnerDeployment,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';
import type { Container, RenderOutcome } from './helm.js';

/** The four runner bounds `RunnerCancelBudget` reads (backend `application.yml`, `studio.execution.cancel`). */
const CANCEL_BUDGET_KEYS = [
  'STUDIO_RUNNER_ADMISSION_TIMEOUT_MS',
  'STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS',
  'STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS',
  'STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS',
] as const;

const EACH = VALUE_SETS.map((file) => [valueSetName(file), file] as const);

function worker(outcome: RenderOutcome): Container {
  return soleContainer(deploymentNamed(outcome, '-worker'));
}

function runner(outcome: RenderOutcome): Container {
  return soleContainer(runnerDeployment(outcome));
}

describe('Studio v1 WP16 — the worker receives the runner’s cancel-path bounds', () => {
  it('the key list here is exactly the runner env names the backend’s cancel budget reads', () => {
    const yml = readFileSync(
      join(CHART_DIR, '..', '..', 'backend', 'src', 'main', 'resources', 'application.yml'),
      'utf8',
    );
    const block = /\n {4}cancel:\n((?: {6}.*\n)+)/u.exec(yml)?.[1] ?? '';
    const read = [...block.matchAll(/\$\{(STUDIO_RUNNER_[A-Z_]+):/gu)].map((m) => m[1]).sort();
    expect(read, 'backend application.yml studio.execution.cancel block').toEqual(
      [...CANCEL_BUDGET_KEYS].sort(),
    );
  });

  it.each(EACH)(
    '%s: worker and runner carry identical values for every key',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const onWorker = envValues(worker(outcome));
      const onRunner = envValues(runner(outcome));

      for (const key of CANCEL_BUDGET_KEYS) {
        expect(
          onWorker[key],
          `${key}: worker ${String(onWorker[key])} vs runner ${String(onRunner[key])}`,
        ).toBe(onRunner[key]);
      }
      // Not vacuous: the shipped values set at least the three bounds the chart already pins, so
      // the comparison above is between present values, not between two absences.
      const present = CANCEL_BUDGET_KEYS.filter((key) => onRunner[key] !== undefined);
      expect(
        present.length,
        'the runner receives none of the bounds — nothing was compared',
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('render mutation: moving each runner value moves the worker’s with it', () => {
    const set: Record<string, string> = {};
    CANCEL_BUDGET_KEYS.forEach((key, index) => {
      set[`studioRunner.runnerEnv.${key}`] = String(40_000 + index);
    });
    const outcome = render({ set });
    const onWorker = envValues(worker(outcome));
    const onRunner = envValues(runner(outcome));

    CANCEL_BUDGET_KEYS.forEach((key, index) => {
      expect(onRunner[key]).toBe(String(40_000 + index));
      expect(onWorker[key], key).toBe(String(40_000 + index));
    });
  });

  it('the API pod, which schedules no reaper, is not given them', () => {
    const outcome = render();
    const onApi = envValues(soleContainer(deploymentNamed(outcome, '-api')));
    for (const key of CANCEL_BUDGET_KEYS) expect(onApi[key], key).toBeUndefined();
  });
});
