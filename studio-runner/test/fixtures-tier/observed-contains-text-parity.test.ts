import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * STUDIO-OBS-015 H6 — `containsText` parity with the pinned Playwright 1.63.0 `toContainText` (F4,
 * `docs/architecture/studio-inference-contract-v1.md` §6), in real Chromium.
 *
 * The runner's in-page `invoke` is the subject; Playwright's own `expect(locator).toContainText` is
 * the oracle. Both normalize whitespace on both sides and match a case-sensitive substring.
 *
 * The table is visible-only on purpose: Playwright's actual text (`elementText`, textContent-like)
 * and the runner's (`innerText`) intentionally differ on hidden descendants, `<br>` and CSS
 * `text-transform`, so those shapes are not parity rows.
 *
 * One intentional divergence (PO R4, 2026-10-16): an expected value that is empty after whitespace
 * normalization passes in Playwright but never in the runner (a check that cannot fail is not a
 * check). It is asserted separately below and is not a parity row.
 */
// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types; production import remains browser.ts only.
import type { Page } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { playwrightBrowserFactory } from './preparedBrowser.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { ObservationSession, TargetInvocation } from '../../src/run/observationTypes.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';

let browser: BrowserHandle, page: Page, server: PageServer, scratch: string;
const sessions: ObservationSession[] = [];
beforeAll(async () => {
  server = await startPageServer();
  scratch = await mkdtemp(join(tmpdir(), 'contains-text-parity-'));
  browser = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', scratchPath: scratch, viewport: { width: 800, height: 600 }, recording: { width: 800, height: 600 } });
  page = browser.page as unknown as Page;
  await page.goto(server.baseUrl);
});
afterEach(async () => { for (const session of sessions) await session.dispose(); sessions.length = 0; await page.goto(server.baseUrl); });
afterAll(async () => { await browser.dispose(); await server.close(); await rm(scratch, { recursive: true, force: true }); });

/** The frozen ReplayIT shape: a padded `<dd>` read value, asserted back with its padding. */
const fresh = '  fresh-1-3f2c1a9e-7b4d-4e7a-9c1d-2a6b8e0f4d11-é\u{1F600}  ';

const rows: [label: string, markup: string, expected: string, passes: boolean][] = [
  ['the H6 regression: padded read value against its padded dd', `<dl><dt>Reference</dt><dd><output data-testid="target" aria-label="Reference">${fresh}</output></dd></dl>`, fresh, true],
  ['preserved tabs and newlines against collapsed spacing', '<output data-testid="target" aria-label="Target" style="white-space: pre">Order\t42\n\nconfirmed</output>', 'Order 42  confirmed', true],
  ['inline children separated by source whitespace', '<output data-testid="target" aria-label="Target"><span>Order 42</span>\n   <span>confirmed</span></output>', 'Order\t42\nconfirmed', true],
  ['an exact match', '<output data-testid="target" aria-label="Target">Order 42</output>', 'Order 42', true],
  ['a soft hyphen in the rendered text', '<output data-testid="target" aria-label="Target">Con&shy;firmed</output>', 'Confirmed', true],
  ['a zero-width space in the rendered text', '<output data-testid="target" aria-label="Target">Ord&#8203;er 42</output>', 'Order 42', true],
  ['a no-break space in the rendered text', '<output data-testid="target" aria-label="Target">Order&nbsp;42</output>', 'Order 42', true],
  ['a different word', '<output data-testid="target" aria-label="Target">Order 42 confirmed</output>', 'cancelled', false],
  ['a case difference', '<output data-testid="target" aria-label="Target">Order 42 confirmed</output>', 'order 42', false],
  ['normalizing never joins words', '<output data-testid="target" aria-label="Target">Order42</output>', 'Order 42', false],
];

async function runnerContainsText(markup: string, expected: string): Promise<boolean | undefined> {
  await page.setContent(markup);
  const session = browser.createObservationSession?.({ sessionId: 'parity-session', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: { policyRuleId: 'structural', allowStructuralDiscovery: true, readGrants: [] } });
  if (!session) throw new Error('SESSION');
  sessions.push(session);
  const observation = (await session.observe()).observation;
  // The dd row is named by its adjacent term, as in ReplayIT: the output inside it carries the term's name.
  const found = Object.entries(observation.facts).find(([, fact]) => fact.name === 'Target' || fact.name === 'Reference');
  if (!found) throw new Error(`NODE: ${JSON.stringify(Object.values(observation.facts).map((fact) => fact.name))}`);
  const operation = { kind: 'assert', predicate: 'containsText', expected: { kind: 'authoredLiteral', sourceInputId: 'expected' } } as const;
  const resolved = await session.prepareTarget({ ref: found[0], documentId: observation.documentId, generation: observation.generation, origin: observation.origin, operation, authoredLiteral: null });
  const invocation: TargetInvocation = {
    resolved, operation, resolvedValue: expected, origin: server.baseUrl, maxValueBytes: 4096, readRuleId: null, profile: 'learn',
    expect: { documentId: observation.documentId, generation: observation.generation },
  };
  return (await session.invoke(invocation)).assertionPassed;
}

async function playwrightContainsText(expected: string): Promise<boolean> {
  const target = page.getByTestId('target');
  try {
    await playwrightExpect(target).toContainText(expected, { timeout: 250 });
  } catch {
    // Confirm the negative with the `.not` form so a slow page cannot pass as a mismatch.
    await playwrightExpect(target).not.toContainText(expected, { timeout: 250 });
    return false;
  }
  return true;
}

describe('containsText matches pinned Playwright toContainText in real Chromium (H6, F4)', () => {
  it.each(rows)('%s', async (_label, markup, expected, passes) => {
    const runner = await runnerContainsText(markup, expected);
    const oracle = await playwrightContainsText(expected);
    expect(oracle).toBe(passes);
    expect(runner).toBe(oracle);
  });
});

describe('PO R4 divergence: a whitespace-only expected value (intentional, not parity)', () => {
  it('PO R4 divergence: the pinned toContainText passes it, the runner never does', async () => {
    const markup = '<output data-testid="target" aria-label="Target">Order 42 confirmed</output>';
    const runner = await runnerContainsText(markup, '   ');
    const oracle = await playwrightContainsText('   ');
    expect(oracle).toBe(true);
    expect(runner).toBe(false);
  });
});
