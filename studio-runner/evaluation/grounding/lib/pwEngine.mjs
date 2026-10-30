// SPK-07 F1: Playwright's own injected selector engine, instantiated inside a CDP isolated world we own.
// The source is a private string in playwright-core's bundle, so it is pinned by the bundle's sha256
// and refused on any mismatch. There is no fallback to another resolver.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const runnerRequire = createRequire(new URL('../../../package.json', import.meta.url));
// The bundle is not in the package's `exports`; read it by path (the sha256 pin below guards it).
const PACKAGE_DIR = dirname(runnerRequire.resolve('playwright-core/package.json'));
const BUNDLE = join(PACKAGE_DIR, 'lib', 'coreBundle.js');
export const PINNED_PLAYWRIGHT = '1.63.0';
export const PINNED_BUNDLE_SHA256 = '549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171';

let cached = null;
export function injectedSource() {
  if (cached) return cached;
  const version = runnerRequire('playwright-core/package.json').version;
  const bundle = readFileSync(BUNDLE);
  const sha = createHash('sha256').update(bundle).digest('hex');
  if (version !== PINNED_PLAYWRIGHT || sha !== PINNED_BUNDLE_SHA256) throw new Error(`ENGINE_PIN_MISMATCH playwright-core ${version} sha256 ${sha}`);
  const lines = bundle.toString('utf8').split('\n');
  const marker = lines.findIndex(line => line.includes('packages/playwright-core/src/generated/injectedScriptSource.ts"() {'));
  const assignment = lines.slice(marker, marker + 4).find(line => line.trimStart().startsWith('source4 = \''));
  if (marker < 0 || !assignment) throw new Error('ENGINE_SOURCE_NOT_FOUND');
  // The line is `source4 = '<JS string literal>';`. Parse the literal without evaluating bundle code.
  const literal = assignment.trim().replace(/^source4 = /u, '').replace(/;$/u, '');
  cached = Function(`"use strict"; return (${literal});`)();
  if (typeof cached !== 'string' || !cached.includes('InjectedScript')) throw new Error('ENGINE_SOURCE_INVALID');
  return cached;
}

/** Expression that evaluates, inside the target world, to a fresh InjectedScript instance. */
export function engineExpression({ testIdAttributeName = 'data-testid' } = {}) {
  const options = { isUnderTest: false, sdkLanguage: 'javascript', frameSeq: 0, testIdAttributeName, stableRafCount: 1,
    browserName: 'chromium', shouldPrependErrorPrefix: false, isUtilityWorld: true, customEngines: [] };
  return `(() => { const module = {}; ${injectedSource()}\nreturn new (module.exports.InjectedScript())(globalThis, ${JSON.stringify(options)}); })()`;
}

/** Internal selectors for today's exact hint kinds (same strings Playwright's getBy* methods build). */
export function hintSelector(hint) {
  const q = value => JSON.stringify(value);
  switch (hint.kind) {
    case 'role': return `internal:role=${hint.role}[name=${q(hint.name)}s]`;
    case 'label': return `internal:label=${q(hint.value)}s`;
    case 'testId': return `internal:testid=[data-testid=${q(hint.value)}s]`;
    case 'text': return `internal:text=${q(hint.value)}s`;
    case 'placeholder': return `internal:attr=[placeholder=${q(hint.value)}s]`;
    default: throw new Error(`UNKNOWN_HINT ${hint.kind}`);
  }
}
