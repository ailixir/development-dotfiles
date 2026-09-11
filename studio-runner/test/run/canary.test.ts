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
 *
 * ## Story 10.17 — six *value* shapes through the same three *carrier* shapes
 *
 * 10.13's three shapes are about **how** a value reaches output. Story 10.17 supplies the material
 * that experiment exists to chase, and its six shapes are about **what the value is** — each one
 * chosen against something `createRedactor` actually does, read rather than assumed:
 *
 * 1. **JSON-escapable bytes** (`"`, `\`, a newline). `src/server/logging.ts` is serialize-then-
 *    redact by design, so the bytes on the line are escaped and the plain variant does not match
 *    them. A verified hole, closed by the eighth variant (AC-14);
 * 2. **a strict prefix of another resolved value in the same run**, which is what the longest-first
 *    ordering in `createRedactor` exists for. The canary here is the *longer* value and the
 *    assertion that discriminates is on its tail: reverse the ordering and the shorter value is
 *    replaced inside the longer one, leaving the remainder on the surface;
 * 3. **a short, common value** (4 characters), whose redaction is nearly indistinguishable from
 *    corrupting ordinary text — the case that says whether the redactor is scrubbing or shredding;
 * 4. **non-ASCII/multibyte**, where `encodeURIComponent` and base64 diverge from the plain bytes
 *    most;
 * 5. **regex metacharacters**, which are safe today because `redact` uses `split`/`join` and not a
 *    `RegExp`. This shape exists to fail on the day someone "optimises" that;
 * 6. **a variable value, not a secret.** `resolvedVars` is ephemeral by the contract but is not
 *    described as scrubbed — only `resolvedSecrets` is *"additionally scrubbed"* — while
 *    `knownValuesOf` feeds both. @po ruled on 2026-09-11 that the code's stronger behaviour is
 *    correct and the *document* is what is narrower; amending it is Class B and @architect's. This
 *    shape therefore asserts the stronger behaviour as **intended**, and its falsification is
 *    *remove variables from `knownValuesOf`* → red.
 *
 * This file is **extended**, not duplicated. A parallel `secrets-canary.test.ts` would be a second
 * harness to keep in step with this one, and this epic has been bitten three times by exactly that
 * (ADR-002 §15.6, §18.3).
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
import { ACCEPTED_JOB_KEYS } from '../../src/reporting/envelope.js';
import { post, validJob } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

/**
 * One *value* shape: what the canary is, and what a partial disclosure of it would look like.
 *
 * @property id the name the test carries, so a red result names a shape rather than a line number
 * @property value the canary itself
 * @property companion the other resolved value in the same run; `null` means "the default"
 * @property fragments substrings whose appearance anywhere is a partial disclosure. A partial
 *   disclosure is a disclosure, and it is the assertion that catches a cut in the wrong place — a
 *   fragment matches no variant `createRedactor` produces, so every `not.toContain(value)` would
 *   stay green over one
 * @property carriedAs which resolved map the canary travels in
 */
interface ValueShape {
  readonly id: string;
  readonly value: string;
  readonly companion: string;
  readonly fragments: readonly string[];
  readonly carriedAs: 'secret' | 'variable';
  /**
   * Whether the child writes the canary to its streams JSON-escaped rather than raw.
   *
   * Only shape 1 does, and it is not a convenience. A value containing a real newline that a child
   * writes raw is split into two lines *by the child's own choice*, and 10.13's comment names that
   * as the case the relay cannot close — neither half matches any variant. A child emitting a
   * formatted or JSON-ish diagnostic writes the escaped form instead, which is one line, which is
   * exactly the shape `logging.ts`'s serialize-then-redact produces, and which is the hole AC-14
   * closes. Asserting against the raw-newline form would be asserting against a named residual.
   */
  readonly escapedOnStreams?: boolean;
  /**
   * Encoded forms the child also emits, beyond the plain one.
   *
   * Without this a value shape's *encoding* behaviour is only ever asserted (`expectClean` checks
   * all eight) and never **exercised**, so no mutation to a single variant could turn exactly that
   * shape red — every shape would fall over together or not at all, and a mutation that reddens
   * the whole suite has proven nothing. A shape whose point is that its encodings diverge has to
   * put a divergent encoding on a surface.
   */
  readonly alsoPlantEncoded?: readonly string[];
}

/**
 * 10.13's original canary, kept as the default shape.
 *
 * The `@`, the space, the `/`, the `+` and the `=` each move differently under
 * `encodeURIComponent`, `encodeURI` and base64, so a redactor that only handled one of them would
 * be visible here rather than plausible.
 */
const CANARY = 'CANARY-Zq7-p@ss w0rd/+=';

const DEFAULT_SHAPE: ValueShape = {
  id: '10.13 baseline',
  value: CANARY,
  companion: 'COMPANION-unrelated-value',
  fragments: ['CANARY-Zq7-'],
  carriedAs: 'secret',
};

/** The six value shapes story 10.17 adds (AC-13a). */
const VALUE_SHAPES: readonly ValueShape[] = [
  {
    id: 'shape 1 — JSON-escapable bytes',
    value: 'CANARY-Jsn-pa"ss\\back\nline',
    companion: 'COMPANION-unrelated-value',
    fragments: ['CANARY-Jsn-'],
    carriedAs: 'secret',
    escapedOnStreams: true,
  },
  {
    id: 'shape 2 — a strict prefix of another resolved value',
    // The canary is the LONGER value; `companion` is a strict prefix of it. Longest-first ordering
    // is what keeps the tail from surviving, so the tail is the fragment that discriminates.
    value: 'CANARY-Pfx-base-plus-the-tail',
    companion: 'CANARY-Pfx-base',
    fragments: ['CANARY-Pfx-', '-plus-the-tail'],
    carriedAs: 'secret',
  },
  {
    id: 'shape 3 — a short, common value',
    // Four characters. Chosen so it is absent from every literal this harness plants around it,
    // which is what makes its absence afterwards a fact about the redactor rather than about the
    // corpus; and so that the control assertion (`http://127.0.0.1/login` survives) still holds.
    value: 'Zq7!',
    companion: 'COMPANION-unrelated-value',
    fragments: [],
    carriedAs: 'secret',
  },
  {
    id: 'shape 4 — non-ASCII, multibyte',
    // The `/` matters: `encodeURI` leaves it and `encodeURIComponent` escapes it, so the two
    // variants are different strings for this value. Without it they coincide and dropping one
    // still leaves the other matching — a mutation that could not be seen.
    value: 'CANARY-Ünïcødé/密码-🔑',
    companion: 'COMPANION-unrelated-value',
    fragments: ['CANARY-Ünïcødé'],
    carriedAs: 'secret',
    // The two forms that diverge furthest from the plain bytes for a multibyte value. A browser
    // that puts this in a URL and an HTTP client that puts it in a header produce exactly these,
    // and no other shape plants them — so dropping either variant reddens this shape alone.
    alsoPlantEncoded: ['url-encoded', 'base64-standard'],
  },
  {
    id: 'shape 5 — regex metacharacters',
    // Safe today only because `redact` uses split/join. If that is ever "optimised" to a RegExp,
    // this is the test that goes red rather than the production incident.
    value: 'CANARY-Rgx-.*+?[](){}|^$',
    companion: 'COMPANION-unrelated-value',
    fragments: ['CANARY-Rgx-'],
    carriedAs: 'secret',
  },
  {
    id: 'shape 6 — a variable value, not a secret',
    value: 'CANARY-Var-not-a-secret-42',
    companion: 'COMPANION-unrelated-value',
    fragments: ['CANARY-Var-'],
    carriedAs: 'variable',
  },
];

/** The value as it appears inside a JSON string literal — the eighth variant (AC-14). */
function jsonEscaped(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/**
 * Padding that puts the canary across the relay's 400-character line bound.
 *
 * 385 characters before it, so 14 of its characters would survive a truncate-first implementation
 * — enough to contain a fragment, which is what turns that mutation red.
 */
const PAD = 'p'.repeat(385);

/**
 * The same value again, on a run of output that **never sends a newline** (QA-1).
 *
 * The padded line above ends with `\n`, so it travels the relay's per-line path. That left the
 * relay's *other* cut — the overflow bound for a stream with no line break in it — carrying a
 * canary in no test at all, and it had the redact/cut order backwards: a value straddling the cut
 * was emitted as two fragments that match no variant, and concatenating them reconstructs the
 * value.
 *
 * This is what a child signalled mid-write actually leaves in the pipe, which is why it belongs in
 * the matrix rather than only in a unit test. Long enough to force an emit rather than merely to
 * sit in the retained tail: two canaries, one near the first cut and one past it.
 */
function overflowLeak(planted: string): string {
  return (
    `${'q'.repeat(385)}${planted} no-newline-here` +
    `${'r'.repeat(385)}${planted}${'s'.repeat(600)}`
  );
}

/**
 * The eight encodings AC-7a and AC-14 enumerate, each a shape the value takes after a browser, an
 * HTTP client, a proxy or a **serializer** has touched it.
 */
function encodings(value: string): Record<string, string> {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return {
    plain: value,
    'url-encoded': encodeURIComponent(value),
    'encodeURI': encodeURI(value),
    'doubly-url-encoded': encodeURIComponent(encodeURIComponent(value)),
    'json-escaped': jsonEscaped(value),
    'base64-standard': base64,
    'base64-unpadded': base64.replace(/=+$/u, ''),
    'base64-url-safe': base64.replace(/\+/gu, '-').replace(/\//gu, '_'),
  };
}

/** Every encoded form must be absent from every surface. This is the assertion, 8 times over. */
function expectClean(shape: ValueShape, surface: string, text: string): void {
  for (const [encoding, variant] of Object.entries(encodings(shape.value))) {
    expect(text, `${surface} carries the canary, ${encoding} (${shape.id})`).not.toContain(variant);
  }
  // …and no recognisable piece of it either. A partial disclosure is a disclosure.
  for (const fragment of shape.fragments) {
    expect(text, `${surface} carries a fragment '${fragment}' of the canary (${shape.id})`).not.toContain(
      fragment,
    );
  }
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
  readonly shape: ValueShape;
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

/**
 * The three carrier shapes, each as the bytes a naive child would actually produce, now carrying
 * whichever *value* shape the test is exercising.
 *
 * `planted` is what the child writes to its streams; `raw` is what reaches the report bodies. They
 * differ for exactly one value shape and the reason is in {@link ValueShape.escapedOnStreams}.
 */
function leakFor(
  shape: Shape,
  value: ValueShape,
): { stderr: string; failureMessage: string; stepFailure: string } {
  const raw = value.value;
  const encoded = encodings(raw);
  const extra = (value.alsoPlantEncoded ?? [])
    .map((name) => ` also-as-${name}:${encoded[name] ?? ''}`)
    .join('');
  const planted = (value.escapedOnStreams === true ? jsonEscaped(raw) : raw) + extra;
  switch (shape) {
    case 'formatted-argument': {
      // A template literal whose *argument* is the value. The format string is clean, so a scan
      // for the value in the source finds nothing, and `safeMessage` was never involved.
      const field = 'password';
      return {
        stderr:
          `pw:debug filling ${field} with ${planted} on http://127.0.0.1/login\n` +
          `${PAD}${planted} trailing\n` +
          overflowLeak(planted),
        failureMessage: `locator.fill: could not type ${raw} into ${field}`,
        stepFailure: `AssertionFailed: expected ${field} to contain ${raw}`,
      };
    }
    case 'exception-message': {
      // Produced below the run path, by code this package does not own: the value is already in
      // the string by the time anything here sees it.
      const thrown = new Error(`connect ECONNREFUSED while authenticating as ${raw}`);
      thrown.name = 'PlaywrightError';
      return {
        stderr:
          `${thrown.name}: connect ECONNREFUSED while authenticating as ${planted}\n    at Connection.<anonymous>\n` +
          `${PAD}${planted} trailing\n` +
          overflowLeak(planted),
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
            secret: raw,
            toString(): string {
              return `Credentials(secret=${raw})`;
            },
          },
        },
      };
      const rendered = `request failed: ${String(nested.request.credentials)}`;
      return {
        stderr: `request failed: Credentials(secret=${planted})\n${PAD}${planted} trailing\n${overflowLeak(planted)}`,
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
async function runLeaking(shape: Shape, value: ValueShape = DEFAULT_SHAPE): Promise<CanaryRun> {
  const leak = leakFor(shape, value);
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

  // The canary travels on the envelope's own fields, as a resolved value does. Which of the two
  // maps it travels in is the point of value shape 6: the contract describes only `resolvedSecrets`
  // as "additionally scrubbed", while `knownValuesOf` feeds both — @po ruled the code's stronger
  // behaviour correct and intended, so a variable canary is asserted absent from every surface too.
  //
  // The declaration and the resolution correspond exactly, because as of story 10.17 a job whose
  // maps and declarations disagree is refused at the envelope before capacity (AC-3).
  const job = validJob({
    resolvedVars: {
      LOGIN_USER: value.carriedAs === 'variable' ? value.value : value.companion,
    },
    resolvedSecrets: {
      PW: value.carriedAs === 'secret' ? value.value : value.companion,
    },
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
    shape: value,
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
  const shape = run.shape;
  // 1. The LogSink's written lines — the pod log, which §9.2 calls persistence.
  expectClean(shape, 'the log sink', run.logLines.join('\n'));

  // 2 and 3. The child's stdout and stderr, as captured by the AC-8 relay. They reach the sink,
  // so this is the same bytes narrowed to the relayed lines — named separately because they are
  // the surface the epic's acceptance bullet calls out by hand.
  const relayed = run.logLines.filter((line) => line.includes('run.child_output'));
  expect(relayed.length, 'the relay must actually have captured something to assert on').toBeGreaterThan(0);
  expectClean(shape, "the child's relayed stdout/stderr", relayed.join('\n'));

  // 4, 5, 6, 7. Every serialized report body: STARTED, every PROGRESS, FINAL and every
  // byte-identical terminal retry. Asserted on the bytes that were posted.
  const kinds = new Set(run.parsed.map((body) => body.kind));
  expect(kinds.has('STARTED')).toBe(true);
  expect(kinds.has('FINAL')).toBe(true);
  for (const [index, body] of run.bodies.entries()) {
    expectClean(shape, `report body ${String(index)} (${run.parsed[index]?.kind ?? '?'})`, body);
  }
  const finalBodies = run.bodies.filter((body) => (JSON.parse(body) as ReportBody).kind === 'FINAL');
  expect(finalBodies.length, 'the terminal retry must have happened').toBeGreaterThan(1);
  // Byte-identical, and therefore clean in the same way every time.
  expect(new Set(finalBodies).size).toBe(1);

  // 8. `outcome.errorMessage`.
  expectClean(shape, 'outcome.errorMessage', JSON.stringify(run.final.outcome ?? {}));

  // 9. Every step's `failure`.
  expectClean(shape, 'every step failure', JSON.stringify(run.final.steps.map((step) => step.failure)));

  // 10. Every log entry's `message`.
  expectClean(
    shape,
    'every log entry message',
    JSON.stringify(run.parsed.flatMap((body) => body.logs.map((entry) => entry.message))),
  );

  // 11 and 12. The spawn arguments and environment handed to the operating system.
  expectClean(shape, 'the spawn arguments', JSON.stringify(run.spawnArgs));
  expectClean(shape, 'the spawn environment', JSON.stringify(run.spawnEnv));
  // Empty, always: a job value on a command line is visible in `ps` to every process on the host.
  expect(run.spawnArgs).toEqual([]);

  // 13. The process command line.
  expectClean(shape, 'the process command line', run.commandLine);

  // 14 and 15. Every scratch file name and file content, photographed at the instant the run
  // cleared its directory.
  expectClean(shape, 'scratch file names', run.scratch.captured.map((file) => file.name).join('\n'));
  expectClean(shape, 'scratch file contents', run.scratch.captured.map((file) => file.content).join('\n'));
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

  /**
   * Story 10.17 AC-13a — the six *value* shapes, through 10.13's three *carrier* shapes.
   *
   * Each shape gets its own named test, because AC-20's record names the test that went red and a
   * loop reporting one name for six experiments would make that record useless. The carrier shape
   * is rotated across the three so every value shape is exercised through a different path to
   * output rather than through the same one six times.
   */
  for (const [index, value] of VALUE_SHAPES.entries()) {
    const carriers: readonly Shape[] = ['formatted-argument', 'exception-message', 'nested-toString'];
    const carrier = carriers[index % carriers.length] ?? 'formatted-argument';
    it(`${value.id} (carried as a ${carrier})`, async () => {
      const run = await runLeaking(carrier, value);
      assertEverySurfaceClean(run);
      // The value *travelled*. Without this the whole matrix above could be true because nothing
      // reached any surface — the first of this story's three prior vacuous guards.
      expect(run.logLines.join('\n')).toContain('run.child_output');
      expect(run.bodies.length, 'no report body was captured to assert on').toBeGreaterThan(0);
    });
  }

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
    expectClean(run.shape, 'the log sink after the kill', run.logLines.join('\n'));
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

/**
 * Story 10.17 AC-13b and AC-16b — **skipped, never passed.**
 *
 * The epic's convention for externally gated work (established by 10.3, used by 10.6, 10.7, 10.8,
 * 10.13): a blocked half is a live skip naming its gate and its owning story, so it is visible in
 * every run rather than absent from the file. A `b` half that turns green without its gate moving
 * is a defect, not a bonus.
 */
describe('Blocked halves — recorded as live skips, never as passes', () => {
  it.skip(
    'AC-13b (ED-02, owner 10.19, the other half of 10.13 AC-7b) — the same canaries through the ' +
      'integrated path with real vault material: nothing the API persists carries them, across ' +
      'progress rows, the persisted snapshot, structured log storage and 10.14’s terminal result ' +
      'manifest. The runner can only assert on what leaves it; the API half needs real material, ' +
      'which needs a real vault. ED-02 is status: open.',
    () => undefined,
  );

  for (const drafted of [
    'a variable URL resolving to an unapproved origin is refused at dispatch',
    'the same resolved URL is refused again during execution',
    'a redirect from an approved origin to an unapproved one is refused',
    'a subresource request to an unapproved origin is refused',
    'a secret submitted to an approved origin over an unapproved scheme is refused',
    'a local file URL is refused',
    'a cloud metadata endpoint is refused',
  ]) {
    it.skip(
      `AC-16b (ED-04 + ADR-002 O-6; mechanism owner 10.18 SPK-05, integrated proof 10.19) — ${drafted}`,
      () => undefined,
    );
  }

  it('records why AC-16b cannot be implemented here rather than leaving it to be re-derived', () => {
    // Not a skip: this one asserts a fact about this branch, which is that the mechanism the tests
    // above would drive does not exist and may not be invented here.
    //
    // §9.3 requires variable URL destinations to be resolved against policy "at dispatch and again
    // during execution", over "redirects and browser-initiated traffic, not just initial `goto`".
    // ADR-002 O-6 — whether that policy travels **on the job** or is enforced only at the **egress
    // layer** — is unresolved and solely 10.18's. Adding such a field to the closed `RunJob` is
    // §12 Class B: proposable by a story, landable only after an architect rules. So the contract
    // deliberately declares reference names and no policy field, and this story neither invents
    // one nor absorbs O-6.
    //
    // The assertion, over the **production** key set (QA LOW-2). The first version of this
    // iterated `validJob()` — a hand-built test fixture — so adding `targetPolicy` to the real
    // `ACCEPTED_JOB_KEYS` left it green. A tripwire pointed at a stand-in is a statement about the
    // stand-in; this is the sixteenth vacuous-guard shape and this file shipped two of them.
    for (const key of ['approvedOrigins', 'targetPolicy', 'secretUsePolicy', 'destinations']) {
      expect(
        [...ACCEPTED_JOB_KEYS],
        `the envelope accepts '${key}', so ADR-002 O-6 has been ruled and AC-16b is no longer blocked`,
      ).not.toContain(key);
    }
    // …and the set is the real one, not an empty stand-in that would satisfy the above.
    expect(ACCEPTED_JOB_KEYS.has('resolvedSecrets')).toBe(true);
    expect(ACCEPTED_JOB_KEYS.size).toBe(14);
  });
});
