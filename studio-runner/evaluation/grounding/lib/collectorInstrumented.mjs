/* eslint-disable no-restricted-syntax -- SPK-07 harness (not shipped): loads the generated, hash-pinned instrumented collector; the path is a constant, never artifact content. */
// SPK-07: the production observation collector (dist/run/observationCollector.js), generated into an instrumented copy that
// ALSO exposes nodeId -> Element, so the harness can compute backendNodeIds (identity is by backendNodeId only).
//
// Never hand-forked: the copy is produced by one exact string insertion into the pinned source. Generation REFUSES when the
// source sha256 is not the pinned one or when the insertion anchor is not found exactly once. The inserted method only reads
// the collector's own `identities` map; it changes no behaviour.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backendNodeId, call, evaluateHandle, isolatedWorld } from './cdp.mjs';

// The production modules the spike reuses are read from byte copies frozen with SPK-07 (generated/frozen-dist, same layout as studio-runner/dist),
// never from studio-runner/dist: a later dist rebuild must not change the frozen spike. The collector is also sha256-pinned below.
export const FROZEN_DIST = new URL('../generated/frozen-dist/', import.meta.url);
export const SOURCE_PATH = fileURLToPath(new URL('run/observationCollector.js', FROZEN_DIST));
export const GENERATED_DIR = fileURLToPath(new URL('../generated/', import.meta.url));
export const GENERATED_PATH = `${GENERATED_DIR}observationCollector.instrumented.mjs`;
export const PINNED_SOURCE_SHA256 = '06457ea43ab64c4c97b2a64afb561b0534cfcfb17b1a1c9548cda89b5a812dbc';

export const PATCH = Object.freeze({
  anchor: '    return {\n        collect(identity) {\n',
  insertion: '    return {\n        __spk07Element(nodeId) { return identities.get(nodeId) ?? null; },\n        collect(identity) {\n',
});
// The trailing sourceMappingURL comment is dropped (the copy lives elsewhere, so it would point at a missing map); comments do not execute.
const SOURCE_MAP_COMMENT = /\n\/\/# sourceMappingURL=observationCollector\.js\.map\s*$/u;
const HEADER_PREFIX = '// SPK-07 GENERATED FILE. Do not edit.';
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Pure: the instrumented source for a given source text, or a refusal. Exported for tests. */
export function patchSource(sourceText, { pinned = PINNED_SOURCE_SHA256 } = {}) {
  const actual = sha256(sourceText);
  if (actual !== pinned) throw new Error(`COLLECTOR_SOURCE_PIN_MISMATCH expected ${pinned} actual ${actual}`);
  const occurrences = sourceText.split(PATCH.anchor).length - 1;
  if (occurrences !== 1) throw new Error(`COLLECTOR_PATCH_ANCHOR_COUNT ${occurrences}`);
  const withoutMap = sourceText.replace(SOURCE_MAP_COMMENT, '');
  if (withoutMap.length === sourceText.length) throw new Error('COLLECTOR_SOURCE_MAP_COMMENT_MISSING');
  const header = `${HEADER_PREFIX} Source: dist/run/observationCollector.js sha256 ${actual}.\n// Patch: one insertion, \`__spk07Element(nodeId)\`, before \`collect(identity)\` in the object returned by installObservationCollector; the sourceMappingURL comment is dropped.\n`;
  return header + withoutMap.replace(PATCH.anchor, () => PATCH.insertion);
}

/** The frozen source in its LF form, so the pin also matches on a CRLF (Windows) checkout; an LF file is unchanged. */
export const readSource = () => readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/gu, '\n');

/** Write generated/observationCollector.instrumented.mjs (idempotent) and return its path. */
export function generate() {
  const text = patchSource(readSource());
  mkdirSync(GENERATED_DIR, { recursive: true });
  if (!existsSync(GENERATED_PATH) || readFileSync(GENERATED_PATH, 'utf8') !== text) writeFileSync(GENERATED_PATH, text);
  writeFileSync(`${GENERATED_DIR}observationCollector.instrumented.meta.json`, `${JSON.stringify({ sourceSha256: PINNED_SOURCE_SHA256, outputSha256: sha256(text), patch: '__spk07Element(nodeId) inserted before collect(identity)' }, null, 1)}\n`);
  return GENERATED_PATH;
}

let loaded = null;
/** The instrumented module (generating or regenerating it first, so the file on disk always equals the patch of the pinned source). */
export async function loadInstrumented() {
  if (!loaded) { generate(); loaded = import(pathToFileURL(GENERATED_PATH).href); }
  return loaded;
}

/** The production dist modules the arms reuse. */
export async function loadProduction() {
  const dist = new URL('run/', FROZEN_DIST);
  const [sanitizer, profile] = await Promise.all([import(new URL('observationSanitizer.js', dist).href), import(new URL('observationReadProfile.js', dist).href)]);
  return { observationOptions: sanitizer.observationOptions, canonicalObservation: sanitizer.canonicalObservation, observationReadProfile: profile.observationReadProfile };
}

/** Production defaults (observationOptions ceilings) and the lifted limits used by A1 and later arms. */
export const PRODUCTION_LIMITS = Object.freeze({ nodes: 500, depth: 8, bytes: 32768, milliseconds: 50 });
export const PRODUCTION_WORK_LIMITS = Object.freeze({ elements: 4096, depth: 64 });
export const LIFTED_LIMITS = Object.freeze({ nodes: 100000, depth: 64, bytes: 67108864, milliseconds: 20000 });
export const LIFTED_WORK_LIMITS = Object.freeze({ elements: 200000, depth: 64 });

/**
 * Install the instrumented collector in a fresh isolated world of `page` and return a small facade.
 * `options` is a complete CollectorOptions object (already validated/normalised by the caller).
 */
export async function openCollector({ cdp, options }) {
  const { installObservationCollector } = await loadInstrumented();
  const world = await isolatedWorld(cdp);
  const handle = await evaluateHandle(cdp, world, `(${installObservationCollector.toString()})(${JSON.stringify(options)}, [])`);
  const facade = {
    world, handle, options,
    /** Runs the production collect(); returns { observation, ms }. */
    async collect({ documentId, generation = 1, observedAt = new Date().toISOString() }) {
      const started = Date.now();
      const observation = await call(cdp, handle, 'function(identity) { return this.collect(identity); }', [{ documentId, generation, observedAt }]);
      return { observation, ms: Date.now() - started };
    },
    /** nodeId -> backendNodeId for the given nodes (identity never touches the DOM). */
    async backendIds(nodeIds, chunk = 40) {
      const map = {};
      for (let i = 0; i < nodeIds.length; i += chunk) {
        await Promise.all(nodeIds.slice(i, i + chunk).map(async nodeId => {
          const objectId = await call(cdp, handle, 'function(id) { return this.__spk07Element(id); }', [nodeId], false);
          map[nodeId] = objectId ? await backendNodeId(cdp, objectId) : null;
        }));
      }
      return map;
    },
    /** The collector's own production matches(target, locator). */
    matches(target, locator) { return call(cdp, handle, 'function(target, locator) { return this.matches(target, locator); }', [target, locator]); },
    async dispose() { try { await call(cdp, handle, 'function() { return this.dispose(); }'); } catch { /* the page may have navigated */ } },
  };
  return facade;
}
