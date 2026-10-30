import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

/**
 * ADR-SC-007 WI-2 delivered the perception modules as library code; WI-4 wires them into the runner (observationFlow.ts, the executor
 * modules and the sanitizer). This file pins exactly who imports them, proves the modules contain no construct that turns a string
 * into code, and watches the wiring of the real-browser perception tier from the default run, the way
 * test/deployment-tier-wiring.test.ts watches the deployment tier.
 */

const NEW_MODULES = ['perceive', 'perceptionInPage', 'locatorSynth', 'playwrightEngine', 'privateInventory'] as const;
const NEW_FILES = NEW_MODULES.map((name) => join('src', 'run', `${name}.ts`));
const ENTRY_POINTS = [
  'src/main.ts',
  'src/index.ts',
  'src/run/child.ts',
  'src/guided/runtime.ts',
  'src/run/browser.ts',
  'src/run/observedReplayAdapter.ts',
  'src/executor/observedReplay.ts',
  'src/validator/observedReplay.ts',
] as const;

/** Static import / export-from specifiers of a TypeScript source (type-only ones included: they still couple the graph). */
function specifiersOf(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
}

/** Resolves a relative `./x.js` specifier to the `.ts` file it names, or undefined for packages and builtins. */
function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base.replace(/\.js$/u, '.ts'), `${base}.ts`, join(base, 'index.ts'), base]) if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  return undefined;
}

/** Every file reachable from `entries` through relative imports. */
function reachableFrom(root: string, entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = entries.map((entry) => resolve(root, entry)).filter((entry) => existsSync(entry));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      const target = resolveRelative(file, specifier);
      if (target !== undefined && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

function filesUnder(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full, extension) : full.endsWith(extension) ? [full] : [];
  });
}

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('the perception modules are wired into the runner through observationFlow and the executor (ADR-SC-007 WI-4)', () => {
  it('every runner entry point reaches every perception module', () => {
    const reached = reachableFrom(packageRoot, ENTRY_POINTS);
    expect(reached.size).toBeGreaterThan(40);
    for (const entry of ENTRY_POINTS) expect(reached.has(resolve(packageRoot, entry)), entry).toBe(true);
    const missing = NEW_FILES.filter((file) => !reached.has(resolve(packageRoot, file)));
    expect(missing).toEqual([]);
  });

  it('exactly the observation flow, the executor modules and the sanitizer import a perception module', () => {
    const importers: string[] = [];
    for (const file of filesUnder(join(packageRoot, 'src'), '.ts')) {
      const rel = relative(packageRoot, file);
      if (NEW_FILES.includes(rel)) continue;
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        const target = resolveRelative(file, specifier);
        if (target !== undefined && NEW_FILES.includes(relative(packageRoot, target))) importers.push(`${rel} -> ${specifier}`);
      }
    }
    // Q25: browser's captured-handle bridge reuses the exact engine pin before private inspection.
    expect([...new Set(importers)].sort()).toEqual([
      'src/run/browser.ts -> ./playwrightEngine.js',
      'src/run/observationDeadline.ts -> ./privateInventory.js',
      'src/run/observationFlow.ts -> ./locatorSynth.js',
      'src/run/observationFlow.ts -> ./perceive.js',
      'src/run/observationFlow.ts -> ./perceptionInPage.js',
      'src/run/observationFlow.ts -> ./playwrightEngine.js',
      'src/run/observationFlow.ts -> ./privateInventory.js',
      'src/run/observationSanitizer.ts -> ./perceive.js',
      'src/run/targetAction.ts -> ./locatorSynth.js',
      'src/run/targetAction.ts -> ./privateInventory.js',
      'src/run/targetIdentity.ts -> ./locatorSynth.js',
      'src/run/targetOptions.ts -> ./playwrightEngine.js',
    ]);
  });

  it('src/run/index.ts does not export them', () => {
    const index = readFileSync(join(packageRoot, 'src', 'run', 'index.ts'), 'utf8');
    for (const name of NEW_MODULES) expect(index).not.toContain(name);
  });

  it('the perception modules import only node builtins, each other and the engine pin', () => {
    const allowed = new Set<string>([...NEW_MODULES.map((name) => `./${name}.js`), './playwrightEnginePin.json']);
    for (const file of NEW_FILES) {
      for (const specifier of specifiersOf(readFileSync(join(packageRoot, file), 'utf8'))) {
        expect(specifier.startsWith('node:') || allowed.has(specifier), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  describe('positive control: the walker does find a perception module when something imports it', () => {
    const tree = (files: Record<string, string>): string => {
      const root = mkdtempSync(join(tmpdir(), 'import-boundary-'));
      temps.push(root);
      for (const [name, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), content);
      }
      return root;
    };

    it('follows a chain of relative imports, including re-exports and index files', () => {
      const root = tree({
        'src/main.ts': "import './guided/runtime.js';\n",
        'src/guided/runtime.ts': "export * from '../run/helper.js';\n",
        'src/run/helper.ts': "import { perceive } from './perceive.js';\nexport const x = perceive;\n",
        'src/run/perceive.ts': 'export const perceive = 1;\n',
        'src/run/other.ts': 'export const other = 1;\n',
      });
      const reached = reachableFrom(root, ['src/main.ts']);
      expect(reached.has(resolve(root, 'src/run/perceive.ts'))).toBe(true);
      expect(reached.has(resolve(root, 'src/run/other.ts'))).toBe(false);
    });

    it('does not report a module nothing imports', () => {
      const root = tree({ 'src/main.ts': "import './run/helper.js';\n", 'src/run/helper.ts': 'export const x = 1;\n', 'src/run/perceive.ts': 'export const p = 1;\n' });
      expect(reachableFrom(root, ['src/main.ts']).has(resolve(root, 'src/run/perceive.ts'))).toBe(false);
    });
  });
});

// The seven constructs of test/no-dynamic-evaluation.test.ts, copied verbatim. That test scans the compiled dist/, which this
// work item must not rebuild, so the new sources are scanned here, as raw text and COMMENTS INCLUDED.
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'eval(', pattern: /(?<![A-Za-z0-9_$.])eval\s*\(/u },
  { label: 'new Function(', pattern: /new\s+Function\s*\(/u },
  { label: 'Function(', pattern: /(?<![A-Za-z0-9_$.])Function\s*\(/u },
  { label: 'node vm', pattern: /require\(\s*['"](?:node:)?vm['"]\s*\)|from\s+['"](?:node:)?vm['"]/u },
  {
    label: 'worker_threads',
    pattern: /require\(\s*['"](?:node:)?worker_threads['"]\s*\)|from\s+['"](?:node:)?worker_threads['"]/u,
  },
  { label: 'dynamic import()', pattern: /(?<![A-Za-z0-9_$.])import\s*\(/u },
  { label: 'async IIFE', pattern: /\(\s*async\s*\(\s*\)\s*=>/u },
];

describe('the perception modules contain nothing that turns a string into code', () => {
  it.each(NEW_FILES)('%s has none of the seven forbidden constructs, in code or in comments', (file) => {
    const source = readFileSync(join(packageRoot, file), 'utf8');
    for (const { label, pattern } of FORBIDDEN) expect(pattern.test(source), `${file}: ${label}`).toBe(false);
  });

  it('the scan can fail: each pattern matches a planted instance', () => {
    const planted: Record<string, string> = {
      'eval(': 'const x = eval("1");',
      'new Function(': 'const f = new Function("return 1");',
      'Function(': 'const f = Function("return 1");',
      'node vm': "import vm from 'node:vm';",
      worker_threads: "import { Worker } from 'worker_threads';",
      'dynamic import()': 'const m = import("x");',
      'async IIFE': '(async () => { await 1; })();',
    };
    for (const { label, pattern } of FORBIDDEN) expect(pattern.test(planted[label] ?? ''), label).toBe(true);
    expect(FORBIDDEN).toHaveLength(7);
  });

  it('uses the same seven patterns as no-dynamic-evaluation.test.ts', () => {
    const original = readFileSync(join(packageRoot, 'test', 'no-dynamic-evaluation.test.ts'), 'utf8');
    for (const { pattern } of FORBIDDEN) expect(original).toContain(pattern.source.slice(0, 40).replace(/\\\//gu, '/'));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The perception tier is wired, and cannot be lost quietly.

const TIER_DIR = join(packageRoot, 'test', 'fixtures-tier', 'perception');
const TIER_TESTS = ['parity.test.ts', 'leaks.test.ts', 'conformance.test.ts', 'optionGate.test.ts', 'cutover-observe.test.ts', 'cutover-act.test.ts', 'cutover-read.test.ts', 'canary-boundary.test.ts', 'identity-snapshots.test.ts', 'infoboxLinkRead.test.ts', 'searchComboboxValue.test.ts', 'fillPressSuccessor.test.ts', 'titledReadReplay.test.ts', 'fillReplacedField.test.ts', 'primaryOutputName.test.ts', 'retained-privacy-guards.test.ts', 'rehearsal-pages.test.ts', 'nativeChildContext.test.ts', 'publicContextCertificate.test.ts', 'labelCompleteness.test.ts'] as const;

/** Every `it.skipIf` / `describe.skipIf` call in `source`, with comments removed first. */
function skipIfCallsIn(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');
  return [...withoutComments.matchAll(/(?:it|describe|test)\s*\.\s*skipIf\s*\(/gu)].map((match) => match[0]);
}

describe('the perception tier is wired and cannot be lost quietly (ADR-SC-007 WI-2)', () => {
  const read = (...parts: string[]): string => readFileSync(join(packageRoot, ...parts), 'utf8');

  it('has its own config: node environment, the tier\'s files, no globalSetup (so dist/ is never emitted), no passWithNoTests', () => {
    const config = read('vitest.perception.config.ts');
    expect(config).toContain("include: ['test/fixtures-tier/perception/**/*.test.ts']");
    expect(config).toMatch(/environment:\s*'node'/u);
    expect(config).not.toMatch(/globalSetup\s*:/u);
    expect(config).not.toMatch(/passWithNoTests\s*:/u);
    expect(config).toMatch(/fileParallelism:\s*false/u);
  });

  it('has the test:perception script that runs exactly that config', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test:perception']).toBe('vitest run --config vitest.perception.config.ts');
    expect(scripts['test:fixtures']).toBe('vitest run --config vitest.fixtures.config.ts');
  });

  it('is kept out of the default run and out of the fixtures tier (which re-emits dist/)', () => {
    expect(read('vitest.config.ts')).toContain("'test/fixtures-tier/**'");
    expect(read('vitest.fixtures.config.ts')).toContain("'test/fixtures-tier/perception/**'");
    expect(read('vitest.fixtures.config.ts')).toContain('globalSetup');
  });

  it('is the reason src/run/perceptionInPage.ts and src/run/pageStateInPage.ts are excluded from the unit coverage, and says so', () => {
    const config = read('vitest.config.ts');
    expect(config).toContain("'src/run/perceptionInPage.ts'");
    expect(config).toContain("'src/run/pageStateInPage.ts'");
    expect(config).toContain('vitest.perception.config.ts');
    expect(config).toContain('test:perception');
  });

  it('keeps every file of the tier, and every test file signs dist/ before and after', () => {
    expect(existsSync(join(TIER_DIR, 'harness.ts'))).toBe(true);
    for (const file of TIER_TESTS) {
      const path = join(TIER_DIR, file);
      expect(existsSync(path), file).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source, `${file} must guard dist/`).toContain('guardDist()');
    }
    const onDisk = readdirSync(TIER_DIR).filter((name) => name.endsWith('.test.ts')).sort();
    expect(onDisk).toEqual([...TIER_TESTS].sort());
  });

  it('contains no skipIf in code: a missing prerequisite or a changed environment is a failure, never a skip', () => {
    for (const name of [...TIER_TESTS, 'harness.ts', 'cutover-support.ts']) expect(skipIfCallsIn(readFileSync(join(TIER_DIR, name), 'utf8')), name).toEqual([]);
    expect(skipIfCallsIn("describe.skipIf(!CHROME)('x', () => {});\nit.skipIf(live)('y', () => {});")).toHaveLength(2);
    expect(skipIfCallsIn('// describe.skipIf(x) in a comment\n/* it.skipIf(y) */ const ok = 1;')).toHaveLength(0);
  });

  it('is recorded in ci/stages.md as stage 10, with its command, the no-dist note and a summary row', () => {
    const stages = read('ci', 'stages.md');
    expect(stages).toMatch(/###\s*10\.\s*Perception tier/u);
    const section = stages.slice(stages.search(/###\s*10\./u), stages.indexOf('## Summary'));
    expect(section).toContain('vitest run --config vitest.perception.config.ts');
    expect(section).toContain('test:perception');
    expect(section).toMatch(/never touches `dist\/`/u);
    expect(section).toMatch(/globalSetup/u);
    expect(section).not.toMatch(/npm run/u);
    expect(stages).toMatch(/\|\s*10\s*\|\s*\*\*Perception tier\*\*\s*\|/u);
    // the stage-9 anchors that test/deployment-tier-wiring.test.ts reads stay in place
    expect(stages).toMatch(/###\s*9\./u);
    expect(stages).toContain('npm run test:deployment');
    expect(stages).toContain('STUDIO_RUNNER_IMAGE');
  });
});
