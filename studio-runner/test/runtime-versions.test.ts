import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  buildRuntimeVersions,
  readChromiumBuild,
  writeRuntimeVersionsFile,
} from '../scripts/write-runtime-versions.mjs';
import {
  ARTIFACT_VERSION,
  EXECUTOR_VERSION,
  SYNTAX_REFERENCE_VERSION,
  VALIDATOR_PARSER,
  VALIDATOR_SCHEMA_VERSION,
} from '../src/versions.js';
import { packageRoot } from './helpers/corpus.js';

/**
 * AC-3: the `runtime-versions.json` generation contract.
 *
 * The image-derived fields (`chromiumBuild`, `image`) are exercised against a fake browsers
 * directory and a fake `IMAGE_TAG`, because the real ones only exist inside the pinned Playwright
 * image (`ED-05`). What is asserted here is the *contract*: they are read from the environment,
 * they are `null` off the image, and a mixed-version browser root is an error rather than a guess.
 */

const versions = {
  VALIDATOR_SCHEMA_VERSION,
  SYNTAX_REFERENCE_VERSION,
  EXECUTOR_VERSION,
  ARTIFACT_VERSION,
  VALIDATOR_PARSER,
};

const directories: string[] = [];

function makeBrowsersPath(entries: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-browsers-'));
  directories.push(root);
  for (const entry of entries) mkdirSync(join(root, entry), { recursive: true });
  writeFileSync(join(root, '.links'), '', 'utf8');
  return root;
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe('runtime-versions generation', () => {
  it('records every field AC-3 requires', () => {
    const recorded = buildRuntimeVersions({
      root: packageRoot,
      versions,
      env: {},
      nodeVersion: 'v22.11.0',
    });

    expect(Object.keys(recorded)).toEqual(
      expect.arrayContaining([
        'playwright',
        'chromiumBuild',
        'node',
        'validatorSchema',
        'executor',
        'image',
      ]),
    );
    expect(recorded.playwright).toMatch(/^\d+\.\d+\.\d+$/);
    expect(recorded.playwrightLocked).toBe(recorded.playwright);
    expect(recorded.playwrightImageTag).toBe(recorded.playwright);
    expect(recorded.node).toBe('v22.11.0');
    expect(recorded.validatorSchema).toBe(VALIDATOR_SCHEMA_VERSION);
    expect(recorded.syntaxReference).toBe(SYNTAX_REFERENCE_VERSION);
    expect(recorded.executor).toBe(EXECUTOR_VERSION);
    expect(recorded.validatorParser).toBe(
      `${VALIDATOR_PARSER.name}@${VALIDATOR_PARSER.version}`,
    );
  });

  it('leaves the image-derived fields null on a plain Node build', () => {
    const recorded = buildRuntimeVersions({
      root: packageRoot,
      versions,
      env: {},
      nodeVersion: process.version,
    });
    expect(recorded.chromiumBuild).toBeNull();
    expect(recorded.image).toBeNull();
  });

  it('reads chromiumBuild and image from the environment inside the image', () => {
    const recorded = buildRuntimeVersions({
      root: packageRoot,
      versions,
      env: {
        PLAYWRIGHT_BROWSERS_PATH: makeBrowsersPath(['chromium-1200', 'ffmpeg-1011']),
        IMAGE_TAG: 'registry.citi.com/put/checks-studio-runner:0.1.0-abc1234',
      },
      nodeVersion: process.version,
    });
    expect(recorded.chromiumBuild).toBe('1200');
    expect(recorded.image).toBe('registry.citi.com/put/checks-studio-runner:0.1.0-abc1234');
  });

  /**
   * QA MED-1. `ARG IMAGE_TAG=` with an empty default becomes `ENV IMAGE_TAG=`, so inside the image
   * the variable is defined-but-empty whenever the pipeline forgot `--build-arg IMAGE_TAG`.
   * Recording `""` would let `check:pins --require-image` treat an image that cannot name itself
   * as asserted, which AC-3 forbids. It records `null`, exactly as an absent variable does.
   */
  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t '],
  ])('records an %s IMAGE_TAG as null, not as an empty string', (_label, value) => {
    const recorded = buildRuntimeVersions({
      root: packageRoot,
      versions,
      env: {
        PLAYWRIGHT_BROWSERS_PATH: makeBrowsersPath(['chromium-1200']),
        IMAGE_TAG: value,
      },
      nodeVersion: process.version,
    });
    expect(recorded.chromiumBuild).toBe('1200');
    expect(recorded.image).toBeNull();
  });

  it('rejects a mixed-version browser root rather than picking one', () => {
    const browsers = makeBrowsersPath(['chromium-1200', 'chromium-1199']);
    expect(() => readChromiumBuild(browsers)).toThrow(/more than one Chromium build/);
  });

  it('returns null for an absent or browser-free path', () => {
    expect(readChromiumBuild(undefined)).toBeNull();
    expect(readChromiumBuild('')).toBeNull();
    expect(readChromiumBuild(join(tmpdir(), 'studio-runner-does-not-exist'))).toBeNull();
    expect(readChromiumBuild(makeBrowsersPath(['ffmpeg-1011']))).toBeNull();
  });

  it('writes the record to dist/runtime-versions.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-runner-emit-'));
    directories.push(root);
    for (const file of ['package.json', 'package-lock.json', 'Dockerfile', '.nvmrc']) {
      cpSync(join(packageRoot, file), join(root, file));
    }
    mkdirSync(join(root, 'dist'), { recursive: true });

    const target = writeRuntimeVersionsFile({
      root,
      versions,
      env: { IMAGE_TAG: 'registry.citi.com/put/checks-studio-runner:0.1.0-abc1234' },
      nodeVersion: 'v22.11.0',
    });
    expect(target).toBe(join(root, 'dist', 'runtime-versions.json'));

    const written = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(written.node).toBe('v22.11.0');
    expect(written.image).toBe('registry.citi.com/put/checks-studio-runner:0.1.0-abc1234');
    expect(written.chromiumBuild).toBeNull();
  });

  it('refuses to record a parser version that does not match the typescript pin', () => {
    expect(() =>
      buildRuntimeVersions({
        root: packageRoot,
        versions: { ...versions, VALIDATOR_PARSER: { name: 'typescript', version: '5.0.0' } },
        env: {},
        nodeVersion: process.version,
      }),
    ).toThrow(/does not match the pinned typescript dependency/);
  });
});
