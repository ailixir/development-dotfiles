/**
 * SC008-E1 (S-1 as permanent tests, AC3 and the live parts of AC4 and AC6): runStep against real Chromium on local data: and
 * about:blank pages. Playwright's own expect is injected; nothing here reaches a network host.
 */
import type { InvocationControl } from '../../../src/executor/observedReplay.js';
import { hashObserved, ObservedRefusal, type ObservedErrorCode } from '../../../src/validator/observedReferencePolicy.js';
import { runStep, type StepResult, type StepRun } from '../../../src/run/stepCode.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- Real Chromium for the perception tier; the production import stays in src/run/browser.ts only.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { expect as pwExpect } from 'playwright/test';

import { guardDist, launchChromium } from './harness.js';

guardDist();

const HTML = `<title>T1</title>
<button id="save" onclick="document.getElementById('o').textContent='saved'">Save changes</button>
<button>Cancel</button><button>Save draft</button>
<button id="open" onclick="window.open('about:blank')">Open</button>
<div id="o">idle</div>`;
const PAGE = `data:text/html,${encodeURIComponent(HTML)}`;

class Control implements InvocationControl {
  phase: InvocationControl['phase'] = 'PREPARING';
  readonly deadlineMs: number;
  begun = 0;
  failure: ObservedErrorCode | null = null;
  private readonly abort = new AbortController();
  constructor(budgetMs: number) { this.deadlineMs = Date.now() + budgetMs; }
  get signal(): AbortSignal { return this.abort.signal; }
  remainingMs(): number { return Math.max(0, this.deadlineMs - Date.now()); }
  check(): void {
    if (this.failure === null && Date.now() >= this.deadlineMs) this.poison('TIMEOUT');
    if (this.failure !== null) throw new ObservedRefusal(this.failure);
  }
  beginInvocation(): void { this.check(); this.phase = 'INVOKING'; this.begun += 1; }
  poison(reason: 'TIMEOUT' | 'CANCELLED'): void {
    this.failure = reason === 'TIMEOUT' && this.phase === 'INVOKING' ? 'OUTCOME_UNKNOWN' : reason;
    this.phase = 'POISONED';
    this.abort.abort();
  }
}

let browser: Browser;
let context: BrowserContext;
let page: Page;
let unhandled = 0;
const onUnhandled = (): void => { unhandled += 1; };

beforeAll(async () => { browser = await launchChromium(); });
afterAll(async () => { await browser.close(); });
beforeEach(async () => {
  unhandled = 0;
  process.on('unhandledRejection', onUnhandled);
  context = await browser.newContext();
  page = await context.newPage();
  await page.goto(PAGE);
});
afterEach(async () => { process.off('unhandledRejection', onUnhandled); await context.close(); });

const frozen = (code: string): { stepId: string; code: string; sourceHash: string } => ({ stepId: 's', code, sourceHash: hashObserved(code) });
function go(code: string, budgetMs = 8000, overrides: Partial<StepRun> = {}): Promise<StepResult & { control: Control }> {
  const control = new Control(budgetMs);
  return runStep(frozen(code), { page, context, expect: pwExpect, inputs: {}, secrets: {}, vars: {}, control, allowedDomains: ['*'], ...overrides }).then(result => ({ ...result, control }));
}

describe('S-1 and AC3: execution with Playwright\'s own expect', () => {
  it('runs regex locators and expect on wrapped locators and pages', async () => {
    const result = await go(`
      await page.getByRole('button', { name: /^save changes$/i }).click();
      await expect(page.getByText(/^saved$/)).toBeVisible();
      await expect(page).toHaveTitle('T1');
      await expect(page).toHaveURL(/^data:/);
      vars.count = await page.getByRole('button', { name: /save/i }).count();
    `);
    expect(result.ok).toBe(true);
    expect(result.vars.count).toBe(2);
    expect(result.effects).toEqual([{ method: 'click', completed: true }]);
    expect(result.fenceCrossed).toBe(true);
  });

  it('ends ASSERTION_FAILED on a failing expect, whatever came before', async () => {
    const result = await go("await expect(page.locator('#o')).toHaveText('nope', { timeout: 300 });");
    expect(result.closedCode).toBe('ASSERTION_FAILED');
    expect(result.fenceCrossed).toBe(false);
    expect(JSON.stringify(result)).not.toContain('idle'); // the matcher's received text never leaves
  });

  it('a floated failing expect, expect.not and expect.poll each fail the step and kill nothing', async () => {
    for (const code of [
      "expect(page.locator('#o')).toHaveText('nope', { timeout: 200 });",
      "expect(page.locator('#o')).not.toHaveText('idle', { timeout: 200 });",
      "expect.poll(() => 1, { timeout: 200 }).toBe(2);",
    ]) {
      const result = await go(`${code} await page.title();`);
      expect(result.closedCode, code).toBe('ASSERTION_FAILED');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(unhandled).toBe(0);
  });

  it('does not fail a step on a rejection the code awaited and caught', async () => {
    const result = await go(`
      try { await expect(page.locator('#o')).toHaveText('nope', { timeout: 200 }); } catch { vars.caught = true; }
      await expect(page.locator('#o')).toBeHidden({ timeout: 200 }).catch(() => { vars.chained = true; });
    `);
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ caught: true, chained: true });
  });
});

describe('AC6 (live): absent elements, strictness and time', () => {
  it('expect on an absent element with toBeHidden, toHaveCount(0) and not.toBeVisible passes without crossing the fence', async () => {
    const result = await go(`
      const gone = page.getByText('Error: nothing like this');
      await expect(gone).toBeHidden();
      await expect(gone).toHaveCount(0);
      await expect(gone).not.toBeVisible();
      await expect(gone).not.toBeAttached();
    `);
    expect(result.ok).toBe(true);
    expect(result.fenceCrossed).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.control.begun).toBe(0);
  });

  it('count, isVisible and waitFor hidden on an absent element do not end TARGET_DRIFT', async () => {
    const result = await go(`
      const gone = page.getByText('Error: nothing like this');
      vars.count = await gone.count();
      vars.visible = await gone.isVisible();
      await gone.waitFor({ state: 'hidden' });
    `);
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ count: 0, visible: false });
    expect(result.fenceCrossed).toBe(false);
  });

  it('several matches end TARGET_DRIFT before the fence and click nothing', async () => {
    const result = await go("await page.getByRole('button', { name: /save/i }).click();");
    expect(result.closedCode).toBe('TARGET_DRIFT');
    expect(result.fenceCrossed).toBe(false);
    expect(result.effects).toEqual([]);
    expect(await page.locator('#o').textContent()).toBe('idle');
    expect(JSON.stringify(result)).not.toContain('strict mode');
  });

  it('until-fence mode stops before the click, and a miss reports its match count', async () => {
    const stopped = await go("await page.getByRole('button', { name: /^save changes$/i }).click();", 8000, { untilFence: true });
    expect(stopped).toMatchObject({ ok: true, fenceReached: true, fenceCrossed: false, effects: [] });
    expect(await page.locator('#o').textContent()).toBe('idle');
    const several = await go("await page.getByRole('button', { name: /save/i }).click();");
    expect(several).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 2 });
    const none = await go("await page.getByRole('button', { name: /zzz/ }).click();", 1200);
    expect(none).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 0 });
  });

  it('no match ends TARGET_DRIFT at the step budget, not after Playwright\'s 30 s', async () => {
    const started = Date.now();
    const result = await go("await page.getByRole('button', { name: /zzz/ }).click();", 1200);
    expect(result.closedCode).toBe('TARGET_DRIFT');
    expect(result.fenceCrossed).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('expect(fn).toPass() with no timeout ends at the step budget', async () => {
    const started = Date.now();
    const result = await go("await expect(async () => { await expect(page.locator('#o')).toHaveText('never', { timeout: 100 }); }).toPass();", 1500);
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(6000);
  });

  it('page.setDefaultTimeout(0) cannot make a later call unbounded', async () => {
    const started = Date.now();
    const result = await go("page.setDefaultTimeout(0); await page.getByText('zzz-never').waitFor({ state: 'attached' });", 1200);
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('AC4 (live): denial, popups and revocation', () => {
  it('refuses page.close() and page.video() and leaves the page open', async () => {
    expect((await go('await page.close();')).closedCode).toBe('POLICY_REFUSED');
    expect((await go('page.video();')).closedCode).toBe('POLICY_REFUSED');
    expect((await go('await context.newPage();')).closedCode).toBe('POLICY_REFUSED');
    expect((await go('await page.locator("a").page().context().close();')).closedCode).toBe('POLICY_REFUSED');
    expect(page.isClosed()).toBe(false);
    expect(context.pages()).toHaveLength(1);
  });

  it('adopts an awaited popup, acts in it as offscreen, and a later step reaches it through vars', async () => {
    const adopted: object[] = [];
    const vars: Record<string, unknown> = {};
    const first = await go(`
      const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#open').click()]);
      vars.popup = popup;
      await popup.setContent('<title>pop</title><button>In popup</button>');
      await popup.getByRole('button', { name: 'In popup' }).click();
    `, 8000, { vars, adoptPage: p => adopted.push(p) });
    expect(first.ok).toBe(true);
    expect(adopted).toHaveLength(1);
    expect(first.offscreen).toBe(true);
    expect(first.effects.map(e => e.offscreen === true)).toEqual([false, true, true]); // opener click, then setContent and click in the popup
    const second = await go("vars.title = await vars.popup.title(); await expect(vars.popup).toHaveTitle('pop'); vars.pages = context.pages().length;", 8000, { vars, pages: adopted });
    expect(second.ok).toBe(true);
    expect(vars.title).toBe('pop');
    expect(vars.pages).toBe(2);
    expect((await go('await vars.popup.close();', 8000, { vars })).closedCode).toBe('POLICY_REFUSED');
  });

  it('refuses goto to a host off the list before any request', async () => {
    const requests: string[] = [];
    context.on('request', request => requests.push(request.url()));
    const result = await go("await page.goto('https://evil.test/');", 8000, { allowedDomains: ['example.com'] });
    expect(result.closedCode).toBe('POLICY_REFUSED');
    expect(requests).toEqual([]);
  });

  it('revokes the binding when the step ends: a late timer cannot click', async () => {
    const vars: Record<string, unknown> = {};
    const result = await go("setTimeout(async () => { try { await page.locator('#save').click(); } catch (e) { vars.late = e.message; } }, 150);", 8000, { vars });
    expect(result.ok).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(vars.late).toBe('CANCELLED');
    expect(await page.locator('#o').textContent()).toBe('idle');
  });
});

/**
 * SC008-FIX-19 (RCA B1/B2): a strict-mode violation inside a matcher. A POSITIVE check of presence is a drift (the locator is ambiguous, the model is
 * asked again); a negated or hidden/absent check stays ASSERTION_FAILED, because a repair of it (first(), a filter) could pass while a second element is shown.
 */
describe('a matcher on a locator that matches two elements', () => {
  const TWO = `data:text/html,${encodeURIComponent('<p>Hello there</p><p style="display:none">Hello there</p><button>Go</button>')}`;
  const REPEATS = 5;
  const run = async (code: string): Promise<StepResult & { control: Control }> => { await page.goto(TWO); return go(code); };

  it('positive toBeVisible ends TARGET_DRIFT with the match count, every time, before the fence', async () => {
    let drift = 0;
    const seen: string[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const result = await run("await expect(page.getByText('Hello there')).toBeVisible({ timeout: 500 });");
      seen.push(`${String(result.closedCode)}:${String(result.matchCount)}`);
      if (result.closedCode === 'TARGET_DRIFT' && result.matchCount === 2 && !result.fenceCrossed) drift++;
      expect(JSON.stringify(result)).not.toContain('strict mode');
    }
    console.log(`FIX19 strict positive: ${String(drift)} of ${String(REPEATS)} ${seen.join(',')}`);
    expect(drift).toBe(REPEATS);
  });

  it.each([
    ["negated toBeVisible", "await expect(page.getByText('Hello there')).not.toBeVisible({ timeout: 500 });"],
    ["negated toContainText", "await expect(page.getByText('Hello there')).not.toContainText('Hello', { timeout: 500 });"],
    ["toBeHidden", "await expect(page.getByText('Hello there')).toBeHidden({ timeout: 500 });"],
    ["toBeVisible({ visible: false })", "await expect(page.getByText('Hello there')).toBeVisible({ visible: false, timeout: 500 });"],
    ["toHaveText with an empty string", "await expect(page.getByText('Hello there')).toHaveText('', { timeout: 500 });"],
    ["toContainText with a regex that matches empty text", "await expect(page.getByText('Hello there')).toContainText(/^$/, { timeout: 500 });"],
    ["toContainText with a negative lookahead", "await expect(page.getByText('Hello there')).toContainText(/^(?!zzz)/, { timeout: 500 });"],
    ["toHaveCount", "await expect(page.getByText('Hello there')).toHaveCount(0, { timeout: 500 });"],
  ])('%s stays ASSERTION_FAILED', async (_name, code) => {
    const result = await run(code);
    expect(result.closedCode).toBe('ASSERTION_FAILED');
    expect(result.matchCount).toBeUndefined();
  });

  it('a positive text matcher with a plain string or a positive regex is a drift', async () => {
    expect(await run("await expect(page.getByText('Hello there')).toHaveText('Hello there', { timeout: 500 });")).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 2 });
    expect(await run("await expect(page.getByText('Hello there')).toContainText(/hel+o/i, { timeout: 500 });")).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 2 });
  });

  it('after the fence the same positive violation stays ASSERTION_FAILED', async () => {
    const result = await run("await page.getByRole('button', { name: 'Go' }).click(); await expect(page.getByText('Hello there')).toBeVisible({ timeout: 500 });");
    expect(result.fenceCrossed).toBe(true);
    expect(result.closedCode).toBe('ASSERTION_FAILED');
  });
});

/**
 * SC008-FIX-32: a check that "the page contains" some text, on a page whose first copy of the text is hidden (a logo heading whose text is display:none)
 * and whose second copy is shown. The repair of the ambiguous getByText that picks first() lands on the hidden copy and fails; the page-text form the
 * contract teaches (body, useInnerText) passes on the shown copy, and never passes on text that is only hidden or only in markup the page does not render.
 */
describe('a page-text check where the first copy of the text is hidden', () => {
  const TEXT = 'Acme Registry Authority';
  const LOGO = `<h1><span style="display:none">${TEXT}</span></h1>`;
  const SHOWN = `${LOGO}<p>Welcome to the\n  ${TEXT} (ARA) functions.</p>`;
  const HIDDEN_ONLY = `${LOGO}<p>Nothing else here</p><script type="text/plain">${TEXT}</script><div style="visibility:hidden">${TEXT}</div>`;
  const run = async (html: string, code: string): Promise<StepResult & { control: Control }> => {
    await page.goto(`data:text/html,${encodeURIComponent(html)}`);
    return go(code, 4000);
  };
  const strict = `await expect(page.getByText('${TEXT}')).toBeVisible({ timeout: 500 });`;
  const first = `await expect(page.getByText('${TEXT}').first()).toBeVisible({ timeout: 500 });`;
  const pageText = `await expect(page.locator('body')).toContainText('${TEXT}', { useInnerText: true, timeout: 500 });`;

  it('reproduces the failure: the strict check is ambiguous and the first() repair resolves the hidden copy', async () => {
    expect(await run(SHOWN, strict)).toMatchObject({ closedCode: 'TARGET_DRIFT', matchCount: 2 });
    expect(await run(SHOWN, first)).toMatchObject({ ok: false, closedCode: 'ASSERTION_FAILED' });
  });

  it('the page-text form passes on the shown copy, whatever the markup around it', async () => {
    const result = await run(SHOWN, pageText);
    expect(result.ok).toBe(true);
    expect(result.closedCode).toBeUndefined();
    expect(result.fenceCrossed).toBe(false);
  });

  it('the page-text form is not fooled by text that is hidden, invisible or only in a script', async () => {
    expect(await run(HIDDEN_ONLY, pageText)).toMatchObject({ ok: false, closedCode: 'ASSERTION_FAILED' });
    // The same check without useInnerText reads textContent and would pass on this page: the option is what makes the check sound.
    const textContent = `await expect(page.locator('body')).toContainText('${TEXT}', { timeout: 500 });`;
    expect((await run(HIDDEN_ONLY, textContent)).ok).toBe(true);
  });

  it('the page-text form fails when the text is nowhere', async () => {
    expect(await run('<h1>Other</h1><p>Something else</p>', pageText)).toMatchObject({ ok: false, closedCode: 'ASSERTION_FAILED' });
  });
});

// Keep the imports honest: the production import of the browser library lives elsewhere.
void chromium;
