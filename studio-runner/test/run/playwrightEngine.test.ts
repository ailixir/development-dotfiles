import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveRefs } from '../../src/run/perceptionInPage.js';
import {
  ENGINE_PIN,
  backendNodeIdsFor,
  decodeJsStringLiteral,
  engineExpression,
  loadInjectedSource,
  loadInjectedSourceFrom,
  openEngine,
  runOnEngine,
  type CdpSession,
  type PerceptionEngine,
} from '../../src/run/playwrightEngine.js';
import { packageRoot } from '../helpers/corpus.js';

/**
 * ADR-SC-007 D4 / D7 item 4: the Playwright injected-script engine is pinned by the sha256 of
 * playwright-core/lib/coreBundle.js, parsed without evaluating anything, and refused (no fallback) on any
 * mismatch. Also the live option check G1.
 */

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const sha = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return 'NO_ERROR';
};
const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return 'NO_ERROR';
};

const MARKER_LINE = '  "packages/playwright-core/src/generated/injectedScriptSource.ts"() {';

/** A stand-in bundle with the marker line followed by the assignment of a (small) injected source. */
function stubBundle(literal: string, extra = ''): string {
  return `// stand-in bundle ${extra}\nvar init = {\n${MARKER_LINE}\n    "use strict";\n    source4 = ${literal};\n  }\n};\n`;
}
function writeBundle(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'engine-stub-'));
  roots.push(dir);
  const path = join(dir, 'coreBundle.js');
  writeFileSync(path, content);
  return path;
}
const expectedFor = (content: string): { playwright: string; coreBundleSha256: string } => ({ playwright: '1.63.0', coreBundleSha256: sha(content) });

describe('the pin', () => {
  it('is Playwright 1.63.0 and the recorded bundle digest', () => {
    expect(ENGINE_PIN.playwright).toBe('1.63.0');
    expect(ENGINE_PIN.coreBundleSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(ENGINE_PIN.coreBundleSha256.startsWith('549070af')).toBe(true);
  });

  it('accepts the installed playwright-core and returns the injected script source', () => {
    const source = loadInjectedSource();
    expect(source).toContain('InjectedScript');
    expect(source.length).toBeGreaterThan(100_000);
    expect(loadInjectedSource()).toBe(source);
  });

  it('decodes the real source exactly as an independent regular-expression decoder does', () => {
    const corePackage = join(packageRoot, 'node_modules', 'playwright-core');
    const bundle = readFileSync(join(corePackage, 'lib', 'coreBundle.js'), 'utf8');
    const line = bundle.split('\n').find((candidate) => candidate.trimStart().startsWith("source4 = '"));
    expect(line).toBeDefined();
    const literal = (line ?? '').trim().slice('source4 = '.length, -1);
    const independent = literal.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|[\s\S])/gu, (_match, escape: string) => {
      switch (escape.charAt(0)) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case 'b': return '\b';
        case 'f': return '\f';
        case 'v': return '\v';
        case '0': return '\0';
        case 'x': return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
        case 'u': return escape.charAt(1) === '{' ? String.fromCodePoint(Number.parseInt(escape.slice(2, -1), 16)) : String.fromCharCode(Number.parseInt(escape.slice(1), 16));
        default: return escape;
      }
    });
    expect(decodeJsStringLiteral(literal)).toBe(independent);
    expect(sha(loadInjectedSource())).toBe(sha(independent));
  });
});

describe('decodeJsStringLiteral', () => {
  it.each([
    ["'plain text'", 'plain text'],
    ["'a\\nb\\tc\\rd'", 'a\nb\tc\rd'],
    ["'\\b\\f\\v\\0'", '\b\f\v\0'],
    ["'\\x41\\x7a'", 'Az'],
    ["'\\u00e9\\u20AC'", 'é€'],
    ["'\\u{1F600}'", '😀'],
    ["'\\ud83d\\ude00'", '😀'],
    ["'it\\'s'", "it's"],
    ["'say \\\"hi\\\"'", 'say "hi"'],
    ["'back\\\\slash'", 'back\\slash'],
    ["'\\/ \\$ \\`'", '/ $ `'],
    ["''", ''],
  ])('decodes %s', (literal, expected) => {
    expect(decodeJsStringLiteral(literal)).toBe(expected);
  });

  it.each([
    ['not quoted', 'abc'],
    ['unclosed', "'abc"],
    ['text after the closing quote', "'abc'def"],
    ['early closing quote', "'a'b'"],
    ['dangling backslash', "'abc\\"],
    ['bad hex escape', "'\\xZZ'"],
    ['short unicode escape', "'\\u12'"],
    ['unterminated code point escape', "'\\u{1F600'"],
    ['code point out of range', "'\\u{110000}'"],
    ['legacy octal', "'\\1'"],
    ['nul followed by a digit', "'\\01'"],
    ['empty', ''],
  ])('refuses %s', (_label, literal) => {
    expect(message(() => decodeJsStringLiteral(literal))).toBe('ENGINE_SOURCE_INVALID');
  });

  it('treats a line continuation as nothing', () => {
    expect(decodeJsStringLiteral("'ab\\\ncd'")).toBe('abcd');
  });
});

describe('loadInjectedSourceFrom (the internal seam)', () => {
  const GOOD = stubBundle("'var InjectedScript = 1;\\n'");

  it('loads a stub bundle whose digest and version match the expectation', () => {
    const path = writeBundle(GOOD);
    expect(loadInjectedSourceFrom({ bundlePath: path, version: '1.63.0', expected: expectedFor(GOOD) })).toBe('var InjectedScript = 1;\n');
  });

  it('throws ENGINE_PIN_MISMATCH on every call when one byte of the bundle changed, and never falls back', () => {
    const path = writeBundle(`${GOOD}x`);
    const files = { bundlePath: path, version: '1.63.0', expected: expectedFor(GOOD) };
    for (let call = 0; call < 3; call++) expect(message(() => loadInjectedSourceFrom(files))).toMatch(/^ENGINE_PIN_MISMATCH /u);
  });

  it('throws ENGINE_PIN_MISMATCH for another playwright-core version, and for another pinned digest', () => {
    const path = writeBundle(GOOD);
    expect(message(() => loadInjectedSourceFrom({ bundlePath: path, version: '1.64.0', expected: expectedFor(GOOD) }))).toMatch(/^ENGINE_PIN_MISMATCH playwright-core 1\.64\.0 /u);
    expect(message(() => loadInjectedSourceFrom({ bundlePath: path, version: '1.63.0', expected: { playwright: '1.63.0', coreBundleSha256: 'f'.repeat(64) } }))).toMatch(/^ENGINE_PIN_MISMATCH /u);
    expect(message(() => loadInjectedSourceFrom({ bundlePath: path, version: '1.63.0', expected: { playwright: '1.62.0', coreBundleSha256: sha(GOOD) } }))).toMatch(/^ENGINE_PIN_MISMATCH /u);
  });

  it('does not cache a failure: the same file loads once the expectation is right', () => {
    const path = writeBundle(GOOD);
    expect(message(() => loadInjectedSourceFrom({ bundlePath: path, version: '1.64.0', expected: expectedFor(GOOD) }))).toMatch(/ENGINE_PIN_MISMATCH/u);
    expect(loadInjectedSourceFrom({ bundlePath: path, version: '1.63.0', expected: expectedFor(GOOD) })).toContain('InjectedScript');
  });

  it('keys the success cache by path and digest', () => {
    const path = writeBundle(GOOD);
    const files = { bundlePath: path, version: '1.63.0', expected: expectedFor(GOOD) };
    expect(loadInjectedSourceFrom(files)).toContain('= 1;');
    const next = stubBundle("'var InjectedScript = 2;\\n'");
    writeFileSync(path, next);
    expect(loadInjectedSourceFrom({ ...files, expected: expectedFor(next) })).toContain('= 2;');
    // the old digest no longer matches the file, and the cache does not hide that
    expect(message(() => loadInjectedSourceFrom(files))).toMatch(/ENGINE_PIN_MISMATCH/u);
  });

  it('refuses a bundle without the marker or the assignment (ENGINE_SOURCE_NOT_FOUND)', () => {
    const none = '// nothing here\n';
    expect(message(() => loadInjectedSourceFrom({ bundlePath: writeBundle(none), version: '1.63.0', expected: expectedFor(none) }))).toBe('ENGINE_SOURCE_NOT_FOUND');
    const noAssignment = `// x\n${MARKER_LINE}\n    "use strict";\n    other = 1;\n`;
    expect(message(() => loadInjectedSourceFrom({ bundlePath: writeBundle(noAssignment), version: '1.63.0', expected: expectedFor(noAssignment) }))).toBe('ENGINE_SOURCE_NOT_FOUND');
  });

  it('refuses an assignment that does not close on its line, or a source that is not the injected script', () => {
    const open = `// x\n${MARKER_LINE}\n    source4 = 'abc\n`;
    expect(message(() => loadInjectedSourceFrom({ bundlePath: writeBundle(open), version: '1.63.0', expected: expectedFor(open) }))).toBe('ENGINE_SOURCE_INVALID');
    const other = stubBundle("'var Something = 1;'");
    expect(message(() => loadInjectedSourceFrom({ bundlePath: writeBundle(other), version: '1.63.0', expected: expectedFor(other) }))).toBe('ENGINE_SOURCE_INVALID');
    const trailing = `// x\n${MARKER_LINE}\n    source4 = 'InjectedScript' + 1;\n`;
    expect(message(() => loadInjectedSourceFrom({ bundlePath: writeBundle(trailing), version: '1.63.0', expected: expectedFor(trailing) }))).toBe('ENGINE_SOURCE_INVALID');
  });
});

describe('engineExpression', () => {
  it('wraps the source in an expression that instantiates InjectedScript with the pinned options, with no evaluation helper', () => {
    const expression = engineExpression('/* source */', 'data-qa');
    expect(expression.startsWith('(() => { const module = {}; /* source */')).toBe(true);
    expect(expression).toContain('new (module.exports.InjectedScript())(globalThis,');
    expect(expression).toContain('"testIdAttributeName":"data-qa"');
    expect(expression).toContain('"browserName":"chromium"');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Fake CDP.

interface Call {
  method: string;
  params: Record<string, unknown> | undefined;
}
class FakeCdp implements CdpSession {
  readonly calls: Call[] = [];
  constructor(private readonly handler: (method: string, params: Record<string, unknown> | undefined) => unknown) {}
  send(method: string, params?: object): Promise<unknown> {
    const record = params as Record<string, unknown> | undefined;
    this.calls.push({ method, params: record });
    try {
      return Promise.resolve(this.handler(method, record));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
const engineOn = (cdp: CdpSession): PerceptionEngine => ({ cdp, worldId: 7, objectId: 'engine-1' });
const ok = (value: unknown): unknown => ({ result: { type: 'object', value } });

describe('openEngine', () => {
  const script = (method: string): unknown => {
    switch (method) {
      case 'Page.getFrameTree': return { frameTree: { frame: { id: 'frame-1' } } };
      case 'Page.createIsolatedWorld': return { executionContextId: 42 };
      case 'Runtime.evaluate': return { result: { objectId: 'engine-obj' } };
      default: return {};
    }
  };

  it('creates a private isolated world and instantiates the pinned engine in it', async () => {
    const cdp = new FakeCdp((method) => script(method));
    const engine = await openEngine(cdp, { worldName: 'w' });
    expect(engine).toEqual({ cdp, worldId: 42, objectId: 'engine-obj' });
    const methods = cdp.calls.map((call) => call.method);
    expect(methods).toEqual(['DOM.enable', 'Runtime.enable', 'Page.getFrameTree', 'Page.createIsolatedWorld', 'Runtime.evaluate']);
    expect(cdp.calls[3]?.params).toMatchObject({ frameId: 'frame-1', worldName: 'w', grantUniveralAccess: false });
    expect(cdp.calls[4]?.params).toMatchObject({ contextId: 42, returnByValue: false, awaitPromise: true });
    expect(String(cdp.calls[4]?.params?.expression)).toContain('new (module.exports.InjectedScript())');
  });

  it('turns every CDP failure into the closed code, never carrying CDP or page text', async () => {
    const throwing = new FakeCdp(() => { throw new Error('SECRET_PAGE_TEXT'); });
    expect(await rejection(openEngine(throwing))).toBe('PERCEPTION_UNAVAILABLE');
    const exception = new FakeCdp((method) => (method === 'Runtime.evaluate' ? { exceptionDetails: { text: 'SECRET_PAGE_TEXT' } } : script(method)));
    expect(await rejection(openEngine(exception))).toBe('PERCEPTION_UNAVAILABLE');
    const noFrame = new FakeCdp((method) => (method === 'Page.getFrameTree' ? { frameTree: {} } : script(method)));
    expect(await rejection(openEngine(noFrame))).toBe('PERCEPTION_UNAVAILABLE');
    const noWorld = new FakeCdp((method) => (method === 'Page.createIsolatedWorld' ? {} : script(method)));
    expect(await rejection(openEngine(noWorld))).toBe('PERCEPTION_UNAVAILABLE');
    const noObject = new FakeCdp((method) => (method === 'Runtime.evaluate' ? { result: {} } : script(method)));
    expect(await rejection(openEngine(noObject))).toBe('PERCEPTION_UNAVAILABLE');
    const notAnObject = new FakeCdp(() => 'text');
    expect(await rejection(openEngine(notAnObject))).toBe('PERCEPTION_UNAVAILABLE');
  });
});

describe('page programs on the engine', () => {
  it('runOnEngine sends the program text to the engine object and returns its value', async () => {
    const cdp = new FakeCdp(() => ok([{ count: 1, index: 0 }]));
    const value = await runOnEngine(engineOn(cdp), resolveRefs, [['e1']]);
    expect(value).toEqual([{ count: 1, index: 0 }]);
    expect(cdp.calls[0]).toMatchObject({ method: 'Runtime.callFunctionOn', params: { objectId: 'engine-1', functionDeclaration: resolveRefs.toString(), arguments: [{ value: ['e1'] }], returnByValue: true } });
  });

  it('backendNodeIdsFor resolves refs to backend ids through a remote array, in chunks, and releases it', async () => {
    const cdp = new FakeCdp((method, params) => {
      switch (method) {
        case 'Runtime.callFunctionOn': return { result: { objectId: 'array-1' } };
        case 'Runtime.getProperties': return { result: [{ name: '0', value: { objectId: 'el-0' } }, { name: '2', value: { objectId: 'el-2' } }, { name: 'length', value: {} }] };
        case 'DOM.describeNode': return { node: { backendNodeId: params?.objectId === 'el-0' ? 100 : 102 } };
        default: return {};
      }
    });
    expect(await backendNodeIdsFor(engineOn(cdp), ['e1', 'e2', 'e3'])).toEqual({ e1: 100, e3: 102 });
    expect(cdp.calls.some((call) => call.method === 'Runtime.releaseObject' && call.params?.objectId === 'array-1')).toBe(true);
    expect(await backendNodeIdsFor(engineOn(cdp), [])).toEqual({});
  });

  it('backendNodeIdsFor drops an element that vanished and survives a failed release', async () => {
    const cdp = new FakeCdp((method, params) => {
      switch (method) {
        case 'Runtime.callFunctionOn': return { result: { objectId: 'array-1' } };
        case 'Runtime.getProperties': return { result: [{ name: '0', value: { objectId: 'el-0' } }, { name: '1', value: { objectId: 'el-1' } }] };
        case 'DOM.describeNode':
          if (params?.objectId === 'el-1') throw new Error('gone');
          return { node: { backendNodeId: 5 } };
        case 'Runtime.releaseObject': throw new Error('already released');
        default: return {};
      }
    });
    expect(await backendNodeIdsFor(engineOn(cdp), ['e1', 'e2'])).toEqual({ e1: 5 });
  });

});
