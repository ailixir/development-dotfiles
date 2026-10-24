/** Evidence-only scratch tests. UNEXECUTED. Never copy into the live80-case integration file. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { CHART_DIR, mountedSpringProperties, renderOutcome, requireHelm, TEST_PIN } from './helm.js';
import { argvHash, byteHash, observeHelmRender, validateNativeObservation } from './gateway-native-observer.js';

type Properties = Record<string, unknown>;
interface Binding { path: string; fixedSha256: string; mode: string }
interface Snapshot { path: string; sha256: string; mode: string }
interface Unit {
  id: string;
  candidateSha256: string;
  sourceCandidate: string;
  witnessShape: 'nested' | 'relaxed';
  unaffectedOtherShape: 'nested' | 'relaxed';
}
function absoluteVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || !isAbsolute(value)) throw new Error(`${name} must be an absolute owned path`);
  return resolve(value);
}
const packageDir = absoluteVariable('GATEWAY_QA_PACKAGE_DIR');
const evidenceDir = absoluteVariable('GATEWAY_QA_EVIDENCE_DIR');
const bound = JSON.parse(readFileSync(join(packageDir, 'chart-bindings.json'), 'utf8')) as { files: Binding[] };
const plan = JSON.parse(readFileSync(join(packageDir, 'mutations.json'), 'utf8')) as {
  acceptedHelperSha256: string; mutants: Unit[];
};
function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function snapshot(root: string): Snapshot[] {
  const files: Snapshot[] = [];
  function visit(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const status = lstatSync(file);
      if (status.isSymbolicLink()) throw new Error('chart snapshots cannot follow symbolic links');
      if (status.isDirectory()) visit(file);
      else if (status.isFile()) files.push({
        path: relative(root, file).split('\\').join('/'),
        sha256: hash(readFileSync(file)), mode: (status.mode & 0o777).toString(8).padStart(4, '0'),
      });
      else throw new Error('chart snapshot encountered a non-file input');
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const expected = bound.files.map((file) => ({
  path: file.path, sha256: file.fixedSha256, mode: file.mode,
})).sort((a, b) => a.path.localeCompare(b.path));
function shape(name: 'nested' | 'relaxed'): { properties: Properties; path: string } {
  return name === 'nested'
    ? { properties: { studio: { gateway: { provider: 'override' } } }, path: 'studio.gateway.provider' }
    : { properties: { STUDIO_GATEWAY_PROVIDER: 'override' }, path: 'STUDIO_GATEWAY_PROVIDER' };
}
beforeAll(() => {
  expect(process.versions.node).toBe('24.20.0');
  expect(bound.files).toHaveLength(22);
  expect(plan.acceptedHelperSha256).toBe('a5cd97461ef1320a73d9a36b4ababcf343fee79007df8b0a28f569b0c381d73e');
  expect(snapshot(CHART_DIR)).toEqual(expected);
  requireHelm();
  // Fresh exclusive evidence, never overwrite or clean an earlier run's artifacts.
  mkdirSync(evidenceDir, { recursive: false, mode: 0o700 });
  writeFileSync(join(evidenceDir, 'versions.json'), JSON.stringify({
    node: process.version,
    helm: execFileSync('helm', ['version', '--short'], { encoding: 'utf8', stdio: 'pipe' }).trim(),
    fixedChart: expected, acceptedHelperSha256: plan.acceptedHelperSha256,
  }, null, 2));
});
function measureUnit(id: string): void {
  const unit = plan.mutants.find((entry) => entry.id === id);
  if (unit === undefined) throw new Error('the exact mutation unit is missing');
  const candidate = readFileSync(join(packageDir, unit.sourceCandidate));
  expect(hash(candidate)).toBe(unit.candidateSha256);
  const parentBefore = snapshot(CHART_DIR);
  expect(parentBefore).toEqual(expected);
  const original = readFileSync(join(CHART_DIR, 'templates', '_helpers.tpl'));
  expect(hash(original)).toBe(plan.acceptedHelperSha256);
  const owned = mkdtempSync(join(tmpdir(), 'gateway-independent-'));
  const fixed = join(owned, 'fixed');
  const mutant = join(owned, 'mutant');
  const errors: unknown[] = [];
  const renders: Record<string, unknown>[] = [];
  let restored = false;
  let parentUnchanged = false;
  let cleaned = false;
  let sequence = 0;
  try {
    cpSync(CHART_DIR, fixed, { recursive: true });
    cpSync(CHART_DIR, mutant, { recursive: true });
    expect(snapshot(fixed)).toEqual(expected);
    expect(snapshot(mutant)).toEqual(expected);
    writeFileSync(join(mutant, 'templates', '_helpers.tpl'), candidate);
    chmodSync(join(mutant, 'templates', '_helpers.tpl'), 0o644);
    expect(snapshot(mutant)).toEqual(expected.map((entry) => entry.path === 'templates/_helpers.tpl'
      ? { ...entry, sha256: unit.candidateSha256 } : entry));
    const witness = shape(unit.witnessShape);
    const other = shape(unit.unaffectedOtherShape);
    const controls = [
      { kind: 'target', ...witness, mutantAccepts: true },
      { kind: 'canonical-flat', properties: { 'studio.gateway.provider': 'override' }, path: 'studio.gateway.provider', mutantAccepts: false },
      { kind: 'legacy-flat', properties: { 'studio.compile.gateway.provider': 'override' }, path: 'studio.compile.gateway.provider', mutantAccepts: false },
      { kind: 'other-shape', ...other, mutantAccepts: false },
      { kind: 'custom-flat', properties: { 'custom.gateway-note': 'ordinary test configuration' }, path: 'custom.gateway-note', mutantAccepts: true },
    ];
    for (const component of ['backend', 'worker'] as const) {
      for (const control of controls) {
        for (const chart of [{ state: 'fixed', directory: fixed }, { state: 'mutant', directory: mutant }]) {
          sequence += 1;
          const args = ['--set-json', `${component}.configOverrides=${JSON.stringify(control.properties)}`];
          const argv = ['helm', 'template', 'release-name', chart.directory,
            '--set', 'studioRunner.enabled=true', '--set',
            `studioRunner.tls.controllerCertificateFingerprint256=${TEST_PIN}`, ...args];
          const expectedNative = { argvSha256: argvHash(argv), cwd: process.cwd(),
            chartSha256: byteHash(JSON.stringify(snapshot(chart.directory))) };
          const observed = observeHelmRender(
            () => renderOutcome({ chartDir: chart.directory, args }),
            (actualChart) => byteHash(JSON.stringify(snapshot(actualChart))),
          );
          const outcome = observed.outcome;
          const stem = `${id}-${sequence.toString().padStart(2, '0')}-${component}-${control.kind}-${chart.state}`;
          const accepts = control.kind === 'custom-flat' || (chart.state === 'mutant' && control.mutantAccepts);
          const intended = `configOverrides property ${control.path} is managed by the chart`;
          renders.push({ sequence, component, kind: control.kind, state: chart.state,
            expectedAccepts: accepts, observedOk: outcome.ok,
            namedRefusalObserved: outcome.error.includes(intended),
            rawSha256: hash(outcome.raw), errorSha256: hash(outcome.error), argv,
            expectedNative, nativeFrames: observed.frames,
            observerFailureCount: observed.observerErrors.length, builtinRestored: observed.builtinRestored,
          });
          try {
            writeFileSync(join(evidenceDir, `${stem}.yaml`), outcome.raw);
            writeFileSync(join(evidenceDir, `${stem}.stderr.txt`), outcome.error);
            validateNativeObservation(observed, expectedNative, accepts);
            expect(outcome.ok, `${id}/${component}/${control.kind}/${chart.state}: ${outcome.error}`).toBe(accepts);
            if (accepts) {
              expect(mountedSpringProperties(outcome, component === 'backend' ? 'api' : 'worker'))
                .toMatchObject(control.properties);
            } else expect(outcome.error).toContain(intended);
          } catch (error) {
            throw new AggregateError([error, ...observed.nativeErrors, ...observed.observerErrors],
              `${id}: retain actual native, observer, write and assertion errors`);
          }
        }
      }
    }
    expect(renders).toHaveLength(20);
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      if (!existsSync(mutant)) throw new Error('private mutant chart was never completely created');
      writeFileSync(join(mutant, 'templates', '_helpers.tpl'), original);
      chmodSync(join(mutant, 'templates', '_helpers.tpl'), 0o644);
      expect(snapshot(mutant)).toEqual(parentBefore);
      expect(snapshot(fixed)).toEqual(parentBefore);
      expect(snapshot(CHART_DIR)).toEqual(parentBefore);
      const archive = join(evidenceDir, `${id}-restored-chart`);
      cpSync(mutant, archive, { recursive: true });
      expect(snapshot(archive)).toEqual(parentBefore);
      restored = true;
      parentUnchanged = true;
    } catch (error) { errors.push(error); }
    // A failed restoration holds our private unit for inspection. Never remove unowned paths.
    if (restored && parentUnchanged) {
      try {
        rmSync(owned, { recursive: true, force: false });
        expect(existsSync(owned)).toBe(false);
        cleaned = true;
      } catch (error) { errors.push(error); }
    }
    try {
      writeFileSync(join(evidenceDir, `${id}-receipt.json`), JSON.stringify({
      status: errors.length === 0 ? 'SCRATCH_ASSERTIONS_PASSED_PENDING_INDEPENDENT_QA' : 'FAILED_OR_INCOMPLETE',
      mutationId: id, fixedSha256: hash(original), mutantSha256: hash(candidate),
      originalChart: parentBefore, restored, parentUnchanged, cleaned, ownedDirectory: owned,
      restoredChartArchive: `${id}-restored-chart`,
      errorCount: errors.length, renders,
      nativeGateCredit: false, original80CaseInventoryChange: 0,
      }, null, 2));
    } catch (error) { errors.push(error); }
  }
  if (errors.length > 0) throw new AggregateError(errors, `${id}: preserve all original assertion/restoration failures`);
}
describe('independent gateway private-chart counterfactuals', () => {
  it('M-RECURSION: nested refusal discriminates only recursive descent', () => measureUnit('M-RECURSION'));
  it('M-NORMALIZED-COMPARISON: relaxed refusal discriminates only protected-name case normalization',
    () => measureUnit('M-NORMALIZED-COMPARISON'));
});
