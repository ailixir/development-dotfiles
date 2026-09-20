/** Independent pinned Playwright assertions are the oracle; each case has an expected verdict. */
// eslint-disable-next-line no-restricted-imports -- Test-only browser oracle, never shipped.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Test-only oracle types.
import type { Browser, Page } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlaywrightAdapter } from '../../src/run/playwrightAdapter.js';
import type { ResolvedMatcher } from '../../src/executor/adapters/BrowserAdapter.js';
import { EMPTY_REFERENCES, validateArtifact } from '../../src/validator/index.js';

let browser: Browser;
let page: Page;
const TIMEOUT = 80;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
  page = await browser.newPage();
  await page.route('https://fixture.example/**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: `
      <title>  Checks\t  Dashboard  </title>
      <div id="text">  Hello\n \t WORLD\u200b\u00ad </div>
      <input id="value" value="  Hello   WORLD  ">
      <button id="button" onclick="document.getElementById('effect').textContent='clicked'">Save</button>
      <div id="effect">unchanged</div>` });
  });
  await page.goto('https://fixture.example/AbC');
});

afterAll(async () => { await browser.close(); });

function resolved(value: string | RegExp): ResolvedMatcher {
  return typeof value === 'string'
    ? { kind: 'string', value }
    : { kind: 'pattern', source: value.source, flags: value.flags };
}

async function passed(action: () => Promise<unknown>): Promise<boolean> {
  try { await action(); return true; } catch { return false; }
}

interface Case {
  label: string;
  method: 'text' | 'title' | 'value' | 'url';
  expected: string | RegExp;
  passes: boolean;
  ignoreCase?: boolean;
  useInnerText?: boolean;
}

const cases: Case[] = [
  { label: 'url strings use URL canonicalization', method: 'url', expected: ' HTTPS://FIXTURE.EXAMPLE:443/AbC ', passes: true },
  { label: 'canonicalization does not erase path differences', method: 'url', expected: ' https://fixture.example/abc ', passes: false },
  { label: 'relative URL string never inherits current page as base', method: 'url', expected: '/AbC', passes: false },
  { label: 'URL regex stays raw', method: 'url', expected: / HTTPS:\/\/FIXTURE.EXAMPLE:443\/AbC /, passes: false },
  { label: 'text collapses both sides', method: 'text', expected: ' Hello\t WORLD ', passes: true },
  { label: 'text does not ignore differing words', method: 'text', expected: 'Hello EARTH', passes: false },
  { label: 'innerText normalizes', method: 'text', expected: 'Hello WORLD', useInnerText: true, passes: true },
  { label: 'regex retains raw whitespace', method: 'text', expected: /Hello WORLD/, passes: false },
  { label: 'regex sees actual whitespace', method: 'text', expected: /Hello\s+WORLD/, passes: true },
  { label: 'regex true adds i', method: 'text', expected: /hello\s+world/, ignoreCase: true, passes: true },
  { label: 'regex false removes i', method: 'text', expected: /hello\s+world/i, ignoreCase: false, passes: false },
  { label: 'regex omitted preserves i', method: 'text', expected: /hello\s+world/i, passes: true },
  { label: 'regex omitted preserves case sensitivity', method: 'text', expected: /hello\s+world/, passes: false },
  { label: 'string ignores case only explicitly', method: 'text', expected: 'hello world', ignoreCase: true, passes: true },
  { label: 'string case sensitive by default', method: 'text', expected: 'hello world', passes: false },
  { label: 'title normalizes expected and actual', method: 'title', expected: ' Checks\n Dashboard ', passes: true },
  { label: 'title negative companion', method: 'title', expected: 'Checks Settings', passes: false },
  { label: 'title regex is raw', method: 'title', expected: /Checks\t {2}Dashboard/, passes: false },
  { label: 'value stays literal positive', method: 'value', expected: '  Hello   WORLD  ', passes: true },
  { label: 'value is never text-normalized', method: 'value', expected: 'Hello WORLD', passes: false },
  { label: 'url regex true adds i', method: 'url', expected: /\/abc$/, ignoreCase: true, passes: true },
  { label: 'url regex false removes i', method: 'url', expected: /\/abc$/i, ignoreCase: false, passes: false },
  { label: 'url regex omitted preserves i', method: 'url', expected: /\/abc$/i, passes: true },
  { label: 'url regex omitted case sensitive', method: 'url', expected: /\/abc$/, passes: false },
  { label: 'url string ignores case explicitly', method: 'url', expected: 'https://fixture.example/abc', ignoreCase: true, passes: true },
  { label: 'url string stays case sensitive by default', method: 'url', expected: 'https://fixture.example/abc', passes: false },
];

describe('runner agrees with actual Playwright 1.63 assertions', () => {
  it.each(cases)('$label', async ({ method, expected, passes, ignoreCase, useInnerText }) => {
    const adapter = createPlaywrightAdapter({ page, defaultTimeoutMs: TIMEOUT, pollIntervalMs: 5 });
    const options = { timeout: TIMEOUT, ...(ignoreCase === undefined ? {} : { ignoreCase }),
      ...(useInnerText === undefined ? {} : { useInnerText }) };
    const handle = await adapter.locate({ segments: [{ kind: 'locator', selector: method === 'value' ? '#value' : '#text' }] });
    const oracle = async () => {
      switch (method) {
        case 'text': await playwrightExpect(page.locator('#text')).toContainText(expected, options); return;
        case 'title': await playwrightExpect(page).toHaveTitle(expected, options); return;
        case 'value': await playwrightExpect(page.locator('#value')).toHaveValue(expected, options); return;
        case 'url': await playwrightExpect(page).toHaveURL(expected, options); return;
      }
    };
    const actual = async () => {
      switch (method) {
        case 'text': await adapter.expectContainText(handle, resolved(expected), options); return;
        case 'title': await adapter.expectTitle(resolved(expected), options); return;
        case 'value': await adapter.expectValue(handle, resolved(expected), options); return;
        case 'url': await adapter.expectUrl(resolved(expected), options); return;
      }
    };
    expect(await passed(oracle), 'independent Playwright oracle').toBe(passes);
    expect(await passed(actual), 'Studio adapter').toBe(passes);
  });

  it('rejects trial admission and performs an accepted real click', async () => {
    const originalText = 'Click Save';
    const code = "await page.locator('#button').click({ trial: true });";
    const result = validateArtifact({ version: 1, steps: [{ stepIndex: 0, originalText, code }] }, [originalText], EMPTY_REFERENCES);
    expect(result.ok).toBe(false);
    await playwrightExpect(page.locator('#effect')).toHaveText('unchanged');
    const adapter = createPlaywrightAdapter({ page, defaultTimeoutMs: 1_000 });
    const handle = await adapter.locate({ segments: [{ kind: 'locator', selector: '#button' }] });
    await adapter.click(handle);
    await playwrightExpect(page.locator('#effect')).toHaveText('clicked');
  });
});

// A detached locator must not reset the assertion deadline when it reappears.
it.each([150, 500])('detached text reappearing at %ims observes one deadline', async (delay) => {
  const check = async (studio: boolean): Promise<boolean> => {
    const subject = await browser.newPage();
    try {
      await subject.setContent(`<div id="changing">wrong</div><script>
        setTimeout(() => document.getElementById('changing').remove(), 60);
        setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<div id="changing">right</div>'), ${String(delay)});
      </script>`);
      if (studio) {
        const adapter = createPlaywrightAdapter({ page: subject, defaultTimeoutMs: 300, pollIntervalMs: 100 });
        const handle = await adapter.locate({ segments: [{ kind: 'locator', selector: '#changing' }] });
        await adapter.expectContainText(handle, { kind: 'string', value: 'right' }, { timeout: 300 });
      } else {
        await playwrightExpect(subject.locator('#changing')).toContainText('right', { timeout: 300 });
      }
      return true;
    } catch { return false; }
    finally { await subject.close(); }
  };
  expect(await check(false), 'pinned Playwright oracle').toBe(delay < 300);
  expect(await check(true), 'Studio must not pass a late read').toBe(delay < 300);
});
