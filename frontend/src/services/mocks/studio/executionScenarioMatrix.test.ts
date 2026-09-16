import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEV_TRANSPORT_SCENARIO,
  EXECUTION_SCENARIO_MATRIX,
} from './executionScenarios';

/**
 * Story 10.11b — **AC-22** (this story's share) and the shape half of **AC-17**.
 *
 * @po's finding on story 10.10's AC-20 is the reason this file exists: *"If the level-2 truncation
 * fixture is never written, AC-7 does not go red; the test simply does not exist, and a green suite
 * is indistinguishable from a covered one."* A matrix that nothing checks has the same failure
 * mode, so the matrix is data and this test is what makes an unreferenced entry fail.
 *
 * AC-17 is named in the story's own *Weakest criteria* list for exactly this reason — *"a fixture
 * with a list of required frames, and nothing outside AC-22's matrix notices if the list shrinks"*.
 * So the required frames are asserted here, one assertion per frame, by property rather than by
 * index count.
 */

const SUITE_FILES = [
  '../../api/studioSseStreaming.node.test.ts',
  '../../api/studioTransport.node.test.ts',
  '../../../pages/ChecksStudioPage/studioRunTransport.node.test.tsx',
];

function namedTestTitles(): string[] {
  const titles: string[] = [];
  for (const relative of SUITE_FILES) {
    const file = path.resolve(__dirname, relative);
    expect(fs.existsSync(file), `${relative} is missing from this story's suite`).toBe(true);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bit\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      titles.push(match[2]);
    }
  }
  return titles;
}

describe('AC-22: the scenario matrix is enumerable and every entry is referenced by a named test', () => {
  it('finds a named test for every matrix entry', () => {
    const titles = namedTestTitles();
    expect(titles.length, 'no test titles were found — the scan is broken, not the coverage')
      .toBeGreaterThan(10);

    const unreferenced = EXECUTION_SCENARIO_MATRIX.filter(
      (entry) => !titles.some((title) => title.includes(entry.id)),
    ).map((entry) => entry.id);

    expect(unreferenced, 'matrix entries with no named test').toEqual([]);
  });

  it('every entry declares the criteria it serves, and the ids are unique', () => {
    const ids = EXECUTION_SCENARIO_MATRIX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of EXECUTION_SCENARIO_MATRIX) {
      expect(entry.criteria.length, `${entry.id} names no criterion`).toBeGreaterThan(0);
      expect(entry.what.length, `${entry.id} has no description`).toBeGreaterThan(0);
    }
  });

  it('covers every transport criterion this story owns', () => {
    const covered = new Set(EXECUTION_SCENARIO_MATRIX.flatMap((entry) => entry.criteria));
    // AC-7, AC-8 and AC-15 are surface/registry properties rather than frame sequences; the rest
    // of this story's criteria each need at least one scenario, and this is what says so.
    for (const criterion of ['AC-9', 'AC-10', 'AC-11', 'AC-12', 'AC-13', 'AC-14', 'AC-16', 'AC-17', 'AC-20']) {
      expect(covered.has(criterion), `no scenario serves ${criterion}`).toBe(true);
    }
  });
});

describe('AC-17: the mocked development scenario drives the frames the criterion names, in order', () => {
  it('SCN-DEV-TRANSPORT: a step transition, a log append, a truncation frame, a terminal outcome with evidence PROCESSING, and a settled final frame', () => {
    const frames = DEV_TRANSPORT_SCENARIO;
    expect(frames.length).toBeGreaterThanOrEqual(5);

    // Monotonic, and every frame is a separate revision — otherwise the ordering rule would drop
    // them and the development path would show one update instead of five.
    const revisions = frames.map((frame) => frame.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);

    // **In order** is part of the criterion, so the five events are located by index and the
    // indices are asserted to be strictly increasing. Asserting only that each event occurs
    // somewhere is weaker than it looks: measured, the falsification M15 — flipping the truncation
    // frame's flag off — left an "occurs somewhere" version of this test green, because two later
    // frames also carry the flag.
    const iTransition = frames.findIndex((frame, index) => {
      if (index === 0) return false;
      const before = frames[index - 1].stepResults.findIndex((step) => step.status === 'RUNNING');
      const after = frame.stepResults.findIndex((step) => step.status === 'RUNNING');
      return after > before;
    });
    expect(iTransition, 'no frame transitions the running step').toBeGreaterThan(-1);

    const iLogAppend = frames.findIndex(
      (frame, index) => index > iTransition && frame.logs.length > frames[index - 1].logs.length,
    );
    expect(iLogAppend, 'no frame after the step transition appends a log line').toBeGreaterThan(-1);

    const iTruncation = frames.findIndex((frame) => frame.logsTruncated === true);
    expect(iTruncation, 'no frame reports retained logs at the cap').toBeGreaterThan(-1);
    expect(frames.some((frame) => frame.logsTruncated === false)).toBe(true);

    const iTerminalProcessing = frames.findIndex(
      (frame) =>
        ['PASSED', 'FAILED', 'ERROR'].includes(frame.status) &&
        frame.video.status === 'PROCESSING' &&
        frame.streamComplete === false,
    );
    expect(iTerminalProcessing, 'no terminal frame with unsettled evidence').toBeGreaterThan(-1);

    const iSettled = frames.findIndex((frame) => frame.streamComplete === true);
    expect(iSettled, 'no frame settles the stream').toBeGreaterThan(-1);

    expect(
      [iTransition, iLogAppend, iTruncation, iTerminalProcessing, iSettled],
      'the five frames the criterion names must occur in that order',
    ).toEqual([...new Set([iTransition, iLogAppend, iTruncation, iTerminalProcessing, iSettled])]);
    expect(iTransition).toBeLessThan(iLogAppend);
    expect(iLogAppend).toBeLessThan(iTruncation);
    expect(iTruncation).toBeLessThan(iTerminalProcessing);
    expect(iTerminalProcessing).toBeLessThan(iSettled);

    // The settled frame is the last one, and exactly one frame closes the stream.
    expect(iSettled).toBe(frames.length - 1);
    expect(frames[iSettled].video.status).not.toBe('PROCESSING');
    expect(frames.filter((frame) => frame.streamComplete).length).toBe(1);
  });
});
