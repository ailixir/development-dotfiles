import { stepOp } from '../helpers/stepCode.js';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Real Chromium page type only, to plant the canary page state and to read Playwright's own error as the control.
import type { Page } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';

import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeBootstrap, BridgeObservation, ExecutionEvidence } from '../../src/guided/types.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { CLOSED_ACTION_CODES, CLOSED_REPLAY_REASONS } from '../../src/run/closedError.js';
import type { LaunchedBrowser } from '../../src/run/guidedBrowser.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';
import { childPage } from './helpers/childPage.js';
import { TEST_CHILD, guidedChildLauncher } from './helpers/guidedLaunch.js';
import { html, serve } from './perception/cutover-support.js';
import type { Served } from './perception/cutover-support.js';

/**
 * ADR-SC-007 WI-4 AC9 at the guided level: no Playwright error text reaches the diagnostics sidecar, the captured stderr or the
 * outcome's errorMessage, and the blank-navigation and wait functions leave only closed codes. The page carries canaries in an overlay
 * (text and attributes), in a prefilled value attribute and in a data attribute. Playwright's own error for the same page state does
 * carry them (the control that proves the test can see a leak).
 */
const ATTR = 'CANARY-ATTR-9910';
const TEXT = 'CANARY-OVERLAY-TEXT-4471';
const VALUE = 'CANARY-VALUE-2208';
const CLOSED: readonly string[] = [...CLOSED_ACTION_CODES, ...CLOSED_REPLAY_REASONS];

const handleOf = (browser: LaunchedBrowser | undefined): NonNullable<LaunchedBrowser['handle']> => {
  const handle = browser?.handle;
  if (handle === undefined) throw new Error('the guided browser has no handle');
  return handle;
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function site(): Promise<Served> {
  const served = await serve({
    '/source': html(`<main aria-label="Operations"><button type="button" data-canary="${ATTR}" onclick="window.clicked=true">Pay now</button><label>Account <input value="${VALUE}" data-canary="${ATTR}"></label></main>`),
    '/hang': (_request, response) => {
      // Never answered: the load event of any page that embeds it stays open.
      void response;
    },
    '/slow': html(`<main aria-label="Operations"><img alt="x" src="/hang?${ATTR}"></main>`),
  });
  cleanups.push(() => served.close());
  return served;
}

describe('guided canary boundary', () => {
  it('the sidecar, stderr and errorMessage carry no canary', async () => {
    const served = await site();
    const directory = await mkdtemp(join(tmpdir(), 'guided-canary-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const context = guidedContext(served.origin);
    const messages: { route: string; body: unknown }[] = [];
    const stderr: string[] = [];
    const runtime = new GuidedRuntime(context, {
      workerId: context.workerId,
      allowedDomains: TEST_DOMAINS,
      journalDirectory: directory,
      diagnosticStderr: (text) => { stderr.push(text); },
      launch: guidedChildLauncher({ childModulePath: TEST_CHILD.probe }),
      callback: (route, body) => {
        messages.push({ route, body });
        return Promise.resolve();
      },
    });
    cleanups.push(() => runtime.stop('CANCELLED'));
    await runtime.start();
    // The page is in the guided child now: the test reaches it through the child's probe, with the same Playwright calls.
    const probe = await childPage();
    cleanups.push(() => { probe.close(); return Promise.resolve(); });
    let evidence = (messages[0]?.body as BridgeBootstrap).executionEvidence as ExecutionEvidence;
    const act = async (step: string, operation: Action['operation'], between?: () => Promise<void>) => {
      const p = proposal(context, evidence, step, operation);
      const prepared = await runtime.prepare({ ...identity(context), proposal: p, requestDigest: hash(p), expiresAt: new Date(Date.now() + 20_000).toISOString() });
      await between?.();
      const outcome = await runtime.dispatch(dispatch(context, p, prepared));
      const seen = messages.filter((m) => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined;
      if (seen) evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: seen.observation.documentId, generation: seen.observation.generation, origin: seen.observation.origin, observationHash: hash(seen.observation) };
      return outcome;
    };
    expect((await act('nav', stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }))).ledger.state).toBe('SUCCEEDED');
    const seen = (messages.filter((m) => m.route === 'observations').at(-1)?.body as BridgeObservation).observation;
    if (!Object.values(seen.facts).some((fact) => fact.name === 'Pay now')) throw new Error('the button is not in the observation');
    const cover = (): Promise<void> => probe.insertHtml(`<div id="overlay" data-canary="${ATTR}" style="position:fixed;inset:0;background:rgba(0,0,0,.2)">${TEXT}</div>`);
    // The page state that fails the click: Playwright's own error for it carries the canaries (the control).
    await cover();
    const raw = await probe.clickError('button', 700);
    await probe.remove('#overlay');
    expect([ATTR, TEXT].some((canary) => raw.includes(canary)), 'the raw Playwright error shows the page text, so the test can see a leak').toBe(true);

    const outcome = await act('read', stepOp('await page.getByRole("button", { name: "Pay now", exact: true }).click();'), cover);
    expect(outcome.ledger.state).not.toBe('SUCCEEDED');
    // A step failure is a closed code now: the sidecar only records errors outside the step, so a record is optional.
    const files = (await readdir(directory)).filter((name) => name.endsWith('.diagnostic.jsonl'));
    const sidecar = files[0] === undefined ? '' : await readFile(join(directory, files[0]), 'utf8');
    const surfaces = { sidecar, stderr: stderr.join(''), errorMessage: outcome.errorMessage ?? '', outcome: JSON.stringify(outcome), messages: JSON.stringify(messages.filter((m) => m.route !== 'observations')) };
    for (const [name, text] of Object.entries(surfaces)) {
      for (const canary of [ATTR, TEXT, VALUE]) expect(text.includes(canary), `${canary} in ${name}`).toBe(false);
    }
  });

  it('the blank and context questions of a closed page answer only with closed codes', async () => {
    const config = { sessionId: 'guided-canary-blank', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] };
    const closedCode = async (work: () => Promise<unknown>): Promise<string> => {
      try {
        await work();
        return 'NO_ERROR';
      } catch (error) {
        return error instanceof Error ? error.message : 'NOT_AN_ERROR';
      }
    };
    const closed = await launchGuidedBrowser(config, 'ctx-canary', () => undefined);
    cleanups.push(async () => { await closed.close().catch(() => undefined); });
    await (handleOf(closed).page as unknown as Page).close();
    const results: Record<string, string> = {};
    results['blankMatches on a closed page'] = await closedCode(() => closed.blankMatches());
    results['observedBlankMatches on a closed page'] = await closedCode(() => (handleOf(closed).observedBlankMatches ?? (() => Promise.reject(new Error('NO_MATCHES'))))());
    results['observedInitialContextMatches on a closed page'] = await closedCode(() => (handleOf(closed).observedInitialContextMatches ?? (() => Promise.reject(new Error('NO_CONTEXT'))))());
    // A closed code, or no error where the function answers false/true instead of throwing; never the canary.
    const offenders = Object.entries(results).filter(([, code]) => !(code === 'NO_ERROR' || CLOSED.includes(code)) || code.includes(ATTR)).map(([name, code]) => `${name}: "${code.slice(0, 120)}"`);
    expect(offenders).toEqual([]);
  });
});
