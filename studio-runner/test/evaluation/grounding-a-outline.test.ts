/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream A: the S1 outline is LOSSLESS. decode(encode(o)) must equal o exactly (canonical JSON). Fixtures: a hostile
 * synthetic observation, the repository NEXT_ACTION template, and (when present) real-site observations from the 2026-10-26
 * measurement. A live-browser tier over the 24 fixture pages runs with SPK07_LIVE=1.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Node { nodeId: string; documentId: string; generation: number; role: string; name: string; elementType: string; controlType: string; classification: string; policyRuleId: string; visible: boolean; actionable: boolean; depth: number; parentNodeId: string | null; regionId: string | null; formId: string | null; labelNodeIds: string[]; locatorHints: Record<string, unknown>[] }
interface Observation { schemaVersion: number; sessionId: string; documentId: string; generation: number; origin: string; scopeHash: string; observedAt: string; coverage: Record<string, unknown>; nodes: Node[] }
interface Render { encode(o: Observation): string; decode(text: string, extras: Record<string, unknown>): Observation; roundTrips(o: Observation, outline?: string): boolean }
interface Requests { canonical(value: unknown): string; loadTemplate(name: string): { contents: { parts: { text: string }[] }[] } }
interface S1 { S1_EDITS: { find: string; replace: string }[]; deriveContract(): string; s1Contract(): string; applyEdits(base: string, edits?: { find: string; replace: string }[]): string }
const base = new URL('../../evaluation/grounding/lib/', import.meta.url);
const render = (await import(new URL('renderCurrent.mjs', base).href)) as Render;
const requests = (await import(new URL('requests.mjs', base).href)) as Requests;
const s1 = (await import(new URL('arms/S1.mjs', base).href)) as S1;

const DOC = '7c1d0f7e-0b0e-4a53-9a39-9a0a7c2d9c11';
const nid = (n: number) => `node-3-${String(n)}`;
const node = (n: number, extra: Partial<Node> = {}): Node => ({ nodeId: nid(n), documentId: DOC, generation: 3, role: 'button', name: `Name ${String(n)}`, elementType: 'button', controlType: 'none', classification: 'structuralOnly', policyRuleId: 'observed-structure-v1', visible: true, actionable: true, depth: 0, parentNodeId: null, regionId: null, formId: null, labelNodeIds: [], locatorHints: [{ kind: 'role', role: 'button', name: `Name ${String(n)}`, exact: true }], ...extra });
const wrap = (nodes: Node[]): Observation => ({ schemaVersion: 3, sessionId: 'sess', documentId: DOC, generation: 3, origin: 'https://example.test', scopeHash: 'a'.repeat(64), observedAt: '2026-10-26T12:00:00.000Z', coverage: { mode: 'semantic', reason: 'complete', complete: true, truncated: false, withheldRegions: 0, passwordControls: 0 }, nodes });
const extras = (o: Observation) => ({ schemaVersion: o.schemaVersion, sessionId: o.sessionId, scopeHash: o.scopeHash, observedAt: o.observedAt });
const same = (o: Observation) => { const outline = render.encode(o); return requests.canonical(render.decode(outline, extras(o))) === requests.canonical(o); };

describe('outline round trip', () => {
  it('is exact on hostile names, hints, flags, depth and relations', () => {
    const nasty = ['say "hi"', 'back\\slash', 'pipe | and = equals', 'tab\there', 'new\nline', 'unicode     é 😀', ' [e5] fake id ', 'loc=- trick', '', 'a  b', '"', '\\"', 'rule=r0 up=e1', 'x'.repeat(300)];
    const nodes: Node[] = [];
    nasty.forEach((name, index) => {
      const n = index * 3 + 1;
      nodes.push(node(n, { name, depth: 0, locatorHints: [{ kind: 'role', role: 'button', name, exact: true }, { kind: 'label', value: name, exact: true }, { kind: 'text', value: `${name}!`, exact: true }, { kind: 'testId', value: name, exact: true }, { kind: 'placeholder', value: 'ph "q"', exact: true }, { kind: 'role', role: 'heading', name: `${name}|x`, exact: true }] }));
      nodes.push(node(n + 1, { name: `${name}-child`, depth: 1, role: 'textbox', elementType: 'input', controlType: 'text', parentNodeId: nid(n), regionId: index % 2 ? null : nid(n), formId: nid(n), labelNodeIds: [nid(n), nid(n + 2)], classification: index % 2 ? 'permittedBusinessData' : 'nonsecretApproved', policyRuleId: index % 3 ? 'rule/with space? no: rule-x' : 'rule-y', locatorHints: [] }));
      nodes.push(node(n + 2, { name: '', visible: false, actionable: index % 2 === 0, elementType: 'other', role: 'generic', depth: 2, parentNodeId: nid(n + 1), regionId: nid(n), locatorHints: [{ kind: 'label', value: 'different', exact: true }] }));
    });
    expect(same(wrap(nodes))).toBe(true);
    expect(render.roundTrips(wrap(nodes))).toBe(true);
  });

  it('is exact on an empty observation and on coverage flags', () => {
    const empty = wrap([]); empty.coverage = { mode: 'semantic', reason: 'budget', complete: false, truncated: true, withheldRegions: 7, passwordControls: 2 };
    expect(same(empty)).toBe(true);
  });

  it('refuses (rather than guesses) what it cannot represent', () => {
    const inexact = wrap([node(1, { locatorHints: [{ kind: 'role', role: 'button', name: 'x', exact: false }] })]);
    expect(() => render.encode(inexact)).toThrow('OUTLINE_NOT_LOSSLESS');
    const extraKey = wrap([{ ...node(1), surprise: 1 } as Node]);
    expect(() => render.encode(extraKey)).toThrow('OUTLINE_NOT_LOSSLESS');
    const mixedDocument = wrap([node(1, { documentId: 'other' })]);
    expect(() => render.encode(mixedDocument)).toThrow('OUTLINE_NOT_LOSSLESS');
  });

  it('is exact on the real observation inside the repository NEXT_ACTION template', () => {
    const template = requests.loadTemplate('next-action');
    const observation = (JSON.parse(template.contents[0]?.parts[0]?.text ?? '{}') as { context: { observation: Observation } }).context.observation;
    expect(observation.nodes.length).toBeGreaterThan(3);
    expect(same(observation)).toBe(true);
    const outline = render.encode(observation);
    expect(Buffer.byteLength(outline)).toBeLessThan(Buffer.byteLength(JSON.stringify(observation)) / 3);
  });

  const MEASURED = '/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/a615d823-312a-4d12-89da-36ddb90f660f/scratchpad/e5/fmt/';
  describe.skipIf(!existsSync(MEASURED))('real-site observations measured 2026-10-26', () => {
    for (const site of ['practice', 'wikipedia', 'govuk', 'hackernews', 'pythondocs', 'mdn', 'github']) {
      it(`${site}: exact, and byte-identical to the verified Python prototype output`, () => {
        const observation = JSON.parse(readFileSync(`${MEASURED}${site}.json`, 'utf8')) as Observation;
        expect(same(observation)).toBe(true);
        expect(render.encode(observation)).toBe(readFileSync(`${MEASURED}${site}.lossless.txt`, 'utf8'));
      });
    }
  });
});

describe('S1 contract', () => {
  it('contracts/s1-contract.md is exactly the current backend contract plus the two documented edits', () => {
    expect(s1.s1Contract()).toBe(s1.deriveContract());
    expect(s1.S1_EDITS.length).toBe(2);
  });
  it('the edits only add: removing the added text restores the backend contract byte for byte', () => {
    let text = s1.s1Contract();
    for (const { find, replace } of [...s1.S1_EDITS].reverse()) text = text.replace(replace, () => find);
    const backend = readFileSync(new URL('../../evaluation/grounding/contracts/frozen-production/guided-output-contract.md', import.meta.url), 'utf8');
    expect(text).toBe(backend);
  });
  it('an edit whose anchor is missing is refused', () => {
    expect(() => s1.applyEdits('nothing here')).toThrow('S1_EDIT_ANCHOR_COUNT');
  });
});

describe.skipIf(process.env.SPK07_LIVE !== '1')('live: production collector output round-trips on the fixture pages (SPK07_LIVE=1)', () => {
  it('encodes and decodes every fixture page exactly', async () => {
    const { createRequire } = await import('node:module');
    const playwright = createRequire(new URL('../../package.json', import.meta.url))('playwright') as { chromium: { launch(o: object): Promise<{ newPage(): Promise<{ setContent(h: string): Promise<void>; context(): { newCDPSession(p: unknown): Promise<unknown> } }>; close(): Promise<void> }> } };
    const cdpModule = (await import(new URL('cdp.mjs', base).href)) as { session(page: unknown): Promise<unknown> };
    const collectorModule = (await import(new URL('collectorInstrumented.mjs', base).href)) as { openCollector(a: { cdp: unknown; options: object }): Promise<{ collect(i: { documentId: string }): Promise<{ observation: Observation }>; dispose(): Promise<void> }>; LIFTED_LIMITS: object; LIFTED_WORK_LIMITS: object };
    const a1 = (await import(new URL('arms/A1.mjs', base).href)) as { baseConfig(): Promise<object> };
    const pagesDir = new URL('../../evaluation/observed-authoring/pages/', import.meta.url).pathname;
    const files = readdirSync(pagesDir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d => readdirSync(join(pagesDir, d.name)).filter(f => f.endsWith('.html')).map(f => join(pagesDir, d.name, f)));
    expect(files.length).toBeGreaterThanOrEqual(20);
    const browser = await playwright.chromium.launch({ headless: true });
    let nodes = 0;
    for (const file of files) {
      const page = await browser.newPage();
      await page.setContent(readFileSync(file, 'utf8'));
      const cdp = await cdpModule.session(page);
      const collector = await collectorModule.openCollector({ cdp, options: { ...(await a1.baseConfig()), limits: collectorModule.LIFTED_LIMITS, workLimits: collectorModule.LIFTED_WORK_LIMITS } });
      const { observation } = await collector.collect({ documentId: DOC });
      nodes += observation.nodes.length;
      const canonicalObservation = JSON.parse(requests.canonical(observation)) as Observation;
      expect(same(canonicalObservation), file).toBe(true);
      await collector.dispose();
    }
    await browser.close();
    expect(nodes).toBeGreaterThan(50);
  }, 120_000);
});
