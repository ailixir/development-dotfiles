/**
 * Story 10.17 AC-3, strongest clause — **no browser process exists** when a job's values do not
 * correspond to its declarations.
 *
 * `test/server/correspondence.test.ts` proves the `400`, the untouched capacity slot and the
 * absent admission request against a fake launcher. None of that can tell you whether a browser is
 * running. This tier can, because it builds the application with the **real** child launcher and
 * the **real** fork spawner — the same pair `src/server/main.ts` wires — and then looks at the
 * process table.
 *
 * ## Why the observation is made this way
 *
 * AC-3 explicitly refuses *"assert launch was not called"*, and this epic has already found that
 * assertion class worthless. A spy's call count is a statement about a mock. The statement the
 * criterion makes is about the machine, so:
 *
 * - the descendants of **this** process are snapshotted before the refusals and after them, and
 *   the two sets are compared. A refusal that quietly forked a Node child or started a Chromium
 *   would show up as a new pid, whatever any spy recorded;
 * - the snapshot is **stable**, meaning a pid must be present in two reads a moment apart to
 *   count. `descendantsOf` shells out to read the process table, so its own helper is briefly a
 *   descendant of this process — a single read is never equal to another single read, and a
 *   comparison built on one would be red for a reason that has nothing to do with the criterion;
 * - and there is a **positive control in the same file, on the same instrument**. A real browser
 *   launched through the same `createChildBrowserLauncher` *does* show up in the same stable
 *   snapshot. Without it, "no browser process exists" would be satisfied by a machine where no
 *   browser can start at all — a criterion that passes because the property was never testable.
 *   The wave-4 lesson, applied to a negative assertion. The control deliberately observes the
 *   *instrument* rather than the route: the route's admit path already has its permit companion in
 *   `test/server/correspondence.test.ts`, and what this file has to establish is that a process
 *   appearing below us is something these eyes can see.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createChildBrowserLauncher, createForkSpawner } from '../../src/run/launcher.js';
import { descendantsOf } from '../../src/run/tree.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';
import { createScratch } from './realRunner.js';

const CANARY = 'fixtures-correspondence-canary-4b7e';

/** The real pair, as `main.ts` wires it. Nothing about the launch path is faked here. */
function realLauncher(): ReturnType<typeof createChildBrowserLauncher> {
  return createChildBrowserLauncher({
    recording: { width: 640, height: 360 },
    // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0 (story 10.32).
    seekOriginCalibrationMs: 0,
    stepTimeoutMs: 30_000,
    launchTimeoutMs: 60_000,
    maxFailureMessageLength: 400,
    childModulePath: CHILD_MODULE_PATH,
    spawner: createForkSpawner(),
  });
}

let harness: Harness | null = null;
const roots: string[] = [];

afterEach(async () => {
  await harness?.stop();
  harness = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * Every pid below this process that is still there a moment later, sorted.
 *
 * The second read is not defensive padding. `descendantsOf` reads the process table by running a
 * command, so the reading process is itself a short-lived descendant of this one and appears in its
 * own answer. Two reads and an intersection removes exactly that, and removes nothing a fork or a
 * browser would leave: those outlive the gap by orders of magnitude.
 */
/** Lets the event loop, the fork and the process table settle. */
async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function stableProcessesBelowUs(): Promise<readonly number[]> {
  const first = new Set(descendantsOf(process.pid));
  await new Promise((resolve) => setTimeout(resolve, 120));
  return [...descendantsOf(process.pid)].filter((pid) => first.has(pid)).sort((a, b) => a - b);
}

const NON_CORRESPONDING = [
  {
    id: 'a declared secret with no value',
    job: { references: { variables: [], secrets: ['PW'] }, resolvedVars: {}, resolvedSecrets: {} },
  },
  {
    id: 'a declared variable with no value',
    job: {
      references: { variables: ['REGION'], secrets: ['PW'] },
      resolvedVars: {},
      resolvedSecrets: { PW: CANARY },
    },
  },
  {
    id: 'a value the artifact cannot name',
    job: {
      references: { variables: [], secrets: ['PW'] },
      resolvedVars: {},
      resolvedSecrets: { PW: CANARY, SMUGGLED: CANARY },
    },
  },
  {
    id: 'a name crossed between the two kinds',
    job: {
      references: { variables: ['PW'], secrets: ['PW'] },
      resolvedVars: { PW: CANARY },
      resolvedSecrets: { PW: CANARY },
    },
  },
] as const;

describe('AC-3 — a non-corresponding job starts no browser, established by looking for one', () => {
  for (const testCase of NON_CORRESPONDING) {
    it(`starts no process at all for ${testCase.id}`, async () => {
      // A **real** scratch store, not the harness default. The real launcher forks a child that
      // needs a directory that exists, so a fake store would make every admitted job fail to
      // launch — and the four negatives below would be green because nothing in this harness could
      // ever start a browser, which is the exact shape of a criterion that proves nothing.
      const root = mkdtempSync(join(tmpdir(), 'studio-runner-refusal-'));
      roots.push(root);
      harness = createHarness({ launcher: realLauncher(), scratch: createFsScratchStore(root) });
      await harness.start();

      const before = await stableProcessesBelowUs();
      const response = await post(
        harness.port,
        '/v1/runs',
        JSON.stringify(validJob(testCase.job)),
        SERVICE_TOKEN,
      );

      // The harness schedules admitted work rather than launching it inline, so the clock is
      // driven forward here and the process table is then given time to fill. Without this the
      // observation could not tell a refusal apart from an admission that had not launched yet —
      // and the clause would be green for a reason that is nothing to do with the criterion.
      harness.advance(1);
      await settle(2_000);

      // **The process table first.** A fork is observable within milliseconds of being made, and
      // the stable read's own gap is the slack. This is asserted before the status because it is
      // the clause the criterion is about: if the refusal were removed, the status assertion would
      // fire first and this one would never run, and a criterion whose strongest clause is never
      // reached by its own falsification has not been shown to assert anything.
      expect(
        await stableProcessesBelowUs(),
        'a process appeared below this one for a job that was refused at the envelope',
      ).toEqual(before);

      expect(response.status).toBe(400);
      expect(harness.app.pool.inUse).toBe(0);
      expect(harness.http.admissionRequests).toHaveLength(0);
      expect(response.body).not.toContain(CANARY);
    });
  }

  it('the observation is capable of seeing a process: a real browser appears in the same snapshot', async () => {
    // The control. If this fails, every assertion above is measuring a machine that cannot start a
    // browser rather than a refusal that declines to — and would pass with the correspondence
    // check deleted.
    const before = await stableProcessesBelowUs();
    const scratchPath = createScratch();
    const session = await realLauncher().launch({
      browser: 'chromium',
      viewport: { width: 640, height: 360 },
      totalRuntimeMs: 120_000,
      scratchPath,
    });
    try {
      let seen = await stableProcessesBelowUs();
      const deadline = Date.now() + 90_000;
      while (seen.length <= before.length && Date.now() < deadline) {
        seen = await stableProcessesBelowUs();
      }
      expect(
        seen.length,
        'no process appeared below us for a real launch, so the negatives above prove nothing',
      ).toBeGreaterThan(before.length);
    } finally {
      await session.close();
      rmSync(scratchPath, { recursive: true, force: true });
    }
  });
});
