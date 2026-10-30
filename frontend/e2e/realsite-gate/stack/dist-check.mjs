// Read-only verification of an EXISTING studio-runner dist for the release gate. The launcher never builds:
// WI-4 builds dist once, and the gate refuses a dist that is stale against src or still holds the old resolver.
//   node dist-check.mjs <studio-runner dir>
// Checks (all read-only):
//   1. dist/main.js and dist/runtime-versions.json exist
//   2. no dist .js contains the old resolver (unresolvedRole, locatorHints)
//   3. every src/**/*.ts (not .d.ts) has a dist/**/*.js counterpart that is not older than it (a module added or edited
//      after the build makes the dist stale)
//   4. no dist/**/*.js lacks a src counterpart (a module deleted from src but left in dist makes the dist stale)
// `node scripts/check-pins.mjs` (the runner's own dist check) and the sha comparison are done by gate-stack.sh.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOLERANCE_MS = 2000;
const OLD_RESOLVER = /unresolvedRole|locatorHints/;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/** Returns the list of problems; empty means the dist is current and clean. */
export function checkDist(runnerDir) {
  const problems = [];
  const src = join(runnerDir, 'src');
  const dist = join(runnerDir, 'dist');
  for (const required of ['main.js', 'runtime-versions.json']) {
    if (!existsSync(join(dist, required))) problems.push(`dist/${required} is missing: WI-4 has not built the runner`);
  }
  if (!existsSync(dist) || !existsSync(src)) return problems.length > 0 ? problems : ['src or dist is missing'];
  const distJs = [...walk(dist)].filter((p) => p.endsWith('.js'));
  for (const file of distJs) {
    if (OLD_RESOLVER.test(readFileSync(file, 'utf8'))) problems.push(`dist/${relative(dist, file)} still contains the old resolver (unresolvedRole/locatorHints)`);
  }
  const expected = new Set();
  for (const file of walk(src)) {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
    const rel = relative(src, file).replace(/\.ts$/, '.js');
    expected.add(rel);
    const out = join(dist, rel);
    if (!existsSync(out)) problems.push(`stale: src/${relative(src, file)} has no dist/${rel}`);
    else if (statSync(out).mtimeMs + TOLERANCE_MS < statSync(file).mtimeMs) problems.push(`stale: src/${relative(src, file)} is newer than dist/${rel}`);
  }
  for (const file of distJs) {
    const rel = relative(dist, file);
    if (!expected.has(rel)) problems.push(`stale: dist/${rel} has no src counterpart (a deleted module was never cleaned)`);
  }
  return problems;
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error('usage: node dist-check.mjs <studio-runner dir>');
    process.exit(2);
  }
  const problems = checkDist(dir);
  if (problems.length > 0) {
    console.error(`[dist-check] the runner dist is not usable:\n  - ${problems.slice(0, 20).join('\n  - ')}${problems.length > 20 ? `\n  ... and ${problems.length - 20} more` : ''}`);
    process.exit(1);
  }
  console.log('[dist-check] dist is current against src and has no old resolver');
}
