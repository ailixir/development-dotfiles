/**
 * Reads the co-run's JUnit XML and its raw measurements and decides whether the co-run happened,
 * what it proved, and what the evidence document says (STUDIO-OBS-009 AC-11, lane F).
 *
 * Why this is not `echo $?`. Gradle prints a test tally only when something fails, and its exit
 * code cannot distinguish "every leg passed" from "the class never executed" — an
 * environment-conditional test that quietly declined to run exits 0, and a harness whose whole
 * purpose is to be the first thing that runs two components together must never be able to report
 * success by declining to run. The executed count is therefore asserted here, from the XML, and a
 * run in which every leg was skipped is a failure with its own message.
 *
 * What it adds for the observed co-run (`ObservedCoRunIT`). The class writes
 * `backend/build/corun/fault-injection-raw.json`: per run, the counts that decide "zero repeated
 * dispatches" (what the dispatcher sent, what reached the runner, how many replay children it
 * forked, which identity the ledger kept), plus the RUNNER-LAUNCH attribution of every runner
 * generation. This script does not trust the test's own verdict: it recomputes every invariant
 * from the raw counts, refuses a run whose `dist` digest is not the expected one, classifies the
 * REL-001 pointer and the D4 15 s edge, and writes the evidence document.
 *
 * Usage:
 *   node tools/corun-report.mjs <TEST-*.xml> [--raw <fault-injection-raw.json>]
 *        [--out <fault-injection.json>] [--expect-dist <sha256>] [--context <context.json>]
 *   env CORUN_EXPECT_DIST, CORUN_EVIDENCE_OUT and CORUN_EVIDENCE_CONTEXT stand in for the flags.
 * Exit:  0 green · 1 red, empty, skipped, or a violated invariant · 2 a file is not there ·
 *        3 green but a REL-001 recurrence is recorded (not credited; open a root-cause item)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CYAN = '\u001b[0;36m';
const RED = '\u001b[0;31m';
const OFF = '\u001b[0m';

const say = (message) => console.log(`${CYAN}[co-run]${OFF} ${message}`);
const fail = (message) => console.error(`${RED}[co-run]${OFF} ${message}`);

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const xmlPath = args.find((arg, at) => !arg.startsWith('--') && !args[at - 1]?.startsWith('--'));
const rawPath = flag('--raw') ?? resolve(dirname(xmlPath ?? '.'), '../../corun/fault-injection-raw.json');
const outPath = flag('--out') ?? process.env.CORUN_EVIDENCE_OUT;
const expectDist = flag('--expect-dist') ?? process.env.CORUN_EXPECT_DIST;
const contextPath = flag('--context') ?? process.env.CORUN_EVIDENCE_CONTEXT;

if (!xmlPath || !existsSync(xmlPath)) {
  fail(`no JUnit XML at ${xmlPath} — the co-run class never ran at all.`);
  process.exit(2);
}

const xml = readFileSync(xmlPath, 'utf8');
const suite = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? '';
const count = (name) => Number(suite.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? '0');

const tests = count('tests');
const failures = count('failures');
const errors = count('errors');
const skipped = count('skipped');

console.log('');
say(`legs executed: ${tests} · failures: ${failures} · errors: ${errors} · skipped: ${skipped}`);

if (tests === 0 || tests === skipped) {
  fail('the co-run executed nothing. An empty run is not a green run.');
  process.exit(1);
}

const decode = (value) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

if (failures > 0 || errors > 0) {
  console.log('');
  fail('the co-run is RED. Each failing leg names the component that refused and what it refused:');
  for (const block of xml.split('<testcase ').slice(1)) {
    const body = block.split('</testcase>')[0];
    if (!/<(failure|error)\b/.test(body)) continue;
    const name = block.match(/name="([^"]+)"/)?.[1] ?? '(unnamed leg)';
    const message = decode(body.match(/<(?:failure|error)[^>]*message="([^"]*)"/)?.[1] ?? '');
    console.log('');
    console.log(`  ── ${name}`);
    for (const line of message.split('\n')) console.log(`     ${line}`);
  }
  console.log('');
  process.exit(1);
}

// ── The measurements. A green XML without them is not the observed co-run. ─────────────────────
if (!existsSync(rawPath)) {
  fail(`the XML is green but ${rawPath} is missing: the legs did not record what they measured.`);
  process.exit(2);
}
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const problems = [];

/** What each leg must have ended as, and which counts it must show. */
const LEGS = {
  base: { status: 'PASSED', error: null, text: 'one published plan runs to PASSED through the real runner', maxForks: 1 },
  duplicate: { status: 'PASSED', error: null, text: 'duplicate requests (public Run, racing dispatchers, wire duplicate, replayed callbacks)', maxForks: 1 },
  ackLoss: { status: 'PASSED', error: null, text: 'acknowledgment loss: the real send, then an ambiguous answer; never a resend', maxForks: 1 },
  publicCancel: { status: 'ERROR', error: 'CANCELLED', text: 'public HTTP cancel in the middle of a step; the browser tree is gone', maxForks: 1 },
  runnerKill: { status: 'ERROR', error: 'STALE', text: 'runner SIGKILL mid-run; recovery settles it; the browser tree is gone', maxForks: 1 },
  restart: { status: null, error: null, text: 'process restart and stale owner: the new process is handed nothing; the old owner is refused', maxForks: 1 },
  lateCallback: { status: 'PASSED', error: null, text: 'late callbacks after the terminal state change nothing', maxForks: 1 },
  afterFaults: { status: 'PASSED', error: null, text: 'a run still passes after every fault', maxForks: 1 },
  secretCanary: { status: 'PASSED', error: null, text: 'a secret saved over the public route reaches the real runner and the real browser, and leaves no form of itself in any database column, runner log, report or stored file', maxForks: 1 },
};

const legs = [];
let runsTotal = 0;
let repeated = 0;
for (const [id, rule] of Object.entries(LEGS)) {
  const recorded = raw.legs?.[id]?.runs ?? [];
  const leg = { id, covers: rule.text, liveRuns: recorded.length, repeatedDispatches: 0, verdict: 'PASS', runs: [] };
  if (recorded.length === 0) {
    leg.verdict = 'MISSING';
    problems.push(`leg ${id} recorded no run`);
  }
  for (const [at, run] of recorded.entries()) {
    runsTotal += 1;
    // The restart leg records two runs per iteration: the old owner's (settled STALE), then the new process's.
    const expected = id === 'restart' ? (at % 2 === 0 ? { status: 'ERROR', error: 'STALE' } : { status: 'PASSED', error: null }) : { status: rule.status, error: rule.error };
    const sends = run.dispatcherSends;
    const forks = run.runnerForks;
    const expectedPosts = 1 + (run.injectedDuplicates ?? 0);
    const mine = [];
    if (sends !== 1) mine.push(`dispatcher sent ${sends} times`);
    if (forks > rule.maxForks) mine.push(`runner forked ${forks} children`);
    if (run.runnerPosts !== expectedPosts) mine.push(`runner saw ${run.runnerPosts} admissions, expected ${expectedPosts}`);
    if (expected.status !== null && run.status !== expected.status) mine.push(`ended ${run.status}, expected ${expected.status}`);
    if (expected.status !== null && (run.errorCode ?? null) !== expected.error) mine.push(`error ${run.errorCode}, expected ${expected.error}`);
    if (run.distDigest && expectDist && run.distDigest !== expectDist) mine.push('dist digest is not the expected one');
    const repeats = (sends > 1 ? sends - 1 : 0) + (forks > 1 ? forks - 1 : 0);
    repeated += repeats;
    leg.repeatedDispatches += repeats;
    if (mine.length > 0) {
      leg.verdict = 'FAIL';
      problems.push(`leg ${id} run ${run.executionId}: ${mine.join('; ')}`);
    }
    leg.runs.push({ ...run, invariantViolations: mine });
  }
  legs.push(leg);
}

// ── The guided leg: the same folded process, a different route set ────────────────────────────
{
  const recorded = raw.legs?.guidedPublicCancel?.runs ?? [];
  const guidedLeg = {
    id: 'guidedPublicCancel',
    covers: 'public HTTP cancel of a live guided browser mid-action: CANCELLED, the browser tree is gone, the one navigation dispatched once, the slot free',
    liveRuns: recorded.length,
    repeatedDispatches: 0,
    verdict: 'PASS',
    runs: [],
  };
  if (recorded.length === 0) {
    guidedLeg.verdict = 'MISSING';
    problems.push('leg guidedPublicCancel recorded no run');
  }
  for (const run of recorded) {
    runsTotal += 1;
    const mine = [];
    if (run.sessionState !== 'CANCELLED') mine.push(`session ended ${run.sessionState}, expected CANCELLED`);
    if (run.guidedBrowsersBeforeCancel < 1) mine.push('no live guided browser was observed before the cancel');
    if (run.guidedBrowsersAfter !== 0) mine.push(`${run.guidedBrowsersAfter} guided browser process(es) survived`);
    if (run.runnerDispatchRoutes !== 1) mine.push(`runner received ${run.runnerDispatchRoutes} action dispatches, expected 1`);
    if (run.actionRows !== 1) mine.push(`${run.actionRows} action rows, expected 1`);
    if (!(run.runnerStopRoutes >= 1)) mine.push('the runner was never told to stop');
    if (!(run.staleOwnerReplays >= 1)) mine.push('the runner\'s own guided callbacks were not replayed after the session ended');
    if (run.distDigest && expectDist && run.distDigest !== expectDist) mine.push('dist digest is not the expected one');
    const repeats = run.runnerDispatchRoutes > 1 ? run.runnerDispatchRoutes - 1 : 0;
    repeated += repeats;
    guidedLeg.repeatedDispatches += repeats;
    if (mine.length > 0) {
      guidedLeg.verdict = 'FAIL';
      problems.push(`leg guidedPublicCancel: ${mine.join('; ')}`);
    }
    guidedLeg.runs.push({ ...run, invariantViolations: mine });
  }
  legs.push(guidedLeg);
}

// ── The forced worker kill with a live guided browser (AC-11 k listing proof) ────────────────
const observations = [];
{
  const recorded = raw.legs?.guidedWorkerKill?.runs ?? [];
  const killLeg = {
    id: 'guidedWorkerKill',
    covers: 'SIGKILL of the folded runner with a live guided browser: no runner process or guided browser survives the window, the in-flight action is never dispatched again, a new runner process is handed none',
    liveRuns: recorded.length,
    repeatedDispatches: 0,
    verdict: 'PASS',
    runs: [],
  };
  if (recorded.length === 0) {
    killLeg.verdict = 'MISSING';
    problems.push('leg guidedWorkerKill recorded no run');
  }
  for (const run of recorded) {
    runsTotal += 1;
    const mine = [];
    if (run.survivorsAfterWindow !== 0) mine.push(`${run.survivorsAfterWindow} process(es) of the killed runner outlived ${run.orphanWindowMs} ms`);
    if (run.guidedBrowsersAfterWindow !== 0) mine.push(`${run.guidedBrowsersAfterWindow} guided browser process(es) outlived ${run.orphanWindowMs} ms`);
    if (run.newRunnerDispatchRoutes !== 0) mine.push(`the new runner process was handed ${run.newRunnerDispatchRoutes} action dispatch(es)`);
    if (run.actionRows !== 1) mine.push(`${run.actionRows} action rows, expected 1`);
    if (run.runnerDispatchRoutes !== 1) mine.push(`the killed runner received ${run.runnerDispatchRoutes} dispatches, expected 1`);
    if (run.distDigest && expectDist && run.distDigest !== expectDist) mine.push('dist digest is not the expected one');
    const repeats = (run.runnerDispatchRoutes > 1 ? run.runnerDispatchRoutes - 1 : 0) + (run.newRunnerDispatchRoutes > 0 ? run.newRunnerDispatchRoutes : 0);
    repeated += repeats;
    killLeg.repeatedDispatches += repeats;
    if (run.sessionStateAfterKill !== 'UNKNOWN_OUTCOME') {
      observations.push(`guidedWorkerKill: the session was ${run.sessionStateAfterKill} ${run.sessionSettledAfterMs} ms after the kill (terminal within 60 s: ${run.sessionTerminalWithin60s}); AC-11 says an unknown action stops as UNKNOWN_OUTCOME`);
    }
    if (mine.length > 0) {
      killLeg.verdict = 'FAIL';
      problems.push(`leg guidedWorkerKill: ${mine.join('; ')}`);
    }
    killLeg.runs.push({ ...run, invariantViolations: mine });
  }
  legs.push(killLeg);
}

const leg = (id) => raw.legs?.[id]?.runs ?? [];
for (const run of leg('secretCanary')) {
  const x = run.leg ?? {};
  if (x.canaryTypedByTheRealBrowser !== true) problems.push(`secretCanary ${run.executionId}: the real browser did not receive the value`);
  if (x.databaseHits !== 0) problems.push(`secretCanary ${run.executionId}: ${x.databaseHits} database column(s) hold a form of the canary`);
  if (x.surfaceHits !== 0) problems.push(`secretCanary ${run.executionId}: ${x.surfaceHits} runner log, report or stored file hit(s)`);
  if (!(x.databaseTables > 30 && x.databaseColumns > 200)) problems.push(`secretCanary ${run.executionId}: the scan reached only ${x.databaseTables} tables / ${x.databaseColumns} columns`);
}
for (const run of leg('publicCancel')) {
  if (run.leg?.browserTreeSurvivorsAfterSettle !== 0) problems.push(`publicCancel ${run.executionId}: browser tree survived`);
}
for (const run of leg('runnerKill')) {
  if (run.leg?.orphansAfterWindow !== 0) problems.push(`runnerKill ${run.executionId}: processes of the killed runner outlived ${run.leg?.orphanWindowMs} ms`);
}

// ── RUNNER-LAUNCH: REL-001 pointer and the D4 15 s edge, on every runner generation. ──────────
const generations = raw.launchAttribution ?? [];
const classes = {};
const recurrences = [];
for (const generation of generations) {
  for (const line of generation.guidedStartFailedLines ?? []) {
    classes[line.classification] = (classes[line.classification] ?? 0) + 1;
    if (line.classification === 'REL001_RECURRENCE') {
      recurrences.push({ runnerGeneration: generation.runnerGeneration, ...line });
    }
  }
}
for (const run of raw.legs?.runnerKill?.runs ?? []) {
  const slowest = Math.max(0, ...(run.leg?.childrenVanished ?? []).map((c) => c.afterKillMs));
  observations.push(`runnerKill: the killed runner's replay child and browser tree lived ${slowest} ms after the SIGKILL with a ${run.leg?.stepTimeoutSeconds} s step timeout (nothing in the runner can reap them; they leave when their own step ends)`);
}
const attribution = {
  rule: 'AC-11 REL-001 pointer (innermost non-TIMEOUT cause, or kind TIMEOUT, is a recurrence; innermost code CANCELLED is exempt only with a stop that reached the runner first) and the AC-12 15 s edge (innermost code TIMEOUT with elapsedMs >= 15000 and a bootstrap UNKNOWN_OUTCOME is D4 case (a)/(b), not REL-001)',
  runnerGenerations: generations.length,
  guidedEnabledGenerations: generations.filter((g) => g.guidedEnabled).length,
  guidedStartFailedLines: generations.reduce((n, g) => n + (g.startFailedCount ?? 0), 0),
  classifications: classes,
  rel001Recurrences: recurrences,
  hostLoad: {
    maxAtStart: Math.max(0, ...generations.map((g) => g.loadAtStart ?? 0)),
    maxAtEnd: Math.max(0, ...generations.map((g) => g.loadAtEnd ?? 0)),
  },
  note: 'A count of 0 is a count, not a root cause (gate section 0 item 1).',
};

if (expectDist && raw.distDigest !== expectDist) {
  problems.push(`the run's dist digest ${raw.distDigest} is not the expected ${expectDist}: this run does not count`);
}

const evidence = {
  schema: 'studio-observed-authoring/fault-injection/v1',
  story: 'STUDIO-OBS-009',
  scope: 'AC-11 base legs: duplicate, acknowledgment loss, restart, stale owner, late callback, public mid-step cancel, runner kill',
  harness: 'backend/src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java',
  generatedBy: 'tools/corun-report.mjs',
  generatedAt: new Date().toISOString(),
  dist: { digest: raw.distDigest, expected: expectDist ?? null, matchesExpected: expectDist ? raw.distDigest === expectDist : null },
  junit: { class: 'com.citi.put.checks.corun.ObservedCoRunIT', tests, failures, errors, skipped, xmlSha256: createHash('sha256').update(xml).digest('hex') },
  rawSha256: createHash('sha256').update(readFileSync(rawPath)).digest('hex'),
  denominators: { runs: runsTotal, legs: legs.length, repeatedDispatches: repeated },
  zeroRepeatedDispatches: repeated === 0 && problems.length === 0,
  legs,
  launchAttribution: attribution,
  observations,
  problems,
};

// Facts the test cannot know about itself (collector receipts, negative controls, named proofs
// re-run elsewhere, what is not claimed). Only these keys are taken, so a context file can add to
// the document but never overwrite a measurement.
if (contextPath) {
  const context = JSON.parse(readFileSync(contextPath, 'utf8'));
  for (const key of ['collector', 'negativeControls', 'reusedProofs', 'notClaimed', 'owedExternally', 'findings']) {
    if (key in context) evidence[key] = context[key];
  }
}

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  say(`evidence written to ${outPath}`);
}

console.log('');
for (const item of legs) {
  say(`${item.verdict.padEnd(7)} ${item.id.padEnd(13)} runs=${item.liveRuns} repeatedDispatches=${item.repeatedDispatches}  ${item.covers}`);
}
say(`runs: ${runsTotal} · repeated dispatches: ${repeated} · runner generations: ${generations.length} · GUIDED_START_FAILED lines: ${attribution.guidedStartFailedLines}`);

for (const note of observations) say(`observation: ${note}`);

if (problems.length > 0) {
  console.log('');
  fail('the co-run is RED on its own measurements:');
  for (const problem of problems) console.log(`  - ${problem}`);
  console.log('');
  process.exit(1);
}
if (recurrences.length > 0) {
  fail(`${recurrences.length} REL-001 recurrence(s) recorded. The run is not credited; open a root-cause item (owner @dev runner, with @architect and @qa).`);
  process.exit(3);
}

say('the co-run is GREEN: the API and the studio-runner ran together and agreed on every leg.');
process.exit(0);
