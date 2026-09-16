/**
 * AC-1, AC-13, AC-24, AC-25 — where Playwright is allowed to be, and what this story did not
 * change.
 *
 * These are properties of the *package*, asserted over its sources and its diff rather than over
 * a running object. They are the ones that decay silently: an import added in a hurry, a contract
 * edited to make a body fit, a browser launched from the unit tier to save writing a fake. None of
 * them fails a normal test; each of them fails here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLAYWRIGHT_MODULES } from '../../eslint.boundary-rules.js';
import { packageRoot } from '../helpers/corpus.js';

const SOURCE_DIRECTORIES = ['validator', 'executor', 'server', 'reporting', 'compat'] as const;

/** Assembled so this file's own scan does not trip over the needle it is looking for. */
const BROWSER_MODULE = ['run/', 'browser.js'].join('');

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : full.endsWith('.ts') ? [full] : [];
  });
}

function importsPlaywright(source: string): boolean {
  return PLAYWRIGHT_MODULES.some((name) =>
    new RegExp(String.raw`from\s+['"]${name}['"]|require\(\s*['"]${name}['"]\s*\)`, 'u').test(
      source,
    ),
  );
}

describe('AC-1 — no Playwright import escapes the one module that starts a browser', () => {
  it('finds none in the validator, executor, server, reporting or compat trees', () => {
    // The property QA verified holds today, and which this story must not spend.
    const offenders = SOURCE_DIRECTORIES.flatMap((name) => filesUnder(join(packageRoot, 'src', name)))
      .filter((file) => importsPlaywright(readFileSync(file, 'utf8')))
      .map((file) => relative(packageRoot, file));
    expect(offenders).toEqual([]);
  });

  it('finds exactly one importer in the whole package: src/run/browser.ts', () => {
    const offenders = filesUnder(join(packageRoot, 'src'))
      .filter((file) => importsPlaywright(readFileSync(file, 'utf8')))
      .map((file) => relative(packageRoot, file))
      .sort();
    expect(offenders).toEqual([join('src', 'run', 'browser.ts')]);
  });

  it('keeps the adapter itself Playwright-free, which is what makes it unit-testable', () => {
    // The adapter is written against the structural page/locator surface it declares, so every
    // one of its branches runs in the browser-free tier (AC-25) while the fixtures tier proves
    // the same code against real Chromium.
    const adapter = readFileSync(join(packageRoot, 'src', 'run', 'playwrightAdapter.ts'), 'utf8');
    expect(importsPlaywright(adapter)).toBe(false);
  });

  it('exports no Playwright type from the run surface', () => {
    const index = readFileSync(join(packageRoot, 'src', 'run', 'index.ts'), 'utf8');
    expect(index).not.toContain('./browser.js');
  });
});

describe('AC-25 — the unit tier is browser-free', () => {
  it('no test outside the fixtures tier imports the browser module or Playwright', () => {
    const offenders = filesUnder(join(packageRoot, 'test'))
      .filter((file) => !file.includes(join('test', 'fixtures-tier')))
      // This file names the module in order to look for it; reading itself would be circular.
      .filter((file) => relative(packageRoot, file) !== join('test', 'run', 'confinement.test.ts'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return importsPlaywright(source) || source.includes(BROWSER_MODULE);
      })
      .map((file) => relative(packageRoot, file));
    expect(offenders).toEqual([]);
  });

  it('keeps the fixtures tier out of the default run, with passWithNoTests unset', () => {
    const unit = readFileSync(join(packageRoot, 'vitest.config.ts'), 'utf8');
    expect(unit).toContain("'test/fixtures-tier/**'");
    const fixtures = readFileSync(join(packageRoot, 'vitest.fixtures.config.ts'), 'utf8');
    // An empty fixtures run would be a silent pass, which is exactly what this story cannot
    // afford: it is the tier where the real browser lives. (The config *mentions* the option, to
    // say it is deliberately unset; what must not appear is it being set.)
    expect(fixtures).not.toMatch(/passWithNoTests\s*:/u);
  });

  it('gates src/run/** at the thresholds already enforced, with none lowered', () => {
    const unit = readFileSync(join(packageRoot, 'vitest.config.ts'), 'utf8');
    expect(unit).toContain("'src/run/**': { lines: 85, statements: 85, functions: 80, branches: 80 }");
    for (const directory of ["'src/server/**'", "'src/reporting/**'"]) {
      expect(unit).toContain(`${directory}: { lines: 85, statements: 85, functions: 80, branches: 80 }`);
    }
    expect(unit).toContain('lines: 85');
    expect(unit).toContain('branches: 80');
  });
});

describe('AC-13 — this story makes no contract edit, and that is the criterion', () => {
  const contract = join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml');

  it('finds the contract', () => {
    expect(existsSync(contract)).toBe(true);
  });

  /**
   * The document's SHA-256 after **story 10.15's route landed**, on top of everything that
   * preceded it.
   *
   * **This is the fourth re-anchor.** What this digest now covers, in the order it happened:
   *
   * 1. ADR-002 sections 14, 15, 16 and 17 — architect rulings, not runner edits: the conflict
   *    responses for a deleted or quarantined draft, the two ratified `ExecutionErrorCode` values,
   *    the diagnostics surface, and `RunnerEvidence.partial` gaining an optional field and a
   *    producer. The **first** re-anchor covered these.
   * 2. Story **10.9** shipping `POST /tests/{id}/confirm-compile` for real and removing its
   *    `x-not-yet-implemented: true` marker — one deleted line, verified by reading the diff. The
   *    route's `x-implemented-by: '10.9'` stays. The **second** re-anchor covered that.
   * 3. **ADR-002 §20 and §22, landed by story 10.18a** — `RunnerEvidence.required` gains
   *    `partial` (O-14, closing story 10.14's AC-26) and the property's stale "the merged runner
   *    does not emit it yet" paragraph is corrected; and `RunJob.resolvedVars` /
   *    `resolvedSecrets` gain the §9.2 scrubbing clause in identical words, because §9.2 says
   *    *known values* and the document had been written narrower than its own source. **This**
   *    re-anchor covers those two amendments and nothing else: they are the only edits in
   *    10.18a's diff to `docs/specs/studio/openapi.yaml`, and both copies of
   *    `artifact.schema.json` are byte-unchanged. Under ADR-002 §19 the ruling stays the
   *    architect's and only the *diff* moves to the owning story's PR, which is why this digest
   *    moves here rather than in an unowned edit — the failure §19 was narrowed to prevent.
   * 4. **Story 10.15 shipping `GET /executions/{id}/video`** — this re-anchor, and `FOC-06`
   *    **step 2 of 3**. Four edits, all on `getExecutionVideo` and on nothing else: the `206`
   *    gains declared `video/webm` content with its `Content-Range` and `Content-Length` headers;
   *    the `404` gains `application/json` `ErrorResponse` content, which is verbatim ADR-002
   *    §12's own example of a Class A defect; the `416` gains the same content plus its
   *    `Content-Range` header; and `x-not-yet-implemented` is removed — it was **the last one in
   *    the document** — while `x-implemented-by` is corrected from `'10.16'` to `'10.15'`, which
   *    is a wrong value rather than a stale one, ruled Class A by @po at wave-6 validation and
   *    reported as a finding. No status was added or removed: declaring the two missing
   *    authorization statuses and a status for an unreachable store are Class C and are escalated
   *    as ESC-1 and ESC-2, left red rather than taken.
   *
   * **The criterion is unchanged and still holds: nothing in story 10.13 edited the contract.**
   * Every byte of difference between this digest and the previous one belongs to another story,
   * and the four commits of 10.13 touch no file under `docs/specs/`.
   *
   * **`FOC-06` ordering, recorded by @po at wave-6 validation.** Three wave-6 stories edit this
   * document: 10.18 (§20 + §22) → **10.15** (this re-anchor) → 10.11c (§21 + producer). The pin
   * was verified **green on arrival** at `d1a987663b25d7240fc460f923289aaf22a07145df7d6913114f9f3c1d627c18`
   * before story 10.15 touched anything — step 1 had landed — so nothing unowned is folded in
   * here. Had it been red on arrival, the instruction was to report it as a `FOC-06` violation
   * and stop, not to launder it into this digest.
   *
   * **Why this one has an owner and the last one did not.** The first re-anchor went unowned
   * across all four amendments — they landed as architect rulings rather than in a story PR, so
   * nobody's diff was responsible for them, and the red pin was found by @po during story
   * validation rather than by the changes that caused it. That is the failure this test's own rule
   * exists to prevent, and it is exactly why 10.13 carries **T-10.13.10** as a task: FOC-04
   * mandates that 10.9's edit lands first and that this story re-anchors afterwards, deliberately,
   * in its own PR. The reverse order would have forced a backend PR to re-anchor a runner test —
   * which the rule below forbids.
   *
   * The value was re-read from the document with `shasum -a 256` at the moment of the re-anchor,
   * never transcribed from a story file or a message: a pin copied from prose is a pin against
   * prose.
   *
   * A hash rather than a `git diff`: spawning `git` would need `child_process`, which ADR-001 §6
   * confines to `src/run/**`, and a hash is the stronger statement anyway — it holds in a shallow
   * clone, after a rebase, and in the image, where there may be no history to diff against.
   */
  const BASE_SHA256 = '310d3c984b77104898440cae450795cdd56c11ef926f75209fb6d4198dcc0cf7';

  it('leaves docs/specs/studio/openapi.yaml byte-unchanged by this story’s diff', () => {
    // ADR-002 §11.2 rejected `recordingOriginMs` and amended the document itself; §11.6 moved the
    // whole of the work runner-side. Under §12 a field on a closed runner body is Class B —
    // architect first — so the absence of a diff here *is* the acceptance, not an omission.
    //
    // If this goes red because a *later* story legitimately amended the contract, the fix is to
    // re-anchor the constant in that story's PR, deliberately. It must never be re-anchored in a
    // PR whose subject is something else.
    const actual = createHash('sha256').update(readFileSync(contract)).digest('hex');
    expect(actual, 'this story may not edit the contract (ADR-002 §12, Class B)').toBe(BASE_SHA256);
  });

  it('emits the RunnerEvidence.partial that ADR-002 §20 promoted to required', () => {
    const document = readFileSync(contract, 'utf8');
    const start = document.indexOf('    RunnerEvidence:');
    const body = document.slice(start, start + 2_400);
    // **Inverted, not deleted, by story 10.18a (ADR-002 §20.4).** As story 10.13 wrote it this
    // asserted the opposite — `toContain` the three-key form and `not.toContain` the four-key one
    // — because §17.5 deliberately left the field optional until a producer existed. That was true
    // when it was written and false the instant O-14 landed, and it went **red** rather than green
    // on the amendment, accusing a merged and blameless story. The subject was always right: the
    // runner's evidence schema is worth watching from the runner. Only the tense was wrong.
    //
    // The non-vacuity shape is unchanged and the two assertions still discriminate in opposite
    // directions: the three-key form ends in `]`, so it is **not** a substring of the four-key
    // form, and neither contains the other.
    //
    // **Corrected after QA (LOW-1).** An earlier version of this comment said a revert of §20
    // "turns both of these red rather than one". Measured, it does not: `toContain` throws first
    // and the `not.toContain` below is never evaluated, so the file reports two failures and the
    // second is the pin, not this line. The sentence was the kind a later reader treats as a
    // measurement. The `not.toContain` is **not** vacuous for that — QA falsified it on its own,
    // by planting the three-key literal inside the window while leaving the four-key `required` in
    // place, and it reddens alone.
    expect(body).toContain('partial:');
    expect(body).toContain('required: [videoKey, manifestKey, state, partial]');
    expect(body).not.toContain('required: [videoKey, manifestKey, state]');
  });

  it('keeps every runner-produced body closed, and widens no enum', () => {
    const document = readFileSync(contract, 'utf8');
    for (const schema of ['RunnerStepState', 'RunnerLogEntry', 'RunOutcome', 'RunnerEvidence', 'RunnerReport']) {
      const start = document.indexOf(`    ${schema}:`);
      expect(start, `${schema} is missing from the contract`).toBeGreaterThan(0);
      const body = document.slice(start, start + 400);
      expect(body, `${schema} is no longer a closed body`).toContain('additionalProperties: false');
    }
    // The evidence enum still has four values, and this story emits three of them.
    expect(document).toContain('enum: [PENDING, STORED, FAILED, UNAVAILABLE]');
  });
});

describe('AC-24 — no new production dependency', () => {
  it('keeps the declared runtime dependencies at playwright and typescript', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['playwright', 'typescript']);
    // Anything a real browser needs beyond the pinned library is a signal the design drifted.
    expect(pkg.dependencies?.playwright).toBe('1.63.0');
  });

  it('does not touch the fail-closed allowlist to accommodate this story', () => {
    const isolation = readFileSync(join(packageRoot, 'test', 'isolation.test.ts'), 'utf8');
    // `test/isolation.test.ts` asserts the resolved production closure equals exactly this set.
    // Story 10.12 added no entry, and the assertion there is what proves it on every run.
    expect(isolation).toContain('playwright-core');
    expect(isolation).not.toContain('@playwright/test');
  });

  it('keeps story 10.13’s three new modules inside the node: builtins ADR-001 §6 already permits', () => {
    // Process-group signalling and descendant observation use `node:child_process` and
    // `node:process`, which ADR-001 §6 confines to `src/run/**` — and all three new modules are
    // inside it. No package was added to make the kill path work.
    for (const file of ['deadline.ts', 'tree.ts', 'outputRelay.ts']) {
      const source = readFileSync(join(packageRoot, 'src', 'run', file), 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/gu)].map((match) => match[1] ?? '');
      for (const specifier of imports) {
        const external = !specifier.startsWith('.') && !specifier.startsWith('node:');
        expect(external, `${file} imports ${specifier}`).toBe(false);
      }
    }
    // And `child_process` stays where §6 puts it: inside `src/run/**`, nowhere else.
    const offenders = SOURCE_DIRECTORIES.flatMap((name) =>
      filesUnder(join(packageRoot, 'src', name)),
    ).filter((file) => readFileSync(file, 'utf8').includes('node:child_process'));
    expect(offenders).toEqual([]);
  });

  it('serves the fixture pages from node:http, as the internal server does', () => {
    const server = readFileSync(join(packageRoot, 'test', 'helpers', 'pageServer.ts'), 'utf8');
    expect(server).toContain("from 'node:http'");
  });
});

describe('AC-23 — the pins hold and .nvmrc is not touched', () => {
  it('still reads 22', () => {
    // The public base image at the pinned Playwright version ships Node v24.20.0 against this
    // `.nvmrc` of 22. That mismatch is `ci/stages.md` open item **O-2a**, owned by `ED-05`, and
    // the fix is a base-image choice or an ADR-001 §4.2 amendment — never a convenience edit
    // here. This assertion is what makes such an edit a red build instead of a quiet one.
    expect(readFileSync(join(packageRoot, '.nvmrc'), 'utf8').trim()).toBe('22');
  });

  it('keeps the engines range as it was, so the mismatch cannot be widened away either', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    expect(pkg.engines?.node).toBe('>=22.11.0 <25.0.0');
  });

  it('keeps the Playwright pin at 1.63.0 in all four declared copies', () => {
    const pkg = readFileSync(join(packageRoot, 'package.json'), 'utf8');
    const lock = JSON.parse(readFileSync(join(packageRoot, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };
    const dockerfile = readFileSync(join(packageRoot, 'Dockerfile'), 'utf8');
    expect(pkg).toContain('"playwright": "1.63.0"');
    expect(lock.packages['node_modules/playwright']?.version).toBe('1.63.0');
    expect(dockerfile).toContain('ARG PLAYWRIGHT_VERSION=1.63.0');
  });
});
