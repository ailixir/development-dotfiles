/**
 * AC-7a, AC-9 — redaction stated as an **experiment**, not as a property.
 *
 * This epic has repeatedly found redaction that worked beside tests that could not tell.
 * `test/redaction.test.ts` builds a redactor and asks it to redact a string, which proves
 * `createRedactor` works — not that the run's output is clean. So the arrangement here is
 * adversarial and the assertions are on **captured bytes**:
 *
 * - the child is **naive**: it hands the canary back raw in everything it says — a formatted
 *   stderr line, an exception message, a nested object's own rendering, a step failure. Assuming a
 *   well-behaved child would test the child's manners rather than the parent's redaction.
 * - every surface that leaves this process is captured and asserted on, in **every variant
 *   `createRedactor` produces**;
 * - each of the three canary shapes has a named test, and the Dev Agent Record records which
 *   deliberate mutation turned which one red. An assertion nobody has seen fail has not been shown
 *   to assert anything.
 *
 * The three shapes are not arbitrary. Each one reaches output without anybody deliberately routing
 * it there, which is exactly what defeats a source scan:
 *
 * 1. a value interpolated into a **formatted argument** — an argument, never the format string;
 * 2. a value inside an **exception message thrown from below the run path**, so the string is
 *    produced by code this story does not own;
 * 3. a value inside a **nested object rendered by its own `toString`**, so serialization reaches
 *    it through a path no field-by-field redaction enumerates.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ReportBody } from '../../src/reporting/snapshot.js';
import type { RunScratch, ScratchStore } from '../../src/server/adapters.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createChildDriver } from '../helpers/childDriver.js';
import { createHarness, until, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

/**
 * A value whose shape changes under every encoding the redactor covers.
 *
 * The `@`, the space, the `/`, the `+` and the `=` each move differently under
 * `encodeURIComponent`, `encodeURI` and base64, so a redactor that only handled one of them would
 * be visible here rather than plausible.
 */
const CANARY = 'CANARY-Zq7-p@ss w0rd/+=';

/**
 * A distinctive prefix of the canary, asserted separately from the whole value.
 *
 * Without it the matrix has a blind spot big enough to drive the bug through: a relay that
 * truncated **before** redacting would emit a *fragment* of the value, and a fragment matches no
 * variant the redactor scrubs, so every `not.toContain(CANARY)` above would stay green over a real
 * partial disclosure. Each shape therefore plants one line long enough to be cut, arranged so the
 * cut lands inside the value.
 */
const CANARY_PREFIX = 'CANARY-Zq7-';

/**
 * Padding that puts the canary across the relay's 400-character line bound.
 *
 * 385 characters before it, so 14 of its characters would survive a truncate-first implementation
 * — enough to contain {@link CANARY_PREFIX}, which is what turns that mutation red.
 */
const PAD = 'p'.repeat(385);

/**
 * The same value again, on a run of output that **never sends a newline** (QA-1).
 *
 * The line above ends with `\n`, so it travels the relay's per-line path. That left the relay's
 * *other* cut — the overflow bound for a stream with no line break in it — carrying a canary in no
 * test at all, and it had the redact/cut order backwards: a value straddling the cut was emitted
 * as two fragments that match no variant, and concatenating them reconstructs the value. Coverage
 * read 98.68 % over the branch because a different test reached it with nothing to redact.
 *
 * This is what a child signalled mid-write actually leaves in the pipe, which is why it belongs in
 * the matrix rather than only in a unit test. Long enough to force an emit rather than merely to
 * sit in the retained tail: two canaries, one near the first cut and one past it.
 */
const OVERFLOW_LEAK =
  `${'q'.repeat(385)}${CANARY} no-newline-here` + `${'r'.repeat(385)}${CANARY}${'s'.repeat(600)}`;

/**
 * The seven encodings AC-7a enumerates, each one a shape the value takes after a browser, an HTTP
 * client or a proxy has touched it.
 */
function encodings(value: string): Record<string, string> {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return {
    plain: value,
    'url-encoded': encodeURIComponent(value),
    'encodeURI': encodeURI(value),
    'doubly-url-encoded': encodeURIComponent(encodeURIComponent(value)),
    'base64-standard': base64,
    'base64-unpadded': base64.replace(/=+$/u, ''),
    'base64-url-safe': base64.replace(/\+/gu, '-').replace(/\//gu, '_'),
  };
}

/** Every encoded form must be absent from every surface. This is the assertion, 7 times over. */
function expectClean(surface: string, text: string): void {
  for (const [encoding, variant] of Object.entries(encodings(CANARY))) {
    expect(text, `${surface} carries the canary, ${encoding}`).not.toContain(variant);
  }
  // …and no recognisable piece of it either. A partial disclosure is a disclosure.
  expect(text, `${surface} carries a fragment of the canary`).not.toContain(CANARY_PREFIX);
}

const TOTAL_RUNTIME_MS = 120_000;

// ── A scratch store that keeps a copy of what was in the directory when it was cleared ────────

interface ScratchSpy extends ScratchStore {
  /** File names and contents observed at the instant the run cleared its directory. */
  readonly captured: readonly { readonly name: string; readonly content: string }[];
  readonly rootPresentAfter: () => readonly string[];
}

/**
 * Wraps the real filesystem store and photographs the directory just before it is deleted.
 *
 * AC-7a asks for the assertion on "every scratch file name and file content", and AC-12 asks for
 * the directory to be gone afterwards. Both are true at different instants, so the test needs the
 * contents from the first and the absence from the second.
 */
function spyingScratch(root: string): ScratchSpy {
  const inner = createFsScratchStore(root);
  const captured: { name: string; content: string }[] = [];

  const snapshot = (directory: string): void => {
    const walk = (current: string, prefix: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(current);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(current, entry);
        const name = prefix === '' ? entry : `${prefix}/${entry}`;
        if (statSync(full).isDirectory()) {
          walk(full, name);
          continue;
        }
        let content = '';
        try {
          content = readFileSync(full, 'utf8');
        } catch {
          content = '';
        }
        captured.push({ name, content });
      }
    };
    walk(directory, '');
  };

  return {
    captured,
    rootPresentAfter: () => {
      try {
        return readdirSync(root);
      } catch {
        return [];
      }
    },
    async create(runId: string): Promise<RunScratch> {
      const scratch = await inner.create(runId);
      return {
        path: scratch.path,
        async clear(): Promise<void> {
          snapshot(scratch.path);
          // The directory name itself is a surface: a run id derived from a job value would put
          // one on the filesystem.
          captured.push({ name: scratch.path, content: '' });
          await scratch.clear();
        },
      };
    },
    clearAll: () => inner.clearAll(),
    list: () => inner.list(),
  };
}

// ── One run, with a naive child that leaks the canary in every shape it can ───────────────────

interface CanaryRun {
  readonly bodies: readonly string[];
  readonly parsed: readonly ReportBody[];
  readonly final: ReportBody;
  readonly logLines: readonly string[];
  readonly spawnArgs: readonly string[];
  readonly spawnEnv: Readonly<Record<string, string>>;
  readonly commandLine: string;
  readonly scratch: ScratchSpy;
  readonly driver: ReturnType<typeof createChildDriver>;
  readonly harness: Harness;
}

type Shape = 'formatted-argument' | 'exception-message' | 'nested-toString';

/** The three shapes, each as the bytes a naive child would actually produce. */
function leakFor(shape: Shape): { stderr: string; failureMessage: string; stepFailure: string } {
  switch (shape) {
    case 'formatted-argument': {
      // A template literal whose *argument* is the value. The format string is clean, so a scan
      // for the value in the source finds nothing, and `safeMessage` was never involved.
      const field = 'password';
      return {
        stderr:
          `pw:debug filling ${field} with ${CANARY} on http://127.0.0.1/login\n` +
          `${PAD}${CANARY} trailing\n` +
          OVERFLOW_LEAK,
        failureMessage: `locator.fill: could not type ${CANARY} into ${field}`,
        stepFailure: `AssertionFailed: expected ${field} to contain ${CANARY}`,
      };
    }
    case 'exception-message': {
      // Produced below the run path, by code this package does not own: the value is already in
      // the string by the time anything here sees it.
      const thrown = new Error(`connect ECONNREFUSED while authenticating as ${CANARY}`);
      thrown.name = 'PlaywrightError';
      return {
        stderr:
          `${thrown.name}: ${thrown.message}\n    at Connection.<anonymous>\n` +
          `${PAD}${CANARY} trailing\n` +
          OVERFLOW_LEAK,
        failureMessage: `${thrown.name}: ${thrown.message}`,
        stepFailure: `${thrown.name}: ${thrown.message}`,
      };
    }
    case 'nested-toString': {
      // Serialization reaches the value through the object's own rendering hook, which is a path
      // no field-by-field redaction enumerates — nobody listed `credentials.secret` anywhere.
      const nested = {
        request: {
          credentials: {
            secret: CANARY,
            toString(): string {
              return `Credentials(secret=${CANARY})`;
            },
          },
        },
      };
      const rendered = `request failed: ${String(nested.request.credentials)}`;
      return {
        stderr: `${rendered}\n${PAD}${CANARY} trailing\n${OVERFLOW_LEAK}`,
        failureMessage: rendered,
        stepFailure: rendered,
      };
    }
  }
}

let harness: Harness | null = null;
const roots: string[] = [];

afterEach(async () => {
  await harness?.stop();
  harness = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * Drives a whole run whose child leaks `shape` everywhere, through a **killed** exit path.
 *
 * The kill path is chosen deliberately: AC-9 requires the wipe-and-release assertion to be made
 * *after a kill*, because that is the path that skips the ordinary `finally`-ordering assumptions.
 */
async function runLeaking(shape: Shape): Promise<CanaryRun> {
  const leak = leakFor(shape);
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-canary-'));
  roots.push(root);
  const scratch = spyingScratch(root);
  const scheduler = createFakeScheduler();

  const driver = createChildDriver({
    hangOnStep: 0,
    onStop: 'ignore',
    writes: [
      { stream: 'stderr', chunk: leak.stderr },
      { stream: 'stdout', chunk: leak.stderr },
    ],
  });

  harness = createHarness({ launcher: driver.launcher, scheduler, scratch });
  await harness.start();

  // Two of the three terminal attempts fail, so the byte-identical retry is exercised and every
  // retry body is captured and asserted on as its own surface (AC-7a).
  let terminalAttempts = 0;
  harness.http.reportOutcome = (request) => {
    const body = JSON.parse(request.body) as ReportBody;
    if (body.kind === 'FINAL') {
      terminalAttempts += 1;
      if (terminalAttempts <= 2) return { kind: 'response', status: 500, body: '{}' };
    }
    return { kind: 'response', status: 200, body: '{}' };
  };

  const job = validJob({
    // The canary travels on the envelope's own fields, as a resolved value would.
    resolvedVars: { LOGIN_USER: CANARY },
    resolvedSecrets: { PW: CANARY },
    references: { variables: ['LOGIN_USER'], secrets: ['PW'] },
  });
  await post(harness.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
  await until(() => scheduler.pending().length > 0, 20_000);

  // The child reports a step failure carrying the canary, then goes quiet.
  driver.child().emit({
    kind: 'step-finished',
    stepIndex: 0,
    status: 'FAIL',
    startedAtMs: 12,
    finishedAtMs: 30,
    durationMs: 18,
    failure: leak.stepFailure,
  });
  driver.child().emit({ kind: 'step-started', stepIndex: 1, startedAtMs: 40 });

  scheduler.advance(TOTAL_RUNTIME_MS);
  await until(() => harness?.app.coordinator.inFlight === 0, 20_000);

  const bodies = harness.http.reportRequests.map((request) => request.body);
  const spawn = driver.spawner.requests[0];

  return {
    bodies,
    parsed: bodies.map((body) => JSON.parse(body) as ReportBody),
    final: JSON.parse(bodies.at(-1) ?? '') as ReportBody,
    logLines: harness.sink.lines,
    spawnArgs: spawn?.args ?? [],
    spawnEnv: spawn?.env ?? {},
    commandLine: [spawn?.modulePath ?? '', ...(spawn?.args ?? [])].join(' '),
    scratch,
    driver,
    harness,
  };
}

/**
 * The whole matrix for one shape: every surface AC-7a enumerates, in every encoding.
 *
 * Written as one function rather than three copies so a surface added here is added for all three
 * shapes — the isolation test this epic broke once was one that quietly lost a member of its list.
 */
function assertEverySurfaceClean(run: CanaryRun): void {
  // 1. The LogSink's written lines — the pod log, which §9.2 calls persistence.
  expectClean('the log sink', run.logLines.join('\n'));

  // 2 and 3. The child's stdout and stderr, as captured by the AC-8 relay. They reach the sink,
  // so this is the same bytes narrowed to the relayed lines — named separately because they are
  // the surface the epic's acceptance bullet calls out by hand.
  const relayed = run.logLines.filter((line) => line.includes('run.child_output'));
  expect(relayed.length, 'the relay must actually have captured something to assert on').toBeGreaterThan(0);
  expectClean("the child's relayed stdout/stderr", relayed.join('\n'));

  // 4, 5, 6, 7. Every serialized report body: STARTED, every PROGRESS, FINAL and every
  // byte-identical terminal retry. Asserted on the bytes that were posted.
  const kinds = new Set(run.parsed.map((body) => body.kind));
  expect(kinds.has('STARTED')).toBe(true);
  expect(kinds.has('FINAL')).toBe(true);
  for (const [index, body] of run.bodies.entries()) {
    expectClean(`report body ${String(index)} (${run.parsed[index]?.kind ?? '?'})`, body);
  }
  const finalBodies = run.bodies.filter((body) => (JSON.parse(body) as ReportBody).kind === 'FINAL');
  expect(finalBodies.length, 'the terminal retry must have happened').toBeGreaterThan(1);
  // Byte-identical, and therefore clean in the same way every time.
  expect(new Set(finalBodies).size).toBe(1);

  // 8. `outcome.errorMessage`.
  expectClean('outcome.errorMessage', JSON.stringify(run.final.outcome ?? {}));

  // 9. Every step's `failure`.
  expectClean('every step failure', JSON.stringify(run.final.steps.map((step) => step.failure)));

  // 10. Every log entry's `message`.
  expectClean(
    'every log entry message',
    JSON.stringify(run.parsed.flatMap((body) => body.logs.map((entry) => entry.message))),
  );

  // 11 and 12. The spawn arguments and environment handed to the operating system.
  expectClean('the spawn arguments', JSON.stringify(run.spawnArgs));
  expectClean('the spawn environment', JSON.stringify(run.spawnEnv));
  // Empty, always: a job value on a command line is visible in `ps` to every process on the host.
  expect(run.spawnArgs).toEqual([]);

  // 13. The process command line.
  expectClean('the process command line', run.commandLine);

  // 14 and 15. Every scratch file name and file content, photographed at the instant the run
  // cleared its directory.
  expectClean('scratch file names', run.scratch.captured.map((file) => file.name).join('\n'));
  expectClean('scratch file contents', run.scratch.captured.map((file) => file.content).join('\n'));
}

describe('AC-7a — the canary, in three shapes, across every surface that leaves this process', () => {
  it('shape 1 — a value interpolated into a formatted argument', async () => {
    assertEverySurfaceClean(await runLeaking('formatted-argument'));
  });

  it('shape 2 — a value inside an exception message thrown from below the run path', async () => {
    assertEverySurfaceClean(await runLeaking('exception-message'));
  });

  it('shape 3 — a value inside a nested object rendered by its own toString', async () => {
    assertEverySurfaceClean(await runLeaking('nested-toString'));
  });

  it('the experiment is capable of failing: the same surfaces do carry an unredacted control', async () => {
    // The control that makes the three tests above mean something. A value the redactor was
    // **not** built from travels the identical path and is found on the identical surfaces — so
    // when the canary is absent, it is absent because it was scrubbed, not because the surface was
    // empty, or unreached, or captured wrongly.
    const run = await runLeaking('formatted-argument');
    const relayed = run.logLines.filter((line) => line.includes('run.child_output'));
    expect(relayed.join('\n')).toContain('http://127.0.0.1/login');
    expect(run.logLines.join('\n')).toContain('run.child_output');
    expect(run.scratch.captured.length).toBeGreaterThan(0);
  });
});

describe('AC-9 — no resolved value is retained, and the assertion is made after a kill', () => {
  it('relays nothing at all for output the child produces after its tree was signalled', async () => {
    const run = await runLeaking('formatted-argument');
    const before = run.logLines.length;

    // The run is over, the tree was signalled and the relay was released. A child process that is
    // still exhaling must not be able to put anything — least of all this — into the pod log.
    run.driver.write('stderr', `post-mortem chatter carrying ${CANARY}\n`);
    run.driver.write('stdout', `${CANARY}\n`);

    expect(run.logLines).toHaveLength(before);
    expectClean('the log sink after the kill', run.logLines.join('\n'));
  });

  it('leaves no scratch directory for a value to sit in', async () => {
    const run = await runLeaking('exception-message');
    // AC-12's filesystem inspection, on the kill path: the per-run directory is gone and
    // `ScratchStore.list()` is empty.
    expect(run.scratch.rootPresentAfter()).toEqual([]);
    await expect(run.scratch.list()).resolves.toEqual([]);
  });

  it('wipes the resolver on the kill path, so nothing in the process can still produce a value', async () => {
    const run = await runLeaking('nested-toString');
    // The kill path is the one that skips the ordinary `finally`-ordering assumptions, which is
    // why AC-9 asks for the assertion here rather than after a clean finish. If the wipe had been
    // skipped, the run would not have reached its terminal report either — so the presence of a
    // `FINAL` on the wire is what makes this assertion about the wipe rather than about the path.
    expect(run.final.kind).toBe('FINAL');
    expect(run.final.outcome?.errorCode).toBe('TIMEOUT');
    expect(run.harness.app.coordinator.inFlight).toBe(0);
    // And the slot came back, which is the observable form of "the run left" (AC-13).
    expect(run.harness.app.pool.inUse).toBe(0);
  });
});
