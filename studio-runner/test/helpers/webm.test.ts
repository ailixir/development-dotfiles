/**
 * Story 10.16b AC-17: the seek-measurement frame finder, run on frames from real recordings.
 *
 * `test/fixtures-tier/seek-measurement.test.ts` failed intermittently: the median assertion,
 * twice in ten runs during AC-15. This file keeps the evidence for why, in the default tier, so
 * the fix stays checked on every `npm test` and not only when real Chromium is available.
 *
 * ## Where the frames come from
 *
 * Nothing below was written to fit the fix. Each frame list is the complete `readWebmFrames`
 * output for a `.webm` that the **unmodified** fixtures tier recorded during AC-15. The file was
 * hard-linked by a scratch process outside the tree before `outcome.clear()` removed it. Each
 * `reportedMs` and `unmodifiedMatchMs` is copied from the `SEEK run=… step=…` table that run
 * printed. Every mis-attributed step here comes from a row of AC-15's table; see the story's Dev
 * Agent Record (10.16b) for all ten runs.
 *
 * Expected values are **literals transcribed from those runs**, never computed by the helper under
 * test (vacuous-guard shape #11).
 *
 * ## What each check is for
 *
 * - (a) Under the helper as it was (slack 60 ms), the step is mis-attributed. This reproduces the
 *   printed error, so the transcription is checked against the run that produced it.
 * - (b) Under the helper as it is, the step is matched to the change at its visible effect.
 * - (c) Every step of the same recording that was attributed correctly before is still matched to
 *   the same frame.
 * - (d) The fix changes only `firstChangeAtOrAfter`'s default `slackMs`. That is shown by the
 *   story's `git diff`, not asserted here. What this file can show is that (a) is still expressible
 *   on the fixed helper by passing the old default back in.
 *
 * ## What the two recordings bound
 *
 * `AC15_RUN7` is the flake itself: three steps with leads of 65.8–78.2 ms, and the median failed.
 * `AC15_RUN3` has the widest lead observed (85.3 ms), so any slack at or below that fails (b).
 * It also has a change that belongs to no step, 320.7 ms before step 4's reported start, so any
 * slack above that fails (c). Together they bound the slack to (85.3, 320.7) ms. They do **not**
 * pick 100 within that interval; the helper's doc comment gives the reason for that value.
 *
 * ## What the boundary test adds (10.16b QA fix F-1)
 *
 * The reason the helper gives is a property: the slack is at least the measurement's own tolerance,
 * so a step whose repaint lies within tolerance before its reported start can never be matched to a
 * later change. No captured lead is wider than 85.3 ms, so (b) cannot tell 90 from 100. The last
 * test places a step just under one tolerance after each transcribed effect and requires the match
 * to be that effect. The tolerance is read from `seek-measurement.test.ts`, the file that asserts
 * it, as text; that is a read, not an import and not an edit (AC-16), and it is not the module
 * under test.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { firstChangeAtOrAfter, lastChangeAtOrBefore, sceneChanges } from './webm.js';
import type { WebmFrame } from './webm.js';

/** `firstChangeAtOrAfter`'s default before story 10.16b. Kept so check (a) stays executable. */
const UNMODIFIED_SLACK_MS = 60;

const SEEK_MEASUREMENT_URL = new URL('../fixtures-tier/seek-measurement.test.ts', import.meta.url);

/** Block comments and whole-line `//` comments, which is every comment form that file uses. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

/**
 * The measurement's own tolerance, read out of `seek-measurement.test.ts` rather than copied, so the
 * boundary test below follows it if it ever changes. Importing it is not possible: the file does not
 * export it, and AC-16 forbids editing it.
 *
 * F-7 (10.16b gate): reading the declaration alone is not enough. The value read must also be the
 * value the median assertion compares against. With comments removed, the source must hold:
 *
 * 1. exactly one top-level `const MEDIAN_TOLERANCE_MS = <integer>;` (the value read);
 * 2. exactly one `.toBeLessThan(MEDIAN_TOLERANCE_MS);`, so the assertion compares against the name
 *    itself and not against an expression built from it;
 * 3. exactly two occurrences of the name: that declaration and that assertion. Any other
 *    declaration, at any indentation and in any form (`const`, `let`, `var`, destructured, a
 *    parameter), adds one, and so does any second use. This rule is also what counts
 *    declarations at any indentation, as the gate suggested. A separate declaration count could
 *    never fail without this rule failing too, so there is none.
 *
 * Anything else fails loudly. The `F-7` describe block at the end plants each form this refuses.
 */
function medianToleranceIn(source: string): number {
  const code = withoutComments(source);
  const values = [...code.matchAll(/^const MEDIAN_TOLERANCE_MS = ([\d_]+);$/gmu)];
  const assertions = code.split('.toBeLessThan(MEDIAN_TOLERANCE_MS);').length - 1;
  const mentions = code.match(/\bMEDIAN_TOLERANCE_MS\b/gu) ?? [];
  const problems: string[] = [];
  if (values.length !== 1) {
    problems.push(
      `exactly one top-level "const MEDIAN_TOLERANCE_MS = <integer>;", found ${String(values.length)}`,
    );
  }
  if (assertions !== 1) {
    problems.push(`exactly one ".toBeLessThan(MEDIAN_TOLERANCE_MS);", found ${String(assertions)}`);
  }
  if (mentions.length !== 2) {
    const found = String(mentions.length);
    problems.push(`the name twice outside comments (declaration, assertion), found ${found}`);
  }
  const literal = values[0]?.[1];
  if (problems.length > 0 || literal === undefined) {
    throw new Error(`MEDIAN_TOLERANCE_MS cannot be read safely; expected ${problems.join('; ')}`);
  }
  return Number(literal.replaceAll('_', ''));
}

const SEEK_MEASUREMENT_SOURCE = readFileSync(SEEK_MEASUREMENT_URL, 'utf8');
const MEDIAN_TOLERANCE_MS = medianToleranceIn(SEEK_MEASUREMENT_SOURCE);

/**
 * How far inside the tolerance the boundary step sits. 0.1 ms is the resolution at which the
 * fixtures tier prints `reported=`, so it is the closest to the boundary a recorded step can be
 * written down. It is a literal because nothing in the tree measures a resolution; it is not a
 * second copy of the tolerance.
 */
const PRINTED_RESOLUTION_MS = 0.1;

interface TranscribedStep {
  readonly stepIndex: number;
  /** `reported=` from the SEEK table (printed to 0.1 ms). */
  readonly reportedMs: number;
  /** `frame=` from the SEEK table: what the unmodified helper matched. */
  readonly unmodifiedMatchMs: number;
  /** `error=` from the SEEK table. */
  readonly printedErrorMs: number;
  /** The change carrying this step's repaint, read off the frame list. */
  readonly effectMs: number;
}

interface TranscribedRecording {
  readonly name: string;
  readonly provenance: string;
  /** `sceneChanges(frames)` as the fixtures tier computed it, with the unmodified helper. */
  readonly changesMs: readonly number[];
  readonly steps: readonly TranscribedStep[];
  readonly frames: readonly WebmFrame[];
}

function frames(pairs: readonly (readonly [number, number])[]): readonly WebmFrame[] {
  return pairs.map(([atMs, bytes]) => ({ atMs, bytes }));
}

const AC15_RUN7: TranscribedRecording = {
  name: 'AC-15 run 7, inner run 1',
  provenance:
    'AC-15 run 7 of 10, `npm run test:fixtures`, FAILED: "median seek error was 454.2ms across 5 ' +
    'steps: expected 454.1913749999999 to be less than 100". Recording ' +
    'page@b59fd107dfdc691e3b7b103a639a6914.webm, sha256 b79cd105beae0f82dde66cb483c63493e8ae7165a' +
    '42b302b5b4384405097e563, 1699987 bytes, 140 frames.',
  changesMs: [0, 720, 1400, 2120, 2840, 3360, 4000, 4760, 4960, 5120, 5400],
  steps: [
    { stepIndex: 0, reportedMs: 1.2, unmodifiedMatchMs: 0, printedErrorMs: -1.2, effectMs: 0 },
    { stepIndex: 1, reportedMs: 759.9, unmodifiedMatchMs: 720, printedErrorMs: -39.9, effectMs: 720 },
    { stepIndex: 2, reportedMs: 1478.2, unmodifiedMatchMs: 2120, printedErrorMs: 641.8, effectMs: 1400 },
    { stepIndex: 3, reportedMs: 2192.0, unmodifiedMatchMs: 2840, printedErrorMs: 648.0, effectMs: 2120 },
    // The failure message gives this step's unrounded offset: 3360 - 454.1913749999999.
    { stepIndex: 4, reportedMs: 2905.808625, unmodifiedMatchMs: 3360, printedErrorMs: 454.2, effectMs: 2840 },
  ],
  frames: frames([
    [0, 225741], [40, 132], [80, 104], [120, 104], [160, 104], [200, 104], [240, 104], [280, 104],
    [320, 104], [360, 104], [400, 104], [440, 104], [480, 104], [520, 104], [560, 136], [600, 296],
    [640, 710], [680, 848], [720, 86776], [760, 134779], [800, 104], [840, 104], [880, 104],
    [920, 104], [960, 104], [1000, 104], [1040, 104], [1080, 104], [1120, 104], [1160, 104],
    [1200, 104], [1240, 104], [1280, 114], [1320, 2038], [1360, 104], [1400, 222483], [1440, 159],
    [1480, 104], [1520, 104], [1560, 104], [1600, 104], [1640, 104], [1680, 104], [1720, 104],
    [1760, 104], [1800, 104], [1840, 104], [1880, 104], [1920, 108], [1960, 161], [2000, 316],
    [2040, 827], [2080, 639], [2120, 204361], [2160, 159], [2200, 104], [2240, 104], [2280, 104],
    [2320, 104], [2360, 104], [2400, 104], [2440, 104], [2480, 104], [2520, 104], [2560, 104],
    [2600, 104], [2640, 104], [2680, 153], [2720, 369], [2760, 873], [2800, 889], [2840, 191150],
    [2880, 159], [2920, 104], [2960, 104], [3000, 104], [3040, 104], [3080, 104], [3120, 104],
    [3160, 104], [3200, 151], [3240, 401], [3280, 887], [3320, 121], [3360, 52630], [3400, 104],
    [3440, 104], [3480, 104], [3520, 104], [3560, 567], [3600, 2698], [3640, 22871], [3680, 104],
    [3720, 107], [3760, 168], [3800, 188], [3840, 27086], [3880, 104], [3920, 104], [3960, 134],
    [4000, 43792], [4040, 104], [4080, 104], [4120, 109], [4160, 535], [4200, 830], [4240, 9876],
    [4280, 325], [4320, 1618], [4360, 17065], [4400, 104], [4440, 1614], [4480, 1362],
    [4520, 25910], [4560, 152], [4600, 374], [4640, 1202], [4680, 612], [4720, 2105],
    [4760, 28824], [4800, 149], [4840, 298], [4880, 712], [4920, 1347], [4960, 33985], [5000, 104],
    [5040, 127], [5080, 1358], [5120, 89832], [5160, 117487], [5200, 104], [5240, 104],
    [5280, 104], [5320, 104], [5360, 104], [5400, 127302], [5440, 104], [5480, 104], [5520, 104],
    [5560, 104],
  ]),
};

const AC15_RUN3: TranscribedRecording = {
  name: 'AC-15 run 3, inner run 2',
  provenance:
    'AC-15 run 3 of 10, `npm run test:fixtures`, passed (one step over 100 ms; median 11.3 ms). ' +
    'Recording page@865d4dd3409e2dffc9a8471334847fa9.webm, sha256 b0fea7db4fd2a4789aaaa5f3cf2ad54c4' +
    '778dc5b3b7c05b5f66a7b36d2978a1c, 141 frames. Step 3\'s repaint is split across 2120 and 2200 ' +
    'with a small frame between them, and is grouped at 2120. The change at 2600 belongs to no step.',
  changesMs: [0, 760, 1480, 2120, 2600, 2880, 4240, 4680, 4960, 5120],
  steps: [
    { stepIndex: 0, reportedMs: 1.2, unmodifiedMatchMs: 0, printedErrorMs: -1.2, effectMs: 0 },
    { stepIndex: 1, reportedMs: 764.3, unmodifiedMatchMs: 760, printedErrorMs: -4.3, effectMs: 760 },
    { stepIndex: 2, reportedMs: 1491.3, unmodifiedMatchMs: 1480, printedErrorMs: -11.3, effectMs: 1480 },
    { stepIndex: 3, reportedMs: 2205.3, unmodifiedMatchMs: 2600, printedErrorMs: 394.7, effectMs: 2120 },
    { stepIndex: 4, reportedMs: 2920.7, unmodifiedMatchMs: 2880, printedErrorMs: -40.7, effectMs: 2880 },
  ],
  frames: frames([
    [0, 225205], [40, 1026], [80, 160], [120, 104], [160, 104], [200, 104], [240, 104], [280, 104],
    [320, 104], [360, 104], [400, 104], [440, 104], [480, 160], [520, 475], [560, 403], [600, 567],
    [640, 584], [680, 813], [720, 104], [760, 185880], [800, 161], [840, 104], [880, 104],
    [920, 104], [960, 104], [1000, 104], [1040, 104], [1080, 104], [1120, 104], [1160, 104],
    [1200, 104], [1240, 118], [1280, 293], [1320, 646], [1360, 1019], [1400, 552], [1440, 104],
    [1480, 183007], [1520, 158], [1560, 104], [1600, 104], [1640, 104], [1680, 104], [1720, 104],
    [1760, 104], [1800, 104], [1840, 104], [1880, 104], [1920, 104], [1960, 149], [2000, 255],
    [2040, 640], [2080, 781], [2120, 54803], [2160, 104], [2200, 87001], [2240, 4602], [2280, 201],
    [2320, 122], [2360, 104], [2400, 104], [2440, 104], [2480, 104], [2520, 5951], [2560, 125],
    [2600, 80844], [2640, 104], [2680, 104], [2720, 104], [2760, 104], [2800, 104], [2840, 129],
    [2880, 87360], [2920, 71860], [2960, 104], [3000, 104], [3040, 104], [3080, 104], [3120, 104],
    [3160, 104], [3200, 104], [3240, 104], [3280, 104], [3320, 104], [3360, 104], [3400, 2525],
    [3440, 104], [3480, 6320], [3520, 104], [3560, 104], [3600, 104], [3640, 18204], [3680, 104],
    [3720, 104], [3760, 104], [3800, 104], [3840, 104], [3880, 157], [3920, 197], [3960, 14287],
    [4000, 104], [4040, 104], [4080, 104], [4120, 104], [4160, 330], [4200, 312], [4240, 170018],
    [4280, 104], [4320, 104], [4360, 104], [4400, 104], [4440, 104], [4480, 104], [4520, 104],
    [4560, 145], [4600, 370], [4640, 104], [4680, 59525], [4720, 104], [4760, 104], [4800, 104],
    [4840, 146], [4880, 661], [4920, 2299], [4960, 67172], [5000, 104], [5040, 104], [5080, 104],
    [5120, 89832], [5160, 71959], [5200, 104], [5240, 104], [5280, 104], [5320, 104], [5360, 104],
    [5400, 108], [5440, 104], [5480, 135], [5520, 11769], [5560, 104], [5600, 104],
  ]),
};

const RECORDINGS: readonly TranscribedRecording[] = [AC15_RUN7, AC15_RUN3];

const misAttributed = (recording: TranscribedRecording): readonly TranscribedStep[] =>
  recording.steps.filter((step) => step.unmodifiedMatchMs !== step.effectMs);
const correctlyAttributed = (recording: TranscribedRecording): readonly TranscribedStep[] =>
  recording.steps.filter((step) => step.unmodifiedMatchMs === step.effectMs);

describe('AC-17 — the seek frame finder on frames from real AC-15 recordings', () => {
  it('carries the recordings and step populations it was transcribed with', () => {
    // A total, read explicitly, so that deleting a recording or a step reddens here (shape #18).
    expect(RECORDINGS.map((recording) => recording.name)).toEqual([
      'AC-15 run 7, inner run 1',
      'AC-15 run 3, inner run 2',
    ]);
    expect(RECORDINGS.map((recording) => recording.frames.length)).toEqual([140, 141]);
    expect(RECORDINGS.map((recording) => misAttributed(recording).map((step) => step.stepIndex))).toEqual([
      [2, 3, 4],
      [3],
    ]);
    expect(
      RECORDINGS.map((recording) => correctlyAttributed(recording).map((step) => step.stepIndex)),
    ).toEqual([
      [0, 1],
      [0, 1, 2, 4],
    ]);
  });

  it('reproduces the change list the fixtures tier computed from each recording', () => {
    for (const recording of RECORDINGS) {
      expect(
        sceneChanges(recording.frames).map((change) => change.atMs),
        recording.name,
      ).toEqual(recording.changesMs);
    }
  });

  it('(a) mis-attributes each transcribed step under the unmodified slack, exactly as printed', () => {
    let checked = 0;
    for (const recording of RECORDINGS) {
      const changes = sceneChanges(recording.frames);
      for (const step of misAttributed(recording)) {
        const match = firstChangeAtOrAfter(changes, step.reportedMs, UNMODIFIED_SLACK_MS);
        const label = `${recording.name} step ${String(step.stepIndex)}`;
        expect(match?.atMs, label).toBe(step.unmodifiedMatchMs);
        const errorMs = (match?.atMs ?? Number.NaN) - step.reportedMs;
        expect(errorMs, label).toBeCloseTo(step.printedErrorMs, 1);
        expect(Math.abs(errorMs), label).toBeGreaterThan(MEDIAN_TOLERANCE_MS);
        checked += 1;
      }
    }
    expect(checked).toBe(4);
  });

  it('(b) matches each of those steps to the change at its visible effect, within tolerance', () => {
    let checked = 0;
    for (const recording of RECORDINGS) {
      const changes = sceneChanges(recording.frames);
      for (const step of misAttributed(recording)) {
        const match = firstChangeAtOrAfter(changes, step.reportedMs);
        const label = `${recording.name} step ${String(step.stepIndex)}`;
        expect(match?.atMs, label).toBe(step.effectMs);
        expect(Math.abs((match?.atMs ?? Number.NaN) - step.reportedMs), label).toBeLessThan(
          MEDIAN_TOLERANCE_MS,
        );
        checked += 1;
      }
    }
    expect(checked).toBe(4);
  });

  it('(c) still matches every correctly attributed step of the same recordings to the same frame', () => {
    let checked = 0;
    for (const recording of RECORDINGS) {
      const changes = sceneChanges(recording.frames);
      for (const step of correctlyAttributed(recording)) {
        const label = `${recording.name} step ${String(step.stepIndex)}`;
        // Under the unmodified slack: the transcription agrees with the printed table.
        expect(firstChangeAtOrAfter(changes, step.reportedMs, UNMODIFIED_SLACK_MS)?.atMs, label).toBe(
          step.unmodifiedMatchMs,
        );
        // Under the fix: the same frame, compared with the transcribed literal.
        expect(firstChangeAtOrAfter(changes, step.reportedMs)?.atMs, label).toBe(step.effectMs);
        checked += 1;
      }
    }
    expect(checked).toBe(6);
  });

  it('matches a step reported just under one tolerance after a repaint to that repaint', () => {
    // The tolerance must be the one the measurement asserts, and a real number of milliseconds.
    expect(MEDIAN_TOLERANCE_MS).toBeGreaterThan(PRINTED_RESOLUTION_MS);
    let checked = 0;
    for (const recording of RECORDINGS) {
      const changes = sceneChanges(recording.frames);
      for (const step of recording.steps) {
        // The step's own repaint, stamped as early as a step can still be in tolerance.
        const reportedMs = step.effectMs + MEDIAN_TOLERANCE_MS - PRINTED_RESOLUTION_MS;
        const label = `${recording.name} step ${String(step.stepIndex)}, reported ${String(reportedMs)}`;
        // The step really is at the boundary: a slack two print steps narrower already loses it.
        // Without this, moving `reportedMs` onto the effect would leave the test green.
        const narrowerSlackMs = MEDIAN_TOLERANCE_MS - 2 * PRINTED_RESOLUTION_MS;
        expect(firstChangeAtOrAfter(changes, reportedMs, narrowerSlackMs)?.atMs, label).not.toBe(
          step.effectMs,
        );
        const match = firstChangeAtOrAfter(changes, reportedMs);
        expect(match?.atMs, label).toBe(step.effectMs);
        expect(Math.abs((match?.atMs ?? Number.NaN) - reportedMs), label).toBeLessThan(
          MEDIAN_TOLERANCE_MS,
        );
        checked += 1;
      }
    }
    expect(checked).toBe(10);
  });
});

/**
 * Story 10.32 AC-7 — the signed lead the median failure message now prints.
 *
 * Every expected value is a literal read by hand off `changesMs` and `reportedMs` above, never
 * produced by `lastChangeAtOrBefore` or a sibling helper (shape #11). The step 4 case is the run
 * whose failure printed `+454.2ms`: the old forward match landed on 3360, and the change actually
 * at or before the step is 2840, a lead of about −65.8 ms.
 */
describe('story 10.32 AC-7 — the nearest earlier change, for a signed lead', () => {
  it('reads AC-15 run 7 step 4 as a small negative lead, not the printed +454.2 ms', () => {
    const changes = sceneChanges(AC15_RUN7.frames);
    const earlier = lastChangeAtOrBefore(changes, 2905.808625);
    expect(earlier?.atMs).toBe(2840);
    expect((earlier?.atMs ?? Number.NaN) - 2905.808625).toBeCloseTo(-65.808625, 6);
    // The forward match under the old slack is the number the failure used to print.
    expect(firstChangeAtOrAfter(changes, 2905.808625, UNMODIFIED_SLACK_MS)?.atMs).toBe(3360);
  });

  it('reads step 0 of both recordings against the recording’s own first frame', () => {
    for (const recording of [AC15_RUN7, AC15_RUN3]) {
      const earlier = lastChangeAtOrBefore(sceneChanges(recording.frames), 1.2);
      expect(earlier?.atMs, recording.name).toBe(0);
      expect((earlier?.atMs ?? Number.NaN) - 1.2, recording.name).toBeCloseTo(-1.2, 6);
    }
  });

  it('takes a change exactly at the offset, and reports none before the first change', () => {
    const changes = sceneChanges(AC15_RUN7.frames);
    expect(lastChangeAtOrBefore(changes, 720)?.atMs).toBe(720);
    expect(lastChangeAtOrBefore(changes, -1)).toBeNull();
    expect(lastChangeAtOrBefore([], 100)).toBeNull();
  });
});

describe('F-7 — the tolerance read refuses every form that would decouple it from the assertion', () => {
  /** Applies one exact edit to the real file's text; the anchor must occur exactly once. */
  const edited = (source: string, anchor: string | RegExp, replacement: string): string => {
    const count =
      typeof anchor === 'string'
        ? source.split(anchor).length - 1
        : [...source.matchAll(new RegExp(anchor.source, `${anchor.flags}g`))].length;
    expect(count, `anchor ${String(anchor)}`).toBe(1);
    return source.replace(anchor, replacement);
  };
  const DECLARATION = /^const MEDIAN_TOLERANCE_MS = [\d_]+;$/mu;
  const ASSERTION = '.toBeLessThan(MEDIAN_TOLERANCE_MS);';
  const real = SEEK_MEASUREMENT_SOURCE;

  it.each([
    [
      'S7: the assertion compares against an expression',
      edited(real, ASSERTION, '.toBeLessThan(MEDIAN_TOLERANCE_MS + 50);'),
    ],
    [
      'S8: an indented const shadows it in an inner scope',
      `${real}\ndescribe('x', () => {\n  const MEDIAN_TOLERANCE_MS = 150;\n});\n`,
    ],
    [
      'S10: the declaration is reformatted and a column-0 copy sits in a block comment',
      `${edited(real, DECLARATION, 'const MEDIAN_TOLERANCE_MS: number = 150;')}\n/*\nconst MEDIAN_TOLERANCE_MS = 100;\n*/\n`,
    ],
    [
      'S7 with the exact assertion text left behind in a comment',
      `${edited(real, ASSERTION, '.toBeLessThan(MEDIAN_TOLERANCE_MS + 50);')}\n// expect(x).toBeLessThan(MEDIAN_TOLERANCE_MS);\n`,
    ],
    [
      'a destructured shadow',
      `${real}\nconst { MEDIAN_TOLERANCE_MS = 150 } = {} as { MEDIAN_TOLERANCE_MS?: number };\n`,
    ],
    [
      'a parameter shadow',
      `${real}\nconst widened = (MEDIAN_TOLERANCE_MS = 150): number => MEDIAN_TOLERANCE_MS;\n`,
    ],
    [
      'a column-0 copy inside a template string',
      `${real}\nconst text = \`\nconst MEDIAN_TOLERANCE_MS = 500;\n\`;\n`,
    ],
    ['a let declaration beside the const', `${real}\nlet MEDIAN_TOLERANCE_MS = 150;\n`],
    ['the assertion removed', edited(real, ASSERTION, '.toBeLessThan(OUTLIER_BOUND_MS);')],
  ])('refuses %s', (_name, planted) => {
    expect(() => medianToleranceIn(planted)).toThrow(/cannot be read safely/u);
  });

  it('follows a changed value and ignores a line comment, on otherwise real text', () => {
    const retyped = edited(real, DECLARATION, 'const MEDIAN_TOLERANCE_MS = 1_20;');
    expect(medianToleranceIn(retyped)).toBe(120);
    const commented = `${real}\n// const MEDIAN_TOLERANCE_MS = 150;\n`;
    expect(medianToleranceIn(commented)).toBe(MEDIAN_TOLERANCE_MS);
  });
});
