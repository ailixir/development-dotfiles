import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMPILE_FIXTURE_MATRIX } from './compileFixtures';

/**
 * Story 10.10 AC-20 — the fixture matrix, made enumerable and self-checking.
 *
 * AC-1's state enumeration polices itself because it reads the union from the document. **Nothing
 * else in this story does.** If the per-step truncation fixture is never written, AC-7 does not go
 * red — the test simply is not written, and a green suite is indistinguishable from a covered one.
 * That gap is what this file closes, in two halves:
 *
 *  1. **The hazard occurs.** Each required shape carries the discriminating property it exists to
 *     carry, checked by its own predicate. A fixture that declares `truncated: true` on a string
 *     nothing ever cut fails here, because the predicate compares the clamped length and the
 *     marker position against the bounder's caps rather than trusting the boolean.
 *  2. **A test consumes it.** Each required shape's id appears verbatim in the title of at least
 *     one test in this story's suite. Adding a required shape with no test that names it is red;
 *     deleting a fixture a test names is red through half 1.
 *
 * Half 2 reads test *titles* out of the story's test files. That is a source read, and it is the
 * right instrument here precisely because the property being asserted is about which tests exist —
 * it is not a stand-in for a behavioural assertion, and every criterion it guards has one.
 */

const FRONTEND_SRC = path.resolve(__dirname, '../../..');

const STORY_TEST_DIRECTORIES = [
  path.join(FRONTEND_SRC, 'components/studio/review'),
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
 * The titles of `it(...)` and `it.each(...)(...)` calls. Parsed by scanning rather than by one
 * regex, because `it.each([...])(` puts arbitrary parentheses between the two call sites.
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

describe('AC-20: the required fixture set is enumerable, and each entry is real', () => {
  it('the matrix is not empty and the title scanner found this story\'s tests', () => {
    // Without this, both assertions below could pass by finding nothing to check.
    expect(COMPILE_FIXTURE_MATRIX.length).toBeGreaterThanOrEqual(20);
    expect(storyTestFiles().length).toBeGreaterThanOrEqual(6);
    expect(ALL_TITLES.length).toBeGreaterThan(40);
    expect(ALL_TITLES).toContain(
      'level 3 — a document that shed whole steps says which fact that is [FX-TRUNC-DOCUMENT]',
    );
  });

  it('every required fixture id is unique', () => {
    const ids = COMPILE_FIXTURE_MATRIX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(COMPILE_FIXTURE_MATRIX.map((entry) => [entry.id, entry] as const))(
    '%s resolves to a fixture that carries the property it exists for',
    (_id, entry) => {
      expect(entry.resolve(), `${entry.id} (${entry.description}) resolves to nothing`).toBeDefined();
      expect(entry.satisfies(), `${entry.id} (${entry.description})`).toBeNull();
    },
  );

  it.each(COMPILE_FIXTURE_MATRIX.map((entry) => [entry.id] as const))(
    '%s is named by the title of at least one test in this story\'s suite',
    (id) => {
      const naming = ALL_TITLES.filter((title) => title.includes(id));
      expect(
        naming.length,
        `${id} is required but no test in this story's suite names it — a fixture nobody consumes is a fixture nobody would miss`,
      ).toBeGreaterThan(0);
    },
  );
});
