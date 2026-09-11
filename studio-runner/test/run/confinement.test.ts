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
   * The document's SHA-256 at this story's base commit (`a8a8eeb44`).
   *
   * A hash rather than a `git diff`: spawning `git` would need `child_process`, which ADR-001 §6
   * confines to `src/run/**`, and a hash is the stronger statement anyway — it holds in a shallow
   * clone, after a rebase, and in the image, where there may be no history to diff against.
   */
  const BASE_SHA256 = '6a20513c496208ffbc0d9c886b013861ae953d2aa50d14b529092a9a24f7157a';

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
