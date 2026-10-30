/**
 * STUDIO-OBS-009 AC-7 FOCUS-MUTATION-01, re-based on ADR-SC-007 WI-4 (plan D-16, AC10), real Chromium.
 *
 * The retired rule FM refused a fill when the focus handler mutated the field or its ancestors (POST_FOCUS_CHANGED). The DOM-mutation staleness
 * gate is REPLACED, not dropped: learn acts only on the element verified at prepare. Before the fence the backendNodeId bound at prepare must be
 * the locator's single match; after the fence the target is focused and the runner verifies, through the public API, that the target holds focus
 * and no password element does, and that it is still the bound node, before anything is written.
 *
 * So the property this file proves is "nothing is written to another element, to a detached element or to a password element", and the changed
 * expectations against the old file are listed per case: a change that leaves the verified element focused and matched (an attribute the locator
 * does not use, helper text elsewhere) writes; a change that detaches it, replaces it, moves focus away from it, hides or disables it ends
 * UNKNOWN_OUTCOME with nothing written. Synchronous focus handlers only (the deferred-handler residual is waived, ruling W-AC10).
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
// eslint-disable-next-line no-restricted-imports -- Real Chromium for the fixtures tier; the production import stays in src/run/browser.ts only.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Types of the same import.
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { createBrowserObservationSession } from '../../src/run/browser.js';
import { observationReadProfile } from '../../src/run/observationReadProfile.js';
import type { Action } from '../../src/guided/types.js';
import { TestControl } from './perception/cutover-support.js';

const FRESH = 'fresh-1-focus-mutation';
let server: Server;
let origin = '';
let current = '';
let browser: Browser;

beforeAll(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(current); });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('PORT');
  origin = `http://localhost:${String(address.port)}`;
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
});

/**
 * MAIN > DIV#wrap > FORM#f > SECTION#s > TEXTAREA#destination, with an OUTPUT, an empty portal, a password field and a button elsewhere.
 * `handler` runs inside the textarea's `trigger` listener (synchronously).
 */
const pageWith = (handler: string, trigger = 'focus'): string => `<!doctype html><html><head><title>Operations</title></head><body><main aria-label='Operations'>`
  + `<div id='wrap'><form id='f'><section id='s'><label for='destination'>Destination</label><textarea id='destination'></textarea></section></form></div>`
  + `<output aria-label='Order reference'>${FRESH}</output><div id='portal'></div><label>Account secret <input id='pw' type='password'></label><button id='submit'>Submit</button></main>`
  + (handler ? `<script>document.getElementById('destination').addEventListener('${trigger}',()=>{${handler}});</script>` : '')
  + `</body></html>`;

interface Attempt { readonly threw: string | null; readonly value: unknown; readonly written: string; readonly everywhere: string[]; readonly fenced: number }

async function fillOnFocus(html: string, operation: Action['operation'] = { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }): Promise<Attempt> {
  current = html;
  const context = await browser.newContext();
  const page = await context.newPage();
  let session: ReturnType<typeof createBrowserObservationSession> | undefined;
  try {
    await page.goto(`${origin}/flow`);
    session = createBrowserObservationSession(page, { sessionId: 's', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: observationReadProfile(TEST_DOMAINS) });
    const exported = await session.observe(undefined, false);
    const found = Object.entries(exported.observation.facts).find(([, fact]) => fact.role === 'textbox' && fact.name === 'Destination');
    if (!found) throw new Error(`NODE ${exported.observation.outline}`);
    const resolved = await session.prepareTarget({ ref: found[0], documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation, authoredLiteral: null });
    const control = new TestControl();
    let threw: string | null = null;
    let value: unknown = null;
    try {
      value = await session.invoke({ resolved, operation, resolvedValue: FRESH, origin, maxValueBytes: 4096, readRuleId: null, profile: 'learn', expect: { documentId: exported.observation.documentId, generation: exported.observation.generation } }, control);
    } catch (error) {
      threw = error instanceof Error ? error.message : String(error);
    }
    const written = await page.evaluate(() => (document.getElementById('destination') as HTMLTextAreaElement | null)?.value ?? '<detached>');
    const everywhere = await page.evaluate(() => Array.from(document.querySelectorAll('textarea, input')).map((element) => (element as HTMLTextAreaElement).value));
    return { threw, value, written, everywhere, fenced: control.fenced };
  } finally {
    await session?.dispose().catch(() => undefined);
    await context.close();
  }
}

/** The fill proceeded on the very element that was verified. */
const writes = (attempt: Attempt): void => {
  expect(attempt.threw).toBeNull();
  expect(attempt.value).toEqual({});
  expect(attempt.written).toBe(FRESH);
};
/** Nothing was written to any element (the verified one, its replacement, the password field): the outcome is unknown, never a wrong write. */
const refuses = (attempt: Attempt): void => {
  expect(attempt.threw).toBe('UNKNOWN_OUTCOME');
  expect(attempt.written).not.toBe(FRESH);
  expect(attempt.everywhere).not.toContain(FRESH);
};

const target = "document.getElementById('destination')";

describe('FOCUS-MUTATION-01 on real Chromium: a change elsewhere during the fill\'s focus writes', () => {
  // The D5 probe matrix. `focus` is the case that used to end the session; `input` and `change` fire after the write, which was never refused.
  it.each([
    ['no trigger', ''],
    ['focus', "document.querySelector('output').textContent='changed-after-read';"],
  ])('D5 probe trigger %s: an unrelated <output> rewritten', async (_name, handler) => {
    writes(await fillOnFocus(pageWith(handler)));
  });

  it.each(['input', 'change'])('D5 probe trigger %s: the mutation comes after the write and never refused it', async (trigger) => {
    writes(await fillOnFocus(pageWith("document.querySelector('output').textContent='changed-after-read';", trigger)));
  });

  it('(1) helper text inserted elsewhere on focus', async () => {
    writes(await fillOnFocus(pageWith("const p=document.createElement('p');p.textContent='Required field';document.querySelector('main').appendChild(p);")));
  });

  it('(1) helper text inserted next to the field, inside its own section', async () => {
    writes(await fillOnFocus(pageWith("const p=document.createElement('p');p.textContent='Helper';document.getElementById('s').appendChild(p);")));
  });

  it('(2) an autocomplete listbox rendered in a portal outside the form', async () => {
    writes(await fillOnFocus(pageWith("const ul=document.createElement('ul');ul.setAttribute('role','listbox');ul.innerHTML='<li role=option>Berlin</li><li role=option>Bern</li>';document.getElementById('portal').appendChild(ul);document.body.appendChild(document.createElement('div'));")));
  });

  it.each(['class', 'style', 'aria-expanded', 'aria-activedescendant', 'aria-describedby', 'aria-controls', 'data-focus', 'data-focus-visible'])('(3) the allowlisted attribute %s set on the target', async (name) => {
    const value = name === 'style' ? 'outline: 1px solid blue' : 'x';
    writes(await fillOnFocus(pageWith(`${target}.setAttribute('${name}','${value}');`)));
  });

  it('inert attributes and a class on an ancestor are ignored', async () => {
    writes(await fillOnFocus(pageWith("const s=document.getElementById('s');s.setAttribute('class','focused');s.setAttribute('aria-expanded','true');document.getElementById('f').setAttribute('data-state','open');")));
  });

  // The cases of ADR-SC-007 D-16 / AC10 (the presence proofs of the fixtures tier).
  it('helper text elsewhere: the fill proceeds', async () => {
    writes(await fillOnFocus(pageWith("const p=document.createElement('p');p.textContent='Required field';document.querySelector('main').appendChild(p);")));
  });

  it('own attribute changed: the fill proceeds on the same element', async () => {
    const attempt = await fillOnFocus(pageWith(`${target}.setAttribute('name','changed-on-focus');`));
    writes(attempt);
    expect(attempt.everywhere.filter((entry) => entry === FRESH)).toHaveLength(1);
  });
});

describe('FOCUS-MUTATION-01 on real Chromium (ADR-SC-007 D-16): a change to the target or its ancestors is held to the verified element and writes nothing else', () => {
  // Changed expectations against the retired rule FM (which refused every one of these with POST_FOCUS_CHANGED): an attribute the locator does not
  // use leaves the verified element focused and matched, so the write lands on it; the others detach, hide, disable or defocus it.
  it.each([
    ['readonly', 'refuses', 'the fill waits for an editable field and times out after the fence'],
    ['name', 'writes', 'the locator is role textbox "Destination": a name attribute is not part of it'],
    ['autocomplete', 'writes', 'not part of the locator, still editable'],
    ['aria-hidden', 'refuses', 'aria-hidden removes it from the role tree, so the locator matches nothing after the focus'],
    ['contenteditable', 'writes', 'a textarea stays a textarea; the same element is filled'],
    ['aria-disabled', 'refuses', 'Playwright treats aria-disabled=true as not enabled, so the fill times out after the fence'],
    ['disabled', 'refuses', 'a disabled field cannot hold focus, so the focus verification fails'],
  ] as const)('a non-allowlisted attribute set on the target: %s', // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the third column documents the case
  async (name, expectation, _reason) => {
    const attempt = await fillOnFocus(pageWith(`${target}.setAttribute('${name}','${name === 'aria-hidden' || name === 'aria-disabled' ? 'true' : 'x'}');`));
    if (expectation === 'writes') writes(attempt); else refuses(attempt);
  });

  it('the target replaced by a copy', async () => {
    refuses(await fillOnFocus(pageWith(`const t=${target};const copy=t.cloneNode(true);t.replaceWith(copy);`)));
  });

  it('the target detached', async () => {
    refuses(await fillOnFocus(pageWith(`${target}.remove();`)));
  });

  it('an ancestor removed', async () => {
    refuses(await fillOnFocus(pageWith("document.getElementById('s').remove();")));
  });

  it('an ancestor replaced by a copy', async () => {
    refuses(await fillOnFocus(pageWith("const s=document.getElementById('s');s.replaceWith(s.cloneNode(true));")));
  });

  it('an ancestor moved', async () => {
    refuses(await fillOnFocus(pageWith("document.getElementById('portal').appendChild(document.getElementById('s'));")));
  });

  it.each(['hidden', 'inert'])('%s set on an ancestor', async (name) => {
    refuses(await fillOnFocus(pageWith(`document.getElementById('s').setAttribute('${name}','');`)));
  });

  it('a tolerated change plus a real one in the same focus handler is refused', async () => {
    refuses(await fillOnFocus(pageWith(`document.querySelector('output').textContent='changed';${target}.setAttribute('aria-expanded','true');${target}.remove();`)));
  });

  it('focus redirected to a password field: nothing written to either', async () => {
    const attempt = await fillOnFocus(pageWith("document.getElementById('pw').focus();"));
    refuses(attempt);
    expect(attempt.fenced).toBe(1);
  });

  it('focus redirected to a button: the key is not delivered', async () => {
    const page = pageWith("document.getElementById('submit').focus();").replace("<button id='submit'>", "<button id='submit' onclick=\"document.body.dataset.clicked='yes'\" onkeydown=\"document.body.dataset.keyed='yes'\">");
    const attempt = await fillOnFocus(page, { kind: 'press', key: 'Enter' });
    expect(attempt.threw).toBe('UNKNOWN_OUTCOME');
    expect(attempt.fenced).toBe(1);
    const clicked = await keyDelivered(page);
    expect(clicked).toEqual({ clicked: null, keyed: null });
  });

  it('the literal copied into a password input is detected after the fill', async () => {
    // The page copies what is typed into a password input on `input`: the fill itself writes the literal, and the check after the write finds it
    // in a password-type input (a detection after the write, not a prevention): UNKNOWN_OUTCOME.
    const attempt = await fillOnFocus(pageWith("document.getElementById('destination').addEventListener('input',()=>{document.getElementById('pw').value=document.getElementById('destination').value;});"));
    expect(attempt.threw).toBe('UNKNOWN_OUTCOME');
    expect(attempt.fenced).toBe(1);
    expect(attempt.written).toBe(FRESH);
    expect(attempt.everywhere.filter((entry) => entry === FRESH)).toHaveLength(2);
  });

  it('field replaced on focus: the replacement stays empty', async () => {
    const attempt = await fillOnFocus(pageWith(`const t=${target};const copy=t.cloneNode(true);t.replaceWith(copy);`));
    refuses(attempt);
    expect(attempt.written).toBe('');
  });

  it('locator attribute removed: nothing written', async () => {
    // The accessible name is part of every locator of this field: changing the label text makes the locator match nothing after the focus.
    refuses(await fillOnFocus(pageWith("document.querySelector('label[for=destination]').textContent='Other name';")));
  });

  it('turned read-only on focus: unknown outcome without page text', async () => {
    const canary = 'canary-readonly-attr-6613';
    const attempt = await fillOnFocus(pageWith(`${target}.setAttribute('data-canary','${canary}');${target}.readOnly=true;`));
    refuses(attempt);
    expect(attempt.threw).not.toContain(canary);
    expect(JSON.stringify(attempt)).not.toContain(canary);
  });
});

/** Re-runs the key page and reads the page-side effects of the focused button (no key may have reached it). */
async function keyDelivered(html: string): Promise<{ clicked: string | null; keyed: string | null }> {
  current = html;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/flow`);
    const session = createBrowserObservationSession(page, { sessionId: 's', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [], readProfile: observationReadProfile(TEST_DOMAINS) });
    const exported = await session.observe(undefined, false);
    const found = Object.entries(exported.observation.facts).find(([, fact]) => fact.name === 'Destination');
    if (!found) throw new Error('NODE');
    const operation: Action['operation'] = { kind: 'press', key: 'Enter' };
    const resolved = await session.prepareTarget({ ref: found[0], documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation, authoredLiteral: null });
    await session.invoke({ resolved, operation, resolvedValue: null, origin, maxValueBytes: 4096, readRuleId: null, profile: 'learn' }, new TestControl()).catch(() => undefined);
    const state = await page.evaluate(() => ({ clicked: document.body.dataset.clicked ?? null, keyed: document.body.dataset.keyed ?? null }));
    await session.dispose().catch(() => undefined);
    return state;
  } finally {
    await context.close();
  }
}
