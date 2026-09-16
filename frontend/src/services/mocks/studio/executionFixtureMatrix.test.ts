import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EXECUTION_FIXTURE_MATRIX } from './executionFixtures';

/**
 * Story 10.11a AC-22 — the required fixture set, made enumerable and self-checking.
 *
 * The pattern is story 10.10's `compileFixtureMatrix.test.ts`, extended rather than re-invented,
 * and the reason is @po's own naming of 10.10's AC-20 as that story's weakest criterion: *"If the
 * level-2 truncation fixture is never written, AC-7 does not go red; the test simply does not
 * exist, and a green suite is indistinguishable from a covered one."*
 *
 * Two halves, as there:
 *
 *  1. **The hazard occurs.** Each required shape carries the discriminating property it exists to
 *     carry, checked by its own predicate. A `logsTruncated: true` fixture holding three lines
 *     fails here, because the predicate compares the array length against the cap that makes a
 *     client-side window observable rather than trusting the boolean.
 *  2. **A test consumes it.** Each id appears verbatim in the title of at least one test in this
 *     story's suite. Adding a required shape with no test that names it is red; deleting a fixture
 *     a test names is red through half 1.
 *
 * Half 2 reads test *titles* out of source. That is a source read and it is the right instrument
 * here precisely because the property is about which tests exist — it is not standing in for a
 * behavioural assertion, and every criterion it guards has one.
 */

const FRONTEND_SRC = path.resolve(__dirname, '../../..');

/** The directories story 10.11a puts tests in. */
const STORY_TEST_DIRECTORIES = [
  path.join(FRONTEND_SRC, 'components/studio/run'),
  path.join(FRONTEND_SRC, 'pages/ChecksStudioPage'),
  path.join(FRONTEND_SRC, 'services/mocks/studio'),
];

function storyTestFiles(): string[] {
  return STORY_TEST_DIRECTORIES.flatMap((directory) =>
    fs
      .readdirSync(directory)
      .filter((name) => /\.test\.tsx?$/.test(name))
      .map((name) => path.join(directory, name)),
  );
}

/**
 * The titles of `it(...)` and `it.each(...)(...)` calls.
 *
 * Scanned rather than matched by one regex, because `it.each([...])(` puts arbitrary parentheses
 * between the two call sites. Copied in shape from 10.10's scanner, and self-checked below: a
 * scanner that silently found nothing would make every assertion here vacuous, which is the shape
 * this whole file exists to prevent.
 */
function testTitles(source: string): string[] {
  const titles: string[] = [];
  const quote = /['"`]/;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== 'i' || source[index + 1] !== 't') {
      continue;
    }
    const before = index === 0 ? ' ' : source[index - 1];
    if (/[A-Za-z0-9_$.]/.test(before)) {
      continue;
    }

    let cursor = index + 2;
    if (source.startsWith('.each', cursor)) {
      cursor += 5;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] !== '(') continue;
      let depth = 0;
      while (cursor < source.length) {
        if (source[cursor] === '(') depth += 1;
        if (source[cursor] === ')') {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
        cursor += 1;
      }
    }
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '(') continue;
    cursor += 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (!quote.test(source[cursor])) continue;

    const closing = source[cursor];
    cursor += 1;
    let title = '';
    while (cursor < source.length && source[cursor] !== closing) {
      if (source[cursor] === '\\') {
        title += source[cursor + 1];
        cursor += 2;
        continue;
      }
      title += source[cursor];
      cursor += 1;
    }
    titles.push(title);
  }
  return titles;
}

const ALL_TITLES = storyTestFiles().flatMap((file) => testTitles(fs.readFileSync(file, 'utf8')));

describe('AC-22: the required execution fixture set is enumerable, and each entry is real', () => {
  it('the matrix is not empty and the title scanner found this story’s tests', () => {
    // Without this, both assertions below could pass by finding nothing to check.
    //
    // **The floor is not the guard, and @qa's VAC-18 finding is why it says so.** A `>= 20` floor
    // under an actual 26 let four required shapes vanish in silence, and deleting one left the
    // whole suite green because the `it.each` rows below simply stop existing. What holds the
    // required *set* is `[VAC-18] the matrix ids are exactly the ids the document's vocabularies
    // imply` in `studioContract.test.ts`, which compares both ways against the parsed document and
    // counts the total. This line is a sanity check on the scanner, nothing more.
    expect(EXECUTION_FIXTURE_MATRIX.length).toBeGreaterThanOrEqual(26);
    expect(storyTestFiles().length).toBeGreaterThanOrEqual(6);
    expect(ALL_TITLES.length).toBeGreaterThan(30);
    expect(ALL_TITLES).toContain(
      'a null timing renders as not attempted, never as zero [FX-STEP-FAIL-SKIPPED-TAIL]',
    );
  });

  it('every required fixture id is unique', () => {
    const ids = EXECUTION_FIXTURE_MATRIX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EXECUTION_FIXTURE_MATRIX.map((entry) => [entry.id, entry] as const))(
    '%s resolves to a fixture that carries the property it exists for',
    (_id, entry) => {
      expect(entry.resolve(), `${entry.id} (${entry.description}) resolves to nothing`).toBeDefined();
      expect(entry.satisfies(), `${entry.id} (${entry.description})`).toBeNull();
    },
  );

  it.each(EXECUTION_FIXTURE_MATRIX.map((entry) => [entry.id] as const))(
    '%s is named by the title of at least one test in this story’s suite',
    (id) => {
      const naming = ALL_TITLES.filter((title) => title.includes(id));
      expect(
        naming.length,
        `${id} is required but no test in this story's suite names it — a fixture nobody consumes ` +
          'is a fixture nobody would miss',
      ).toBeGreaterThan(0);
    },
  );
});
