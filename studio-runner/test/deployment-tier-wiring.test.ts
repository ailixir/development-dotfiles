/**
 * The deployment-evidence tier is wired, and cannot be lost quietly (story 10.18a, QA HIGH-1).
 *
 * **This file runs in the DEFAULT tier. That is the whole point of it.**
 *
 * QA found the nineteenth vacuous-guard shape in this story's first version: the chart and SEC-2
 * suites were `skipIf`-gated on `helm` and on the built image, so with either prerequisite absent
 * they reported *green* with 89 and 3 skips respectively, and `ci/stages.md` ran them in a stage
 * that has neither. The repair has two halves and **the second half creates its own risk**:
 *
 * 1. the tier fails closed — no `skipIf` survives in it, and a missing prerequisite reddens every
 *    assertion that needed it;
 * 2. the tier moved out of the default run into `vitest.deployment.config.ts` and `ci/stages.md`
 *    stage 9, because its prerequisites are an external binary and a built container image.
 *
 * Half 2 is *exactly how a tier gets quietly lost* — which would be the same failure by a different
 * route, and the reviewer would be entitled to ask why the fix for a disarming tier was to remove it
 * from the run that was catching nothing anyway. So the move is watched from inside the default run:
 * delete the config, drop the script, remove the stage entry, or delete one of the tier's files, and
 * `npm test` reddens.
 *
 * This is a source scan, and that is legitimate here for the one reason the story permits: it is
 * scoped to **the artefacts this story delivers**, and it asserts their existence and wiring rather
 * than re-asserting a behaviour that has its own test elsewhere.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';

const DEPLOYMENT_DIR = join(packageRoot, 'test', 'deployment');

/**
 * Every `it.skipIf` / `describe.skipIf` call in `source`, with comments removed first.
 *
 * Deliberately not a parser: the question is "does this construct appear in executable text", and a
 * two-rule strip plus a narrow pattern answers it without adding a dependency to a package whose
 * production closure is three entries and asserted on every run.
 */
function skipIfCallsIn(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\/\/[^\n]*/gu, ' ');
  return [...withoutComments.matchAll(/(?:it|describe|test)\s*\.\s*skipIf\s*\(/gu)].map(
    (match) => match[0],
  );
}

/** Every file the tier needs to be the tier. Deleting any of them must redden the default run. */
const REQUIRED_FILES = [
  'helm.ts',
  'image.ts',
  'chart.test.ts',
  'sec2.test.ts',
  'sec2-shim-attack.sh',
  // Story 10.18b's edge half. Added here for the same reason the pod half is here: a tier file
  // that can be deleted without reddening the run everyone executes is a tier file that will be.
  'edge.test.ts',
  'envfrom-keys.test.ts',
] as const;

describe('the deployment-evidence tier is wired and cannot be lost quietly (QA HIGH-1)', () => {
  it('still exists, with every file it needs', () => {
    for (const file of REQUIRED_FILES) {
      expect(existsSync(join(DEPLOYMENT_DIR, file)), `test/deployment/${file} is missing`).toBe(true);
    }
    // …and carries test files at all. An empty directory would satisfy a looser check and would be
    // a tier that runs nothing, which is the failure this whole repair is about.
    const tests = readdirSync(DEPLOYMENT_DIR).filter((entry) => entry.endsWith('.test.ts'));
    expect(tests.length, 'the deployment tier contains no test files').toBeGreaterThanOrEqual(4);
  });

  it('has its own config, its own script, and passWithNoTests unset', () => {
    const config = join(packageRoot, 'vitest.deployment.config.ts');
    expect(existsSync(config)).toBe(true);
    const source = readFileSync(config, 'utf8');
    expect(source).toContain("'test/deployment/**/*.test.ts'");
    // An empty run would be a silent pass, and this is the tier carrying the story's security
    // evidence. (The file *mentions* the option to say it is deliberately unset; what must never
    // appear is it being set.)
    expect(source).not.toMatch(/passWithNoTests\s*:/u);

    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['test:deployment']).toBe('vitest run --config vitest.deployment.config.ts');
  });

  it('is excluded from the default run deliberately, and the deferral record is NOT', () => {
    const unit = readFileSync(join(packageRoot, 'vitest.config.ts'), 'utf8');
    expect(unit).toContain("'test/deployment/**'");
    // The asymmetry QA named — unconditional skips on the halves declared blocked, environment
    // conditional skips on the halves declared passed — is closed from both ends. The blocked
    // halves need no prerequisite, so they stay in the run everyone executes.
    expect(existsSync(join(packageRoot, 'test', 'deferred.test.ts'))).toBe(true);
    expect(unit).not.toContain("'test/deferred");
  });

  it('is named in ci/stages.md with both prerequisites, in a stage that has them', () => {
    // The other half of HIGH-1: the tier used to run in stage 4, which the stage table marks
    // "needs the pinned image: no", while the image is built in stage 7 and helm appears in stage 8.
    // Its own stage has to exist and has to say what it needs, or the repair is local to a config
    // file nobody runs.
    const stages = readFileSync(join(packageRoot, 'ci', 'stages.md'), 'utf8');
    expect(stages).toContain('npm run test:deployment');
    expect(stages).toContain('STUDIO_RUNNER_IMAGE');
    // Named as a gating stage rather than an optional one.
    expect(stages).toMatch(/###\s*9\./u);
  });

  it('contains no skipIf in code: a prerequisite is a failure in that tier, never a skip', () => {
    // The direct guard on the shape. `skipIf` reappearing in the tier's test files is the
    // regression, and it is cheap to reintroduce — it is what the first version did, and it reads
    // like courtesy rather than like a hole.
    //
    // **Comments are stripped first, and that is load-bearing in both directions.** These files
    // discuss the shape at length, which is how the next reader learns why the tier fails closed;
    // scanning raw text would redden on the explanation. Scanning *stripped* text still catches the
    // construct, which the control below demonstrates on a planted instance rather than asserting.
    for (const file of readdirSync(DEPLOYMENT_DIR).filter((entry) => entry.endsWith('.test.ts'))) {
      const offenders = skipIfCallsIn(readFileSync(join(DEPLOYMENT_DIR, file), 'utf8'));
      expect(offenders, `${file} skips on a condition`).toEqual([]);
    }
  });

  it('the scan above can fail on code, and stays quiet on prose', () => {
    // The control, in both directions, because a scan that stripped too much would be green over a
    // tier that had gone back to skipping — which is the shape being guarded and a poor place to
    // install a second instance of it.
    expect(
      skipIfCallsIn("describe.skipIf(!HELM)('x', () => {});\nit.skipIf(!DOCKER)('y', () => {});"),
    ).toHaveLength(2);
    expect(skipIfCallsIn('// the three tests below were it.skipIf(!DOCKER)')).toEqual([]);
    expect(skipIfCallsIn('/* describe.skipIf(!HELM) used to gate this */')).toEqual([]);
  });
});
