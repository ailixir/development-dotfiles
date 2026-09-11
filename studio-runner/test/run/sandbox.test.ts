/**
 * AC-6a — the sandbox is enabled and cannot be turned off.
 *
 * Architecture §9.3: non-root, compatible seccomp, *"prove sandbox startup in staging; **do not
 * disable it silently to make the image run**"*. ADR-001 §8: *"the image must never add
 * `--no-sandbox`; the launch option is `chromiumSandbox: true`"*.
 *
 * Playwright's own default is `false`, which adds a disabling flag, so the default is the wrong
 * way round and a reviewer cannot see an option that was never written. This file therefore
 * asserts **both** halves:
 *
 * - the positive — the option is written `true`, with no key, variable, job field or code path
 *   that can set it otherwise;
 * - the negative — a repo-wide scan over `studio-runner/` for the three disabling flags, inside a
 *   string, an args array or the `Dockerfile`, backed by the lint fixtures in
 *   `test/lint-boundary.test.ts` that prove the rule fires.
 *
 * The needles are **assembled from parts** so this file is not itself a match for its own scan.
 *
 * ## Comments are stripped before the scan, and that is deliberate
 *
 * The prohibition has to be *writable*: the `Dockerfile`, `ci/stages.md` and `src/run/browser.ts`
 * all say in prose that the flag must never be added, and a scan that refused to let anyone say
 * so would be a scan that deleted its own documentation. What is scanned is the code — strings,
 * args arrays, Dockerfile instructions, fenced examples — which is every form that could actually
 * reach a browser. A companion assertion checks the prose prohibition is still *present*, so the
 * two halves cannot be quietly removed together.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isSandboxFailure } from '../../src/run/sandbox.js';
import { packageRoot } from '../helpers/corpus.js';

/** Assembled, never written out: see the file comment. */
const DISABLING_FLAGS: readonly string[] = [
  ['--no', '-sandbox'].join(''),
  ['--disable-setuid', '-sandbox'].join(''),
  ['--disable-gpu', '-sandbox'].join(''),
];

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'test-results',
  // Deliberate violations, excluded from the package lint run and asserted to trip the rule by
  // `test/lint-boundary.test.ts`. A gate needs something to fire against.
  'lint',
]);

/** This file assembles the needles at run time; reading its own source would be circular. */
const SELF_REFERENTIAL_FILES = new Set([join('test', 'run', 'sandbox.test.ts')]);

/**
 * The executable content of a file: comments removed, prose removed, code kept.
 *
 * Deliberately blunt in the safe direction. Removing too much would weaken the scan, so the
 * line-comment rule ignores `//` preceded by `:` (a URL) and markdown keeps everything inside a
 * fenced block.
 */
export function codeOf(path: string, source: string): string {
  if (path.endsWith('.md')) {
    return (source.match(/^```[\s\S]*?^```/gmu) ?? []).join('\n');
  }
  if (path.endsWith('Dockerfile')) {
    return withoutHashComments(source);
  }
  if (/\.(?:ts|js|mjs|cts|mts)$/u.test(path)) {
    return source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .split('\n')
      .map((line) => line.replace(/(^|[^:])\/\/.*$/u, '$1'))
      .join('\n');
  }
  if (path.endsWith('.yaml') || path.endsWith('.yml') || path.endsWith('.npmrc')) {
    return withoutHashComments(source);
  }
  return source;
}

function withoutHashComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

function everyFile(directory: string, into: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      everyFile(full, into);
      continue;
    }
    into.push(full);
  }
  return into;
}

describe('AC-6a — the negative: no disabling flag exists anywhere under studio-runner/', () => {
  const files = everyFile(packageRoot).filter(
    (file) => !SELF_REFERENTIAL_FILES.has(relative(packageRoot, file)),
  );

  it('scans a meaningful number of files, including the Dockerfile', () => {
    // A scan that found nothing because it looked nowhere would pass silently.
    expect(files.length).toBeGreaterThan(50);
    expect(files.map((file) => relative(packageRoot, file))).toContain('Dockerfile');
  });

  it.each(DISABLING_FLAGS.map((flag) => [flag] as const))('finds no %s in any executable form', (flag) => {
    const offenders = files
      .filter((file) => codeOf(file, readFileSync(file, 'utf8')).includes(flag))
      .map((file) => relative(packageRoot, file));
    expect(
      offenders,
      `a Chromium sandbox-disabling flag was introduced; §9.3 forbids disabling it to make ` +
        `something run, whatever the something is`,
    ).toEqual([]);
  });

  it('would find one if it were introduced, in a string, an args array or a Dockerfile', () => {
    // The falsification. Without it the assertions above are indistinguishable from a scan with a
    // broken needle or a stripper that removed everything.
    const planted: readonly [string, string][] = [
      ['launch.ts', `chromium.launch({ args: ['${DISABLING_FLAGS[0] ?? ''}'] });`],
      ['args.ts', `const extra = \`${DISABLING_FLAGS[1] ?? ''}\`;`],
      ['Dockerfile', `CMD ["node", "dist/main.js", "${DISABLING_FLAGS[2] ?? ''}"]`],
      ['stages.md', '```sh\nchromium ' + (DISABLING_FLAGS[0] ?? '') + '\n```'],
    ];
    for (const [path, source] of planted) {
      const code = codeOf(path, source);
      expect(DISABLING_FLAGS.some((flag) => code.includes(flag)), path).toBe(true);
    }
  });

  it('still lets the prohibition be written down, and checks it still is', () => {
    // The other half of stripping comments: the prose must survive, or the scan would have
    // quietly removed the only place a reader learns why.
    const dockerfile = readFileSync(join(packageRoot, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/sandbox is never disabled/iu);
    const stages = readFileSync(join(packageRoot, 'ci', 'stages.md'), 'utf8');
    expect(stages).toMatch(/sandbox/iu);
  });
});

describe('AC-6a — the positive: chromiumSandbox is true, and only true', () => {
  const browserSource = readFileSync(join(packageRoot, 'src', 'run', 'browser.ts'), 'utf8');

  it('writes the option literally true', () => {
    expect(browserSource).toMatch(/chromiumSandbox:\s*true/u);
  });

  it('has no path that writes it false', () => {
    expect(browserSource).not.toMatch(/chromiumSandbox:\s*false/u);
    // Not a variable, not a ternary, not a config lookup: a literal, so a diff shows a change.
    expect(browserSource).not.toMatch(/chromiumSandbox:\s*(?!true)[A-Za-z_$(]/u);
  });

  it('passes an explicitly empty args array, so a diff can show one being filled in', () => {
    expect(browserSource).toMatch(/args:\s*\[\]/u);
  });

  it('exposes no configuration key that could reach it', () => {
    const config = readFileSync(join(packageRoot, 'src', 'server', 'config.ts'), 'utf8');
    expect(config).not.toMatch(/SANDBOX/u);
    // The seam the child launches through declares no sandbox field at all: a field would be a
    // configuration key for it, which is what AC-6a forbids.
    const factory = codeOf(
      'browserFactory.ts',
      readFileSync(join(packageRoot, 'src', 'run', 'browserFactory.ts'), 'utf8'),
    );
    expect(factory).not.toMatch(/sandbox\s*\??:/iu);
  });

  it('accepts no job field that could reach it either', () => {
    const envelope = readFileSync(join(packageRoot, 'src', 'reporting', 'envelope.ts'), 'utf8');
    expect(envelope).not.toMatch(/sandbox/iu);
  });
});

describe('AC-6a — a sandbox failure is reported, never worked around', () => {
  it('recognises the Chromium sandbox-failure family', () => {
    for (const message of [
      'Failed to move to new namespace: Operation not permitted',
      'No usable sandbox! Update your kernel',
      'The SUID sandbox helper binary was found, but is not configured correctly',
      'setuid sandbox is not running as root',
    ]) {
      expect(isSandboxFailure(message)).toBe(true);
    }
  });

  it('does not claim every launch failure is a sandbox failure', () => {
    expect(isSandboxFailure("Executable doesn't exist at /browsers/chromium-1243/chrome")).toBe(
      false,
    );
    expect(isSandboxFailure('Timeout 30000ms exceeded')).toBe(false);
  });

  it('has no relaunch path: the child calls the browser factory exactly once', () => {
    const child = codeOf(
      'childRuntime.ts',
      readFileSync(join(packageRoot, 'src', 'run', 'childRuntime.ts'), 'utf8'),
    );
    // One call site, inside one try. A second launch — with the sandbox or without it — would
    // have to be written here, and would be visible both in the diff and in this count.
    expect(child.match(/browsers\.launch\(/gu)).toHaveLength(1);
    expect(child).not.toMatch(/retry|relaunch/iu);
  });
});
