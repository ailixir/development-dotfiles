/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream A: arms A0, A1, S1, S2 on live pages (real Chromium, the production collector, Playwright's own engine).
 * Needs a browser, so it runs only with SPK07_LIVE=1. No model call is made here.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Page { setContent(html: string): Promise<void>; context(): unknown; getByRole(role: string, options: { name: string; exact: boolean }): unknown }
interface Browser { newPage(): Promise<Page>; close(): Promise<void> }
interface Observed {
  payload: unknown; idMap: Record<string, number | null>; meta: Record<string, unknown>; dispose(): Promise<void>; internal: { observation: { nodes: { nodeId: string; name: string; role: string; locatorHints: object[] }[] } };
}
interface Interpreted { status: string; pickedId: string | null; pickedBackendNodeId: number | null; locator: object | null; locatorTier: string | null; executable: boolean; gateCodes: string[] }
interface Arm { id: string; observe(a: { page: Page; cdp: unknown; task: object; step: object }): Promise<Observed>; interpret(a: { page: Page; cdp: unknown; reply: object; observed: Observed; task: object; step: object }): Promise<Interpreted>; buildRequest(a: object): { contents: { parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] } } }
interface Cdp { session(page: Page): Promise<{ send(m: string, p?: object): Promise<{ result: { value: string } }> }>; locatorIds(page: Page, cdp: unknown, locator: unknown): Promise<number[]> }
interface Requests { stubCursor(task: object, step: object): object }

const live = process.env.SPK07_LIVE === '1';
describe.skipIf(!live)('arms on live pages (SPK07_LIVE=1)', () => {
  const lib = new URL('../../evaluation/grounding/lib/', import.meta.url);
  const task = { id: 't', steps: [{ text: 'Click the "Reject additional cookies" button', operation: { kind: 'click' } }] };
  const step = task.steps[0] as object;
  const armOf = (arms: Record<string, Arm>, id: string): Arm => { const found = arms[id]; if (!found) throw new Error(`no arm ${id}`); return found; };
  const reject = (nodes: Observed['internal']['observation']['nodes']) => nodes.find(n => n.name === 'Reject additional cookies');

  async function setup(html: string) {
    const playwright = createRequire(new URL('../../package.json', import.meta.url))('playwright') as { chromium: { launch(o: object): Promise<Browser> } };
    const cdpModule = (await import(new URL('cdp.mjs', lib).href)) as Cdp;
    const requests = (await import(new URL('requests.mjs', lib).href)) as Requests;
    const arms: Record<string, Arm> = {};
    for (const id of ['A0', 'A1', 'S1', 'S2']) arms[id] = await import(new URL(`arms/${id}.mjs`, lib).href) as Arm;
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html);
    const cdp = await cdpModule.session(page);
    const domHash = async () => createHash('sha256').update((await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })).result.value).digest('hex');
    return { browser, page, cdp, arms, cdpModule, requests, domHash };
  }
  const replyFor = (nodeId: string, locator: object) => ({ schemaVersion: 3, kind: 'NEXT_ACTION', requestId: 'r', status: 'ACTION', obligationId: 'o', action: { target: { nodeId, locator }, operation: { kind: 'click' } }, question: null });

  it('R4 blocker page: the collector refuses what the Playwright engine proves unique (A1/S1 not executable, S2 executable)', async () => {
    const { browser, page, cdp, arms, cdpModule, requests, domHash } = await setup('<h1>Hi</h1><button>Reject additional cookies</button><button aria-label="Close dialog">X</button><button><svg width=8 height=8></svg></button><table><tr><td>username:</td><td><input name=a></td></tr></table>');
    const before = await domHash();
    const outcome: Record<string, { executable: boolean; sameElement: boolean; extra: unknown }> = {};
    for (const id of ['A0', 'A1', 'S1', 'S2']) {
      const current = armOf(arms, id);
      const observed = await current.observe({ page, cdp, task, step });
      const node = reject(observed.internal.observation.nodes);
      expect(node, id).toBeDefined();
      const reply = replyFor(node?.nodeId ?? '', node?.locatorHints[0] ?? {});
      const interpreted = await current.interpret({ page, cdp, reply, observed, task, step });
      const [independent] = await cdpModule.locatorIds(page, cdp, page.getByRole('button', { name: 'Reject additional cookies', exact: true }));
      outcome[id] = { executable: interpreted.executable, sameElement: interpreted.pickedBackendNodeId === independent, extra: observed.meta.extraNodes };
      expect(interpreted).toMatchObject({ status: 'ACTION', locatorTier: 'role' });
      expect(observed.meta).toMatchObject({ admittedUnderProductionLimits: true, gatewayInputAdmitted: true, emptied: false });
      const body = current.buildRequest({ task, step, obligations: requests.stubCursor(task, step), observed, attempt: 1, repairCodes: [] });
      const envelope = JSON.parse(body.contents[0]?.parts[0]?.text ?? '{}') as { context: { observation: unknown } };
      expect(typeof envelope.context.observation).toBe(id === 'S1' || id === 'S2' ? 'string' : 'object');
      expect(body.systemInstruction.parts[0]?.text.includes('text outline')).toBe(id === 'S1' || id === 'S2');
      await observed.dispose();
    }
    expect(await domHash()).toBe(before); // no page-visible DOM mutation from any arm
    for (const id of ['A0', 'A1', 'S1', 'S2']) expect(outcome[id]?.sameElement, id).toBe(true); // identity is by backendNodeId and agrees with Playwright
    expect(outcome.A1?.executable).toBe(false); expect(outcome.S1?.executable).toBe(false); expect(outcome.A0?.executable).toBe(false);
    expect(outcome.S2?.executable).toBe(true);
    expect(outcome.S2?.extra).toBeGreaterThanOrEqual(2); // the unnamed button and the table-labelled input are awareness-only extras
    await browser.close();
  }, 60_000);

  it('S2 refuses a pick whose locator is unique but belongs to a different element', async () => {
    const { browser, page, cdp, arms } = await setup('<button>Alpha</button><button>Beta</button>');
    const arm = armOf(arms, 'S2');
    const observed = await arm.observe({ page, cdp, task, step });
    const nodes = observed.internal.observation.nodes;
    const alpha = nodes.find(n => n.name === 'Alpha'); const beta = nodes.find(n => n.name === 'Beta');
    const interpreted = await arm.interpret({ page, cdp, reply: replyFor(alpha?.nodeId ?? '', beta?.locatorHints[0] ?? {}), observed, task, step });
    expect(interpreted.executable).toBe(false);
    expect(interpreted.gateCodes).toContain('ENGINE_WRONG_ELEMENT');
    const unknown = await arm.interpret({ page, cdp, reply: replyFor('node-9-999', beta?.locatorHints[0] ?? {}), observed, task, step });
    expect(unknown).toMatchObject({ status: 'INVALID', executable: false });
    await observed.dispose(); await browser.close();
  }, 60_000);

  it('A0 empties over the production budget (no model call), A1 keeps the page but is not admitted under production limits', async () => {
    const { browser, page, cdp, arms } = await setup(`<h1>Big</h1>${Array.from({ length: 700 }, (_, i) => `<button>Item ${String(i)}</button>`).join('')}<button>Reject additional cookies</button>`);
    const a0 = await armOf(arms, 'A0').observe({ page, cdp, task, step });
    expect(a0.meta).toMatchObject({ emptied: true, nodes: 0 });
    const a1 = await armOf(arms, 'A1').observe({ page, cdp, task, step });
    expect(a1.meta).toMatchObject({ emptied: false, admittedUnderProductionLimits: false });
    expect(Number(a1.meta.nodes)).toBeGreaterThan(500);
    const s1 = await armOf(arms, 'S1').observe({ page, cdp, task, step });
    expect(Number(s1.meta.bytes)).toBeLessThan(Number(s1.meta.jsonBytes) / 3);
    for (const observed of [a0, a1, s1]) await observed.dispose();
    await browser.close();
  }, 120_000);
});
