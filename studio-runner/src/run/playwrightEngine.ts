/**
 * Playwright's own selector engine, instantiated in a CDP isolated world (ADR-SC-007 D4, D7 item 4).
 *
 * The engine is Playwright's injected script, a private string inside `playwright-core/lib/coreBundle.js`.
 * It is therefore pinned by the sha256 of that bundle and the exact playwright-core version
 * (`playwrightEnginePin.json`, also asserted by `scripts/check-pins.mjs`). Any mismatch is refused with
 * `ENGINE_PIN_MISMATCH`; there is no fallback resolver. The string literal that holds the source is decoded
 * here by a small hand-written decoder, never by evaluating bundle code.
 *
 * This module only talks to the browser through a structural `CdpSession`; it does not import Playwright.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import pin from './playwrightEnginePin.json' with { type: 'json' };
import {
  resolveRefs,
  captureReadSource,
  collectPage,
  checkPublicSourceRelations,
} from './perceptionInPage.js';
/** The locator steps the in-page read-context factory receives. Its only caller passes none; the type is the JSON shape, not a grammar. */
type Locator = readonly object[];

export interface CdpSession {
  send(method: string, params?: object): Promise<unknown>;
}

const untrackedChannels = new WeakSet<CdpSession>();
const OBSERVATION_METHODS = new Set(['DOM.enable','DOM.describeNode','Runtime.enable','Runtime.evaluate','Runtime.callFunctionOn','Runtime.getProperties','Runtime.releaseObject','Page.getFrameTree','Page.createIsolatedWorld']);
/** The caller supplies its newly opened dedicated session. No tracking API can ever reach it. */
export function untrackedObservationChannel(raw: CdpSession): CdpSession {
  let live = true;
  const channel: CdpSession = Object.freeze({
    send(method: string, params?: object): Promise<unknown> {
      if (!live || !OBSERVATION_METHODS.has(method)) { live = false; return Promise.reject(new Error('READ_REFUSED')); }
      if (method === 'DOM.describeNode') {
        const input = params as { objectId?: unknown; depth?: unknown; pierce?: unknown } | undefined;
        if (typeof input?.objectId !== 'string' || input.depth !== undefined && input.depth !== 0 || input.pierce !== undefined && input.pierce !== false) { live = false; return Promise.reject(new Error('READ_REFUSED')); }
        return raw.send(method, { objectId: input.objectId, depth: 0, pierce: false });
      }
      return raw.send(method, params);
    },
  });
  untrackedChannels.add(channel);
  return channel;
}

export const ENGINE_PIN: { readonly playwright: string; readonly coreBundleSha256: string } = {
  playwright: pin.playwright,
  coreBundleSha256: pin.coreBundleSha256,
};

// ---------------------------------------------------------------------------------------------------------------------
// Source loading.

const MARKER = 'packages/playwright-core/src/generated/injectedScriptSource.ts"() {';
const ASSIGNMENT = "source4 = '";

/** Decodes a single-quoted JavaScript string literal (quotes included) without evaluating anything. */
export function decodeJsStringLiteral(literal: string): string {
  if (literal.length < 2 || !literal.startsWith("'")) throw new Error('ENGINE_SOURCE_INVALID');
  let out = '';
  let i = 1;
  const hex = (from: number, length: number): number => {
    const digits = literal.slice(from, from + length);
    if (digits.length !== length || !/^[0-9a-fA-F]+$/u.test(digits)) throw new Error('ENGINE_SOURCE_INVALID');
    return Number.parseInt(digits, 16);
  };
  while (i < literal.length) {
    const ch = literal[i] ?? '';
    if (ch === "'") {
      // The literal must close here and end the string: nothing may follow the closing quote.
      if (i !== literal.length - 1) throw new Error('ENGINE_SOURCE_INVALID');
      return out;
    }
    if (ch !== '\\') {
      out += ch;
      i += 1;
      continue;
    }
    const next = literal[i + 1];
    if (next === undefined) throw new Error('ENGINE_SOURCE_INVALID');
    i += 2;
    switch (next) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0':
        if (/[0-9]/u.test(literal[i] ?? '')) throw new Error('ENGINE_SOURCE_INVALID');
        out += '\0';
        break;
      case 'x': out += String.fromCharCode(hex(i, 2)); i += 2; break;
      case 'u':
        if (literal[i] === '{') {
          const close = literal.indexOf('}', i);
          if (close < 0) throw new Error('ENGINE_SOURCE_INVALID');
          const code = hex(i + 1, close - i - 1);
          if (code > 0x10ffff) throw new Error('ENGINE_SOURCE_INVALID');
          out += String.fromCodePoint(code);
          i = close + 1;
        } else {
          out += String.fromCharCode(hex(i, 4));
          i += 4;
        }
        break;
      default:
        if (/[1-9]/u.test(next)) throw new Error('ENGINE_SOURCE_INVALID');
        if (next === '\n') break; // line continuation
        out += next;
    }
  }
  throw new Error('ENGINE_SOURCE_INVALID'); // never closed
}

export interface EngineFiles {
  readonly bundlePath: string;
  readonly version: string;
  readonly expected: { readonly playwright: string; readonly coreBundleSha256: string };
}

const sourceCache = new Map<string, string>();

/**
 * Internal seam (tests only; no index exports it): the same load as `loadInjectedSource` against explicit
 * files and expectations. The bundle is read once; the sha256 is taken of, and the source decoded from,
 * that same buffer. A failure is never cached.
 */
export function loadInjectedSourceFrom(files: EngineFiles): string {
  const bundle = readFileSync(files.bundlePath);
  const sha = createHash('sha256').update(bundle).digest('hex');
  if (files.version !== files.expected.playwright || sha !== files.expected.coreBundleSha256) {
    throw new Error(`ENGINE_PIN_MISMATCH playwright-core ${files.version} sha256 ${sha}`);
  }
  const key = `${files.bundlePath}\0${sha}`;
  const cached = sourceCache.get(key);
  if (cached !== undefined) return cached;
  const lines = bundle.toString('utf8').split('\n');
  const marker = lines.findIndex((line) => line.includes(MARKER));
  if (marker < 0) throw new Error('ENGINE_SOURCE_NOT_FOUND');
  const assignment = lines.slice(marker, marker + 4).find((line) => line.trimStart().startsWith(ASSIGNMENT));
  if (assignment === undefined) throw new Error('ENGINE_SOURCE_NOT_FOUND');
  const statement = assignment.trim();
  if (!statement.endsWith("';")) throw new Error('ENGINE_SOURCE_INVALID');
  // `source4 = '<literal>';` -> the literal including both quotes
  const source = decodeJsStringLiteral(statement.slice('source4 = '.length, -1));
  if (!source.includes('InjectedScript')) throw new Error('ENGINE_SOURCE_INVALID');
  sourceCache.set(key, source);
  return source;
}

/**
 * The pinned injected-script source. Locates playwright-core through the declared `playwright` package.
 * Throws `ENGINE_PIN_MISMATCH` unless playwright-core is exactly the pinned version and bundle.
 */
export function loadInjectedSource(): string {
  const here = createRequire(import.meta.url);
  const playwrightRequire = createRequire(here.resolve('playwright/package.json'));
  const corePackage = playwrightRequire.resolve('playwright-core/package.json');
  const { version } = JSON.parse(readFileSync(corePackage, 'utf8')) as { version?: unknown };
  return loadInjectedSourceFrom({
    bundlePath: join(dirname(corePackage), 'lib', 'coreBundle.js'),
    version: typeof version === 'string' ? version : '',
    expected: ENGINE_PIN,
  });
}

/** Expression that evaluates, inside the target world, to a fresh InjectedScript instance. */
export function engineExpression(source: string, testIdAttributeName = 'data-testid'): string {
  const options = {
    isUnderTest: false, sdkLanguage: 'javascript', frameSeq: 0, testIdAttributeName, stableRafCount: 1,
    browserName: 'chromium', shouldPrependErrorPrefix: false, isUtilityWorld: true, customEngines: [],
  };
  return `(() => { const module = {}; ${source}\nreturn new (module.exports.InjectedScript())(globalThis, ${JSON.stringify(options)}); })()`;
}

// ---------------------------------------------------------------------------------------------------------------------
// CDP plumbing. Every failure is a closed code; CDP and page text never reaches an Error.

async function send(cdp: CdpSession, method: string, params?: object): Promise<Record<string, unknown>> {
  let result: unknown;
  try {
    result = await cdp.send(method, params);
  } catch {
    throw new Error('PERCEPTION_UNAVAILABLE');
  }
  if (typeof result !== 'object' || result === null) throw new Error('PERCEPTION_UNAVAILABLE');
  const record = result as Record<string, unknown>;
  if (record.exceptionDetails !== undefined) throw new Error('PERCEPTION_UNAVAILABLE');
  return record;
}

const remote = (value: unknown): { value?: unknown; objectId?: string } => {
  if (typeof value !== 'object' || value === null) throw new Error('PERCEPTION_UNAVAILABLE');
  return value as { value?: unknown; objectId?: string };
};

export interface PerceptionEngine {
  readonly cdp: CdpSession;
  readonly worldId: number;
  readonly objectId: string;
}

/** Creates the isolated world and instantiates the pinned engine in it. */
export async function openEngine(cdp: CdpSession, options: { worldName?: string } = {}): Promise<PerceptionEngine> {
  const source = loadInjectedSource();
  await send(cdp, 'DOM.enable');
  await send(cdp, 'Runtime.enable');
  const tree = await send(cdp, 'Page.getFrameTree');
  const frame = (tree.frameTree as { frame?: { id?: unknown } } | undefined)?.frame;
  if (typeof frame?.id !== 'string') throw new Error('PERCEPTION_UNAVAILABLE');
  const world = await send(cdp, 'Page.createIsolatedWorld', {
    frameId: frame.id, worldName: options.worldName ?? `checks-perception-${String(Date.now())}-${Math.random().toString(36).slice(2)}`, grantUniveralAccess: false,
  });
  const worldId = world.executionContextId;
  if (typeof worldId !== 'number') throw new Error('PERCEPTION_UNAVAILABLE');
  const evaluated = await send(cdp, 'Runtime.evaluate', { contextId: worldId, expression: engineExpression(source), returnByValue: false, awaitPromise: true });
  const objectId = remote(evaluated.result).objectId;
  if (typeof objectId !== 'string') throw new Error('PERCEPTION_UNAVAILABLE');
  return { cdp, worldId, objectId };
}

type EngineProgram = (...args: never[]) => unknown;

/** Runs one page program on the engine (`this` is the InjectedScript) and returns its value. */
export async function runOnEngine(engine: PerceptionEngine, program: EngineProgram, args: readonly unknown[] = []): Promise<unknown> {
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', {
    objectId: engine.objectId, functionDeclaration: program.toString(), arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: false,
  });
  return remote(result.result).value;
}

async function runForHandle(engine: PerceptionEngine, program: EngineProgram, args: readonly unknown[]): Promise<string> {
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', {
    objectId: engine.objectId, functionDeclaration: program.toString(), arguments: args.map((value) => ({ value })), returnByValue: false, awaitPromise: false,
  });
  const objectId = remote(result.result).objectId;
  if (typeof objectId !== 'string') throw new Error('PERCEPTION_UNAVAILABLE');
  return objectId;
}

export async function captureSourceOnEngine(engine: PerceptionEngine, selector: string, maxBytes: number, locator: Locator = [],
  readContext?: Parameters<typeof checkPublicSourceRelations>[0] | null): Promise<string> {
  if (!untrackedChannels.has(engine.cdp)) throw new Error('READ_REFUSED');
  const declaration = `function(selector, maxBytes, locator, hasKnownContext, request) {
    const factory = ${nativeReadContextFactorySource()};
    return (${captureReadSource.toString()}).call(this, selector, maxBytes,
      (engine, target) => factory(engine, target, hasKnownContext ? request : undefined, locator));
  }`;
  try {
    const response = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: engine.objectId, functionDeclaration: declaration,
      arguments: [{ value: selector }, { value: maxBytes }, { value: locator }, { value: readContext !== undefined }, { value: readContext ?? null }], returnByValue: false });
    const objectId = remote(response.result).objectId;
    if (typeof objectId !== 'string') throw new Error('READ_REFUSED');
    return objectId;
  }
  catch { throw new Error('READ_REFUSED'); }
}





/** R5: quarantine metadata on the dedicated untracked channel; never inspect or retain payload text. */
async function assertUnshadowedSource(engine: PerceptionEngine, sourceId: string): Promise<void> {
  if (!untrackedChannels.has(engine.cdp)) throw new Error('READ_REFUSED');
  let arrayId: string | undefined;
  const handles: string[] = [];
  try {
    const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { return this.nodes(); }', returnByValue: false });
    arrayId = remote(result.result).objectId;
    if (!arrayId) throw new Error('READ_REFUSED');
    const properties = await send(engine.cdp, 'Runtime.getProperties', { objectId: arrayId, ownProperties: true });
    if (!Array.isArray(properties.result)) throw new Error('READ_REFUSED');
    let count = -1;
    const byIndex = new Map<number,string>();
    for (const entry of properties.result as { name?: unknown; value?: { objectId?: unknown; value?: unknown } }[]) {
      if (entry.name === 'length' && typeof entry.value?.value === 'number') count = entry.value.value;
      else if (typeof entry.name === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(entry.name) && typeof entry.value?.objectId === 'string') {
        byIndex.set(Number(entry.name), entry.value.objectId); handles.push(entry.value.objectId);
      }
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 4096 || byIndex.size !== count) throw new Error('READ_REFUSED');
    for (let index = 0; index < count; index++) {
      const objectId = byIndex.get(index); if (!objectId) throw new Error('READ_REFUSED');
      // The response is reduced immediately and never used for names, attributes, facts or diagnostics.
      const safe = await engine.cdp.send('DOM.describeNode', { objectId, depth: 0, pierce: false }).then(payload => {
        if (typeof payload !== 'object' || payload === null || !('node' in payload)) return false;
        const node = payload.node;
        if (typeof node !== 'object' || node === null) return false;
        const shape = node as { nodeType?: unknown; shadowRoots?: unknown; children?: unknown; contentDocument?: unknown; templateContent?: unknown; pseudoElements?: unknown; shadowRootType?: unknown };
        const pseudo = shape.pseudoElements;
        // ::before/::after are structural only here (childNodeCount 0 holds for non-empty content too); emptiness is certified by the in-page computed-content policy re-run below.
        const pseudoOnly = pseudo === undefined || Array.isArray(pseudo) && pseudo.length >= 1 && pseudo.length <= 3 && (() => {
          const seen = new Set<unknown>();
          return pseudo.every((item: unknown) => {
            if (typeof item !== 'object' || item === null) return false;
            const entry = item as { nodeType?: unknown; pseudoType?: unknown; nodeValue?: unknown; childNodeCount?: unknown; children?: unknown; shadowRoots?: unknown; contentDocument?: unknown; templateContent?: unknown; pseudoElements?: unknown; shadowRootType?: unknown };
            if (entry.pseudoType !== 'marker' && entry.pseudoType !== 'before' && entry.pseudoType !== 'after' || seen.has(entry.pseudoType)) return false;
            seen.add(entry.pseudoType);
            return entry.nodeType === 1 && (entry.pseudoType === 'marker' ? entry.nodeValue === '' : entry.nodeValue === undefined || entry.nodeValue === '')
              && (entry.childNodeCount === undefined || entry.childNodeCount === 0) && entry.children === undefined && entry.shadowRoots === undefined
              && entry.contentDocument === undefined && entry.templateContent === undefined && entry.pseudoElements === undefined && entry.shadowRootType === undefined;
          });
        })();
        return shape.nodeType === 1 && shape.shadowRoots === undefined && shape.children === undefined
          && shape.contentDocument === undefined && shape.templateContent === undefined && pseudoOnly && shape.shadowRootType === undefined;
      }, () => false);
      if (!safe) throw new Error('READ_REFUSED');
    }
    // This also proves the complete ORIGINAL host membership/document/ancestor epoch is unchanged.
    await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { this.nodes(); }', returnByValue: true });
  } catch {
    await disposeSource(engine, sourceId);
    throw new Error('READ_REFUSED');
  } finally {
    for (const objectId of handles) await engine.cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined);
    if (arrayId) await engine.cdp.send('Runtime.releaseObject', { objectId: arrayId }).catch(() => undefined);
  }
}

export async function disposeSource(engine: PerceptionEngine, sourceId: string): Promise<void> {
  await engine.cdp.send('Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { this.dispose(); }' }).catch(() => undefined);
  await engine.cdp.send('Runtime.releaseObject', { objectId: sourceId }).catch(() => undefined);
}

/** Before observation export, quarantine only the newly certified native public families. */
export async function unsafePublicRoots(engine: PerceptionEngine, refs: readonly string[]): Promise<ReadonlySet<string>> {
  const unsafe = new Set<string>();
  if (refs.length > 4096) throw new Error('PERCEPTION_UNAVAILABLE');
  for (const ref of refs) {
    let sourceId: string | undefined;
    try {
      sourceId = await captureSourceOnEngine(engine, `aria-ref=${ref}`, 4096, [], null);
      await assertUnshadowedSource(engine, sourceId);
    } catch { unsafe.add(ref); }
    finally { if (sourceId) await disposeSource(engine, sourceId); }
  }
  return unsafe;
}


function nativeReadContextFactorySource(): string {
  return `function(engine, target, request, locator) {
    const fullTable = (locator.length === 5 || locator.length === 6) && locator[0]?.by === 'tag' && locator[0].tag === 'table'
      && locator[1]?.by === 'filterHas' && locator[2]?.by === 'tag' && locator[2].tag === 'tr'
      && locator[3]?.by === 'filterHas' && locator[4]?.by === 'tag' && locator[4].tag === 'td';
    if (request === undefined) {
      const collected = (${collectPage.toString()}).call(engine), nodes = new Map();
      const walk = node => { if (typeof node === 'string') return; if (node.ref) nodes.set(node.ref, node); for (const child of node.children || []) walk(child); };
      collected.json.forEach(walk);
      const ref = Object.keys(collected.facts).find(ref => engine.querySelector(engine.parseSelector('aria-ref=' + ref), document, false) === target);
      const scope = ref && collected.facts[ref].readScope;
      request = scope ? { ref, sources: scope.sourceRefs.map(sourceRef => { const node = nodes.get(sourceRef); return node && { ref: sourceRef, name: node.name || '', role: node.role, mode: scope.relation }; }), ...(scope.tableTitleRef ? { tableTitleRef: scope.tableTitleRef } : {}) } : null;
    }
    if (!request) { if (fullTable) throw new Error('READ_REFUSED'); return null; }
    if (!Array.isArray(request.sources) || request.sources.length < 1 || request.sources.length > 8
      || new Set(request.sources.map(source => source?.ref)).size !== request.sources.length) throw new Error('READ_REFUSED');
    const held = { target, sources: new Map() };
    for (const source of request.sources) {
      if (!source || typeof source.name !== 'string' || !source.name || Array.from(source.name).length > 80
        || !['SAME_ROW_LABEL','IMMEDIATE_HEADING_SAME_PARENT','R7_ADJACENT_PUBLIC'].includes(source.mode)) throw new Error('READ_REFUSED');
      const element = engine.querySelector(engine.parseSelector('aria-ref=' + source.ref), document, false);
      if (!element || element === target || held.sources.has(source.ref)) throw new Error('READ_REFUSED');
      held.sources.set(source.ref, element);
    }
    if (fullTable) {
      const title = locator[1].has[0], label = locator[3].has[0];
      const actualTitle = request.sources.find(source => source.ref === request.tableTitleRef);
      if (!actualTitle || !title || !label || actualTitle.name !== title.name || actualTitle.role !== title.role
        || !request.sources.some(source => source.ref !== request.tableTitleRef && source.name === label.name && source.role === label.role)) throw new Error('READ_REFUSED');
    }
    return { roots: [...held.sources.values()], check(privateHit) {
      for (const source of request.sources) {
        const element = held.sources.get(source.ref), text = element.innerText;
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > 4096
          || /[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]/u.test(text)
          || privateHit(source.name) || privateHit(text)) return false;
      }
      return (${checkPublicSourceRelations.toString()}).call(engine, request, held);
    } };
  }`;
}

/** backendNodeIds of the elements in a remote array, by index (a vanished element is simply absent). */
async function backendIdsOfArray(cdp: CdpSession, arrayId: string): Promise<Map<number, number>> {
  const properties = await send(cdp, 'Runtime.getProperties', { objectId: arrayId, ownProperties: true });
  const list = properties.result;
  const byIndex = new Map<number, string>();
  if (Array.isArray(list)) {
    for (const property of list as { name?: unknown; value?: { objectId?: unknown } }[]) {
      if (typeof property.name === 'string' && /^\d+$/u.test(property.name) && typeof property.value?.objectId === 'string') {
        byIndex.set(Number(property.name), property.value.objectId);
      }
    }
  }
  const out = new Map<number, number>();
  const entries = [...byIndex.entries()];
  for (let start = 0; start < entries.length; start += 64) {
    await Promise.all(entries.slice(start, start + 64).map(async ([index, objectId]) => {
      try {
        const described = await cdp.send('DOM.describeNode', { objectId });
        const id = (described as { node?: { backendNodeId?: unknown } } | null)?.node?.backendNodeId;
        if (typeof id === 'number') out.set(index, id);
      } catch {
        // the element vanished: not nameable
      }
    }));
  }
  try {
    await cdp.send('Runtime.releaseObject', { objectId: arrayId });
  } catch {
    // best effort
  }
  return out;
}

/** CDP backendNodeId of the element behind each ref of the engine's last snapshot (identity is by backendNodeId only). */
export async function backendNodeIdsFor(engine: PerceptionEngine, refs: readonly string[]): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  if (refs.length === 0) return ids;
  const arrayId = await runForHandle(engine, resolveRefs, [refs]);
  const byIndex = await backendIdsOfArray(engine.cdp, arrayId);
  refs.forEach((ref, index) => {
    const id = byIndex.get(index);
    if (id !== undefined) ids[ref] = id;
  });
  return ids;
}
