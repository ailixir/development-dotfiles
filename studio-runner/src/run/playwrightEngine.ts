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
 * It also holds the live-option check G1 (`OPTION_NOT_PRESENT`), which needs the engine to find the element.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import pin from './playwrightEnginePin.json' with { type: 'json' };
import {
  checkSelectors,
  elementCandidateFacts,
  listOptions,
  resolveRefs,
  selectorElements,
  captureReadSource,
  pageInventory,
  collectPage,
  checkPublicSourceRelations,
  type ElementCandidateFacts,
  type OptionListing,
  type SelectorCheck,
} from './perceptionInPage.js';
import { nativeMatcherFactorySource, type InventoryEntry } from './privateInventory.js';
import type { Locator } from './locatorSynth.js';

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

export async function sourceValue(engine: PerceptionEngine, sourceId: string, entries: readonly InventoryEntry[]): Promise<string> {
  const declaration = `function(entries) {
    const fresh = (${pageInventory.toString()})();
    if (fresh.oversize) throw new Error('READ_REFUSED');
    const matcher = (${nativeMatcherFactorySource()})([...entries, ...fresh.entries], { workBudget: { remaining: 20000000000 } });
    this.extract(text => matcher.hitSplit([text]));
  }`;
  await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: declaration, arguments: [{ value: entries }], returnByValue: true });
  await assertUnshadowedSource(engine, sourceId);
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { return this.value(); }', returnByValue: true });
  const value = remote(result.result).value;
  if (typeof value !== 'string') throw new Error('READ_REFUSED');
  return value;
}

export async function sourceBackendNodeId(engine: PerceptionEngine, sourceId: string): Promise<number> {
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { return this.node(); }', returnByValue: false });
  const objectId = remote(result.result).objectId;
  if (typeof objectId !== 'string') throw new Error('READ_REFUSED');
  try {
    const described = await send(engine.cdp, 'DOM.describeNode', { objectId, depth: 0, pierce: false });
    const id = (described.node as { backendNodeId?: unknown } | undefined)?.backendNodeId;
    if (typeof id !== 'number') throw new Error('READ_REFUSED');
    return id;
  } finally { await engine.cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined); }
}

export async function sourceSame(engine: PerceptionEngine, sourceId: string, selector: string): Promise<boolean> {
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId,
    functionDeclaration: 'function(selector) { return this.same(selector); }',
    arguments: [{ value: selector }], returnByValue: true });
  return remote(result.result).value === true;
}

export async function compareSource(engine: PerceptionEngine, sourceId: string, expected: string, entries: readonly InventoryEntry[], mode: 'DIRECT_PUBLIC' | 'READ_BINDING_SOURCE', locator: Locator, selector: string, allEntries: readonly InventoryEntry[] = entries): Promise<boolean> {
  const context = (locator.length === 5 || locator.length === 6) && locator[0]?.by === 'tag' && locator[0].tag === 'table'
    && locator[1]?.by === 'filterHas' && locator[3]?.by === 'filterHas' ? { title: locator[1].has[0], label: locator[3].has[0] } : null;
  const declaration = `function(expected, entries, mode, selector, context, allEntries) {
    if (!this.same(selector)) throw new Error('READ_REFUSED');
    if (context && !this.context(engine => (${frozenContextDeclaration()}).call(engine, selector, context.title, context.label, allEntries, mode === 'READ_BINDING_SOURCE'))) throw new Error('READ_REFUSED');
    const makeMatcher = ${nativeMatcherFactorySource()};
    const inventory = ${pageInventory.toString()};
    this.compare(expected, entries, mode, makeMatcher, inventory, allEntries);
  }`;
  await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: declaration,
    arguments: [{ value: expected }, { value: entries }, { value: mode }, { value: selector }, { value: context }, { value: allEntries }], returnByValue: true });
  await assertUnshadowedSource(engine, sourceId);
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: sourceId, functionDeclaration: 'function() { return this.commitComparison(); }', returnByValue: true });
  const value = remote(result.result).value;
  if (typeof value !== 'boolean') throw new Error('READ_REFUSED');
  return value;
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

/** Current DOM-private inventory and native certificates are checked in one isolated task. */
export async function checkPublicRelationsOnEngine(engine: PerceptionEngine, request: Parameters<typeof checkPublicSourceRelations>[0], entries: readonly InventoryEntry[]): Promise<boolean> {
  const declaration = nativeScopeCertificateDeclaration();
  const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: engine.objectId, functionDeclaration: declaration,
    arguments: [{ value: request }, { value: entries }], returnByValue: false });
  return finishSourceCertificate(engine, result);
}

/** Reconstructs the new title + row certificate for the frozen standard-grammar locator.
 * No ordinary descendant prefix is ever selected or materialized. */
export async function checkFrozenSourceContext(engine: PerceptionEngine, locator: Locator, selector: string, entries: readonly InventoryEntry[], captureComparison = false): Promise<boolean> {
  const [table, title, row, label, cell] = locator;
  if (locator.length !== 5 && locator.length !== 6 || table?.by !== 'tag' || table.tag !== 'table' || title?.by !== 'filterHas'
    || row?.by !== 'tag' || row.tag !== 'tr' || label?.by !== 'filterHas' || cell?.by !== 'tag' || cell.tag !== 'td') return true;
  const tail = locator[5];
  if (locator.length === 6 && (tail?.by !== 'role' || tail.role !== 'link' || tail.name === undefined)) return false;
  const titleStep = title.has[0], labelStep = label.has[0];
  if (title.has.length !== 1 || label.has.length !== 1 || titleStep?.by !== 'role' || !('name' in titleStep)
    || labelStep?.by !== 'role' || !('name' in labelStep) || title.relation !== undefined || label.relation !== undefined) return false;
  const declaration = frozenContextDeclaration();
  // A live page keeps changing its own ancestors for a moment after it loads (a site script toggling classes on <html>). The certificate
  // revokes on every such change, so a revoked capture is simply made again from scratch; it is never reused or loosened. A page that
  // keeps changing past the last attempt is a drifted page (false), not an internal error.
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId: engine.objectId, functionDeclaration: declaration,
        arguments: [{ value: selector }, { value: titleStep }, { value: labelStep }, { value: entries }, { value: captureComparison }, { value: true }], returnByValue: false });
      return await finishSourceCertificate(engine, result);
    } catch (error) {
      if (!(error instanceof Error) || !['READ_REFUSED', 'PERCEPTION_UNAVAILABLE'].includes(error.message)) throw error;
      if (attempt >= CERTIFICATE_ATTEMPTS) return false;
      await new Promise<void>(resolve => { setTimeout(resolve, CERTIFICATE_RETRY_MS * attempt); });
    }
  }
}
const CERTIFICATE_ATTEMPTS = 8;
const CERTIFICATE_RETRY_MS = 150;

function frozenContextDeclaration(): string {
  return `function(selector, expectedTitle, expectedLabel, entries, captureComparison, certificate) {
    const all = this.querySelectorAll(this.parseSelector(selector), document);
    if (all.length !== 1) return false;
    const target = all[0];
    const collected = (${collectPage.toString()}).call(this);
    const refs = Object.keys(collected.facts);
    const ref = refs.find(ref => this.querySelector(this.parseSelector('aria-ref=' + ref), document, false) === target);
    const scope = ref && collected.facts[ref].readScope;
    if (!scope || !scope.tableTitleRef || scope.relation !== 'SAME_ROW_LABEL') return false;
    const metadata = collected.facts[ref];
    if (metadata.sensitive || metadata.editable || metadata.valueControl || metadata.inSelect || metadata.valueAttr
      || target.closest('[data-sensitive],[contenteditable],[aria-valuetext],[aria-valuenow],input,textarea,select')
      || target.querySelector('input,textarea,select,iframe,canvas,object,embed,[contenteditable],[data-sensitive],[aria-valuetext],[aria-valuenow]')) return false;
    const nodes = new Map();
    const walk = node => { if (typeof node === 'string') return; if (node.ref) nodes.set(node.ref, node); for (const child of node.children || []) walk(child); };
    collected.json.forEach(walk);
    const title = nodes.get(scope.tableTitleRef);
    const label = scope.sourceRefs.filter(ref => ref !== scope.tableTitleRef).map(ref => nodes.get(ref)).find(node => node && node.role === expectedLabel.role && node.name === expectedLabel.name);
    if (!title || title.role !== expectedTitle.role || title.name !== expectedTitle.name || !label) return false;
    const fresh = (${pageInventory.toString()})(); if (fresh.oversize) return false;
    const matcher = (${nativeMatcherFactorySource()})([...entries, ...fresh.entries], { workBudget: { remaining: 20000000000 } });
    if (!captureComparison && matcher.hitSplit([target.innerText])) return false;
    const sources = scope.sourceRefs.map(ref => { const node = nodes.get(ref); return node && { ref, role: node.role, name: node.name || '', mode: scope.relation }; });
    if (sources.some(source => !source || !source.name || matcher.hitSplit([source.name]))) return false;
    const request = { ref, sources, tableTitleRef: scope.tableTitleRef };
    if (certificate) return (${nativeScopeCertificateDeclaration()}).call(this, request, entries);
    return (${checkPublicSourceRelations.toString()}).call(this, request);
  }`;
}

async function finishSourceCertificate(engine: PerceptionEngine, result: Record<string, unknown>): Promise<boolean> {
  const returned = remote(result.result);
  if (typeof returned.value === 'boolean') return returned.value;
  const objectId = returned.objectId;
  if (!objectId) return false;
  try {
    await assertUnshadowedSource(engine, objectId);
    const committed = await send(engine.cdp, 'Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { return this.finish(); }', returnByValue: true });
    return remote(committed.result).value === true;
  } finally { await disposeSource(engine, objectId); }
}

function nativeScopeCertificateDeclaration(): string {
  return `function(request, entries) {
    const engine = this, readonly = request.sources.filter(source => source.mode !== 'scope');
    const held = { target: engine.querySelector(engine.parseSelector('aria-ref=' + request.ref), document, false), sources: new Map() };
    if (!held.target) return false;
    for (const source of request.sources) {
      const element = engine.querySelector(engine.parseSelector('aria-ref=' + source.ref), document, false);
      if (!element) return false; held.sources.set(source.ref, element);
    }
    const caps = [];
    const dispose = () => { for (const cap of caps) cap.dispose(); };
    try {
      const context = readonly.length ? (${nativeReadContextFactorySource()})(engine, held.target,
        { ref: request.ref, sources: readonly, ...(request.tableTitleRef ? { tableTitleRef: request.tableTitleRef } : {}) }, []) : null;
      if (context) for (const source of context.roots) caps.push((${captureReadSource.toString()}).call(engine, '', 4096, undefined, source));
      const hosts = [...new Set(caps.flatMap(cap => cap.nodes()))];
      if (hosts.length > 4096) throw new Error('READ_REFUSED');
      const fresh = (${pageInventory.toString()})(); if (fresh.oversize) throw new Error('READ_REFUSED');
      const matcher = (${nativeMatcherFactorySource()})([...entries, ...fresh.entries], { workBudget: { remaining: 20000000000 } });
      const valid = !request.sources.some(source => matcher.hitSplit([source.name]))
        && (!context || context.check(text => matcher.hitSplit([text])))
        && (${checkPublicSourceRelations.toString()}).call(engine, request, held);
      if (!context) return valid;
      return { nodes() { for (const cap of caps) cap.nodes(); return hosts; }, finish() { for (const cap of caps) cap.nodes(); return valid; }, dispose };
    } catch { dispose(); throw new Error('READ_REFUSED'); }
  }`;
}

/** Only the existing certified READ_ASSERT_ONLY group, never unrelated ancestor/form contents. */
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

/** backendNodeIds of every element an internal selector matches, in document order. */
export async function backendIdsForSelector(engine: PerceptionEngine, selector: string): Promise<number[]> {
  const arrayId = await runForHandle(engine, selectorElements, [selector]);
  const byIndex = await backendIdsOfArray(engine.cdp, arrayId);
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
}

/**
 * A page script may replace a text input with a new one while it is used (a search box whose autocomplete component re-renders it,
 * keeping its value and focus). The press that follows a fill may inherit the filled field only when the field it filled is gone
 * from the document's fields (detached or already collected) and the element it now names is the one that holds the focus. A predecessor that
 * is still attached means two different elements, which never inherit. Any failure to establish both facts is `false`.
 */
export async function replacedFocusedField(engine: PerceptionEngine, predecessorBackendNodeId: number, currentBackendNodeId: number): Promise<boolean> {
  const [fields, focused] = await Promise.all([
    backendIdsForSelector(engine, 'css=input, textarea, select, [contenteditable]'),
    backendIdsForSelector(engine, 'css=:focus'),
  ]);
  return !fields.includes(predecessorBackendNodeId) && focused.length === 1 && focused[0] === currentBackendNodeId;
}

export type Verification = { readonly count: number; readonly index: number } | { readonly error: true };

/** For each selector: how many elements it matches and where the ref's element sits among them. */
export async function verifySelectors(engine: PerceptionEngine, ref: string, selectors: readonly string[]): Promise<Verification[]> {
  const value = await runOnEngine(engine, checkSelectors, [ref, selectors]);
  if (!Array.isArray(value) || value.length !== selectors.length) throw new Error('PERCEPTION_UNAVAILABLE');
  return (value as SelectorCheck[]).map((check) => (typeof check.count === 'number' && typeof check.index === 'number' ? { count: check.count, index: check.index } : { error: true }));
}

/** Element facts used to propose locators for a ref (null when the ref no longer resolves). */
export async function candidateFactsOf(engine: PerceptionEngine, ref: string, testIdAttribute: string, candidateRefs: readonly string[]): Promise<ElementCandidateFacts | null> {
  const value = await runOnEngine(engine, elementCandidateFacts, [ref, testIdAttribute, candidateRefs]);
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') throw new Error('PERCEPTION_UNAVAILABLE');
  return value as ElementCandidateFacts;
}

// ---------------------------------------------------------------------------------------------------------------------
// G1: OPTION_NOT_PRESENT (ADR-SC-007 D3).

export type OptionGateResult =
  | { readonly kind: 'pass' }
  | { readonly kind: 'refuse'; readonly code: 'OPTION_NOT_PRESENT' }
  | { readonly kind: 'notApplicable'; readonly reason: 'NOT_A_LIST' | 'OPTIONS_UNAVAILABLE' };

const optionKey = (text: string): string => text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();

/**
 * Pure G1: the authored literal is present when, after NFKC, whitespace collapse (non-breaking spaces
 * included), trim and lower-casing, it equals one of the live options (labels and values). An empty list is
 * not a verdict.
 */
export function checkOptionPresent(literal: string, options: readonly string[]): OptionGateResult {
  const candidates = options.map(optionKey).filter((option) => option !== '');
  if (candidates.length === 0) return { kind: 'notApplicable', reason: 'OPTIONS_UNAVAILABLE' };
  return candidates.includes(optionKey(literal)) ? { kind: 'pass' } : { kind: 'refuse', code: 'OPTION_NOT_PRESENT' };
}

/**
 * G1 against the LIVE option list of the element behind `ref`: every option of a native select (the selected
 * one included, which the outline strips on purpose), or the ARIA option elements of a combobox/listbox.
 * Anything else, or an unreadable or oversize list, is not applicable and never a refusal.
 */
export async function checkLiveOptions(a: { engine: PerceptionEngine; ref: string; literal: string }): Promise<OptionGateResult> {
  const value = await runOnEngine(a.engine, listOptions, [a.ref]);
  if (value === null || value === undefined) return { kind: 'notApplicable', reason: 'OPTIONS_UNAVAILABLE' };
  const listing = value as OptionListing;
  if (listing.kind === 'none') return { kind: 'notApplicable', reason: 'NOT_A_LIST' };
  if (listing.tooMany) return { kind: 'notApplicable', reason: 'OPTIONS_UNAVAILABLE' };
  return checkOptionPresent(a.literal, [...listing.labels, ...listing.values]);
}
