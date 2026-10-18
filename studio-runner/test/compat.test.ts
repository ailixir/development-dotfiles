import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  currentRuntimeVersions,
  DEFAULT_RUNTIME_VERSIONS_FILE,
  loadRuntimeVersions,
  resetRuntimeVersionsCache,
} from '../src/compat/index.js';

/**
 * The recorded runtime versions (`dist/runtime-versions.json`) are read fail-closed.
 *
 * The artifact-1 compatibility cases (`isCompatible`, `assertCompatible`, the older-schema refusal)
 * were deleted with the artifact-1 engine by STUDIO-OBS-012A AC-3. STUDIO-OBS-009 AC-1 P2 b moved
 * the required-field list from the artifact-1 stamps to the observed identities.
 */

/** The identities a build must record (AC-1 P2 b): the Playwright pin and the four observed ones. */
const OBSERVED_RECORD = {
  playwright: '1.63.0',
  observedSchemaBundleHash: 'a'.repeat(64),
  observedReferenceBundleHash: 'b'.repeat(64),
  observedChromiumBuild: '1243',
  observedBrowserLauncherSha256: 'c'.repeat(64),
};

/** The five stamps the deleted artifact-1 engine left behind. They satisfy nothing now. */
const RETIRED_STAMPS = {
  artifact: 1,
  validatorSchema: '2.0.0',
  validatorParser: 'typescript@5.9.3',
  syntaxReference: '2.1.0',
  executor: '2.1.0',
};

const files: string[] = [];

function writeRuntimeFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'studio-runner-compat-'));
  files.push(directory);
  const file = join(directory, 'runtime-versions.json');
  writeFileSync(file, contents, 'utf8');
  return file;
}

afterAll(() => {
  for (const directory of files) rmSync(directory, { recursive: true, force: true });
});

describe('loadRuntimeVersions', () => {
  it('reads the recorded version fields', () => {
    const file = writeRuntimeFile(
      `${JSON.stringify({ ...OBSERVED_RECORD, chromiumBuild: null, image: null })}\n`,
    );
    const loaded = loadRuntimeVersions(file);
    expect(loaded.playwright).toBe('1.63.0');
    expect(loaded.observedChromiumBuild).toBe('1243');
    expect(loaded.chromiumBuild).toBeNull();
  });

  it('fails closed when the file is absent', () => {
    expect(() => loadRuntimeVersions(join(tmpdir(), 'studio-runner-absent.json'))).toThrow(
      /Could not read runtime versions/,
    );
  });

  it('fails closed when the file is not an object', () => {
    const file = writeRuntimeFile('"1.63.0"\n');
    expect(() => loadRuntimeVersions(file)).toThrow(/does not contain a runtime-versions object/);
  });

  it('fails closed when a required observed identity is missing', () => {
    const file = writeRuntimeFile(`${JSON.stringify({ playwright: '1.63.0' })}\n`);
    expect(() => loadRuntimeVersions(file)).toThrow(
      /missing required version fields: observedSchemaBundleHash, observedReferenceBundleHash, observedChromiumBuild, observedBrowserLauncherSha256/,
    );
  });

  it.each(Object.keys(OBSERVED_RECORD))('refuses a record without %s', (field) => {
    const without = Object.fromEntries(Object.entries(OBSERVED_RECORD).filter(([key]) => key !== field));
    const record: Record<string, unknown> = { ...OBSERVED_RECORD };
    expect(() => loadRuntimeVersions(writeRuntimeFile(JSON.stringify(without)))).toThrow(
      new RegExp(`missing required version fields: ${field}\\.`),
    );
    record[field] = null;
    expect(() => loadRuntimeVersions(writeRuntimeFile(JSON.stringify(record)))).toThrow(
      new RegExp(`missing required version fields: ${field}\\.`),
    );
    record[field] = '';
    expect(() => loadRuntimeVersions(writeRuntimeFile(JSON.stringify(record)))).toThrow(
      new RegExp(`missing required version fields: ${field}\\.`),
    );
  });

  it('does not accept the retired artifact-1 stamps in place of the observed identities', () => {
    const file = writeRuntimeFile(
      `${JSON.stringify({ playwright: '1.63.0', ...RETIRED_STAMPS })}\n`,
    );
    expect(() => loadRuntimeVersions(file)).toThrow(/missing required version fields: observed/);
  });

  it('defaults to the file the build emits next to the compiled entry points', () => {
    expect(DEFAULT_RUNTIME_VERSIONS_FILE).toMatch(/runtime-versions\.json$/);
  });

  it('reads the record once and re-reads only after a reset', () => {
    const record = OBSERVED_RECORD;
    const first = writeRuntimeFile(`${JSON.stringify(record)}\n`);
    const second = writeRuntimeFile(`${JSON.stringify({ ...record, playwright: '1.62.0' })}\n`);

    resetRuntimeVersionsCache();
    const loaded = currentRuntimeVersions(first);
    // The second path is ignored while the record is memoised.
    expect(currentRuntimeVersions(second)).toBe(loaded);

    resetRuntimeVersionsCache();
    expect(currentRuntimeVersions(second).playwright).toBe('1.62.0');
    resetRuntimeVersionsCache();
  });
});
