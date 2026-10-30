import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { observationReadProfile, readGrantId } from '../../src/run/observationReadProfile.js';
import { PrivateInventory } from '../../src/run/privateInventory.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { launchChromium } from './perception/harness.js';
import { codeOf, html, invoke, open, rejection, serve, TestControl } from './perception/cutover-support.js';
import type { InvokeOptions, Opened, Operation, Prepared, Served } from './perception/cutover-support.js';
import type { ObservationExport } from '../../src/run/observationTypes.js';

/**
 * The retained, isolated target at invocation (ADR-SC-007 WI-4): every case goes through the production path, a ref in the
 * observation, prepareTarget (synthesis, binding) and the one executor invoke, over a real Chromium page. The page of a case is
 * served from `current`, so each case reaches the session as a fresh document.
 */
let browser: Browser;
let served: Served;
let current = '';
const opened: Opened[] = [];

beforeAll(async () => {
  browser = await launchChromium();
  served = await serve({
    '/case': (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(current);
    },
    '/next': html('<p>next</p>'),
  });
});
afterEach(async () => {
  for (const created of opened.splice(0)) await created.close();
});
afterAll(async () => {
  await browser.close();
  await served.close();
});

const FIELD = 'Approved field';
const FILL: Operation = { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'source' } };
const readOf = (rule: string | null, kind: 'visibleText' | 'controlValue' = 'visibleText'): Operation =>
  ({ kind: 'read', bindingId: 'local', recipe: kind === 'visibleText' ? { kind, classification: 'permittedBusinessData', policyRuleId: rule ?? 'none' } : { kind, classification: 'nonsecretApproved', controlType: 'text', policyRuleId: rule ?? 'none' } }) as Operation;
const HAS_VALUE: Operation = { kind: 'assert', predicate: 'hasValue', expected: { kind: 'authoredLiteral', sourceInputId: 'expected' } };
const CELL = (text: string, attributes = ''): string => `<main aria-label="Operations"><table aria-label="Orders"><tbody><tr><td aria-label="${FIELD}" ${attributes}>${text}</td></tr></tbody></table></main>`;

type Config = Parameters<typeof open>[3];
async function ready(markup: string, config: Config = {}): Promise<Opened> {
  current = html(markup);
  const created = await open(browser, served, '/case', config);
  opened.push(created);
  return created;
}
const readRuleOf = (exported: ObservationExport): string | null => exported.observation.readRuleId;

/** The one fact named like the approved field, prepared for `operation`. */
async function prep(h: Opened, operation: Operation, options: { name?: string; literal?: string | null; exported?: ObservationExport } = {}): Promise<Prepared> {
  const exported = options.exported ?? (await h.session.observe(undefined, false));
  const name = options.name ?? FIELD;
  const found = Object.entries(exported.observation.facts).filter(([, fact]) => fact.name === name);
  if (found.length !== 1 || found[0] === undefined) throw new Error(`expected one "${name}", found ${String(found.length)} in:\n${exported.observation.outline}`);
  const resolved = await h.session.prepareTarget({
    ref: found[0][0],
    documentId: exported.observation.documentId,
    generation: exported.observation.generation,
    origin: exported.observation.origin,
    operation,
    authoredLiteral: options.literal ?? null,
  });
  return { ref: found[0][0], resolved, exported };
}
const run = async (h: Opened, operation: Operation, options: InvokeOptions & { name?: string } = {}): Promise<Awaited<ReturnType<typeof invoke>>> => invoke(h, await prep(h, operation, options.name === undefined ? {} : { name: options.name }), operation, options);
const prepareCode = (h: Opened, operation: Operation, name = FIELD): Promise<string | null> => codeOf(prep(h, operation, { name }));
const inputValue = (h: Opened): Promise<string> => h.page.locator('input').inputValue();

describe('retained isolated target at invocation', () => {
  it('reads a positively classified field exactly without accepting runtime policy substitutions', async () => {
    const h = await ready(CELL('  exact-é  '));
    const exported = await h.session.observe(undefined, false);
    const rule = readRuleOf(exported);
    expect(rule).toBe(readGrantId('localhost'));
    const prepared = await prep(h, readOf(rule), { exported });
    const expected = await h.page.locator('td').innerText();
    expect(expected).toContain('exact-é');
    expect(await invoke(h, prepared, readOf(rule), { readRuleId: rule })).toEqual({ value: expected });
    expect(await prepareCode(h, readOf('invented'))).toBe('READ_NOT_ALLOWED');
    expect(await codeOf(invoke(h, prepared, readOf('invented'), { readRuleId: 'invented' }))).not.toBeNull();
  });
  it.each(['password', 'hidden'])('refuses a post-prepare type change to %s', async (type) => {
    const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="private"></main>`);
    const prepared = await prep(h, FILL);
    await h.page.locator('input').evaluate((element, kind) => {
      element.setAttribute('type', kind);
    }, type);
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'NEVER-WRITTEN' }))).toBe('TARGET_CHANGED');
    expect(await inputValue(h)).toBe('private');
  });
  it('a post-prepare change to email leaves an ordinary text field, so the prepared fill still lands in the same node', async () => {
    // The target is identified by role and name, and an email input is still a textbox; only password and hidden leave the role.
    const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="private"></main>`);
    const prepared = await prep(h, FILL);
    await h.page.locator('input').evaluate((element) => {
      element.setAttribute('type', 'email');
    });
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'name@example.test' }))).toBeNull();
    expect(await inputValue(h)).toBe('name@example.test');
  });
  it('refuses replacement by an indistinguishable node and never fills the replacement', async () => {
    const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}"></main>`);
    const prepared = await prep(h, FILL);
    await h.page.locator('input').evaluate((element) => {
      element.replaceWith(element.cloneNode());
    });
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'NEVER_FILL' }))).toBe('TARGET_CHANGED');
    expect(await inputValue(h)).toBe('');
  });
  it('rejects a hidden locator twin inserted after preparation', async () => {
    const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}"></main>`);
    const prepared = await prep(h, FILL);
    await h.page.locator('main').evaluate((element) => {
      const twin = document.createElement('input');
      twin.setAttribute('aria-label', 'Approved field');
      element.appendChild(twin);
    });
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'NEVER_FILL' }))).toBe('TARGET_CHANGED');
    expect(await h.page.locator('input').evaluateAll((all) => all.map((one) => (one as HTMLInputElement).value))).toEqual(['', '']);
  });
  it('refuses a cross-origin/document race and disposed capture context', async () => {
    const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="private"></main>`);
    const prepared = await prep(h, FILL);
    await h.page.goto('about:blank');
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'X' }))).toBe('TARGET_CHANGED');
    await h.session.dispose();
    expect(await codeOf(invoke(h, prepared, FILL, { value: 'X' }))).toBe('CONTEXT_LOST');
  });
  it.each([['empty', ''], ['whitespace', '   '], ['oversize', 'x'.repeat(4097)], ['invalid Unicode', '\ud800']])('refuses %s reads', async (_label, value) => {
    const h = await ready(CELL('seed'));
    await h.page.locator('td').evaluate((element, text) => {
      element.textContent = text;
    }, value);
    if (value === '\ud800') {
      expect(await codeOf(h.session.observe(undefined, false))).toBe('INVALID_UNICODE');
      return;
    }
    const exported = await h.session.observe(undefined, false);
    if (!Object.values(exported.observation.facts).some((fact) => fact.name === FIELD)) return;
    const rule = readRuleOf(exported);
    const control = new TestControl();
    expect(await codeOf(invoke(h, await prep(h, readOf(rule), { exported }), readOf(rule), { readRuleId: rule, control }))).toBe('POLICY_DENIED');
    expect(control.fenced).toBe(0);
  });
  it('checks lowered UTF-8 byte limit on the exact read', async () => {
    const h = await ready(CELL('éé'));
    const exported = await h.session.observe(undefined, false);
    const rule = readRuleOf(exported);
    const control = new TestControl();
    expect(await codeOf(invoke(h, await prep(h, readOf(rule), { exported }), readOf(rule), { readRuleId: rule, maxValueBytes: 3, control }))).toBe('POLICY_DENIED');
    expect(control.fenced).toBe(0);
  });
  it('produces native CSS hover and trusted mouse click sequencing', async () => {
    const h = await ready('<style>button:hover{background-color:rgb(1,2,3)}</style><button aria-label="Approved field" onclick="document.body.dataset.trusted=String(event.isTrusted)">Native button</button>');
    await run(h, { kind: 'hover' });
    expect(await h.page.locator('button').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(1, 2, 3)');
    await run(h, { kind: 'click' });
    expect(await h.page.locator('body').getAttribute('data-trusted')).toBe('true');
  });
  it('implements native Tab and prevented Enter default behavior', async () => {
    const h = await ready('<form onsubmit="event.preventDefault();document.body.dataset.submitted=String(event.isTrusted)"><input aria-label="Approved field"><button>Submit</button></form>');
    await run(h, { kind: 'press', key: 'Tab' });
    expect(await h.page.locator('button').evaluate((e) => e === document.activeElement)).toBe(true);
    await run(h, { kind: 'press', key: 'Enter' });
    expect(await h.page.locator('body').getAttribute('data-submitted')).toBe('true');
  });
  it('implements native Arrow selection and trusted check/uncheck without duplicate no-op effects', async () => {
    const h = await ready('<textarea aria-label="Approved field">first line\nsecond line</textarea>');
    await h.page.locator('textarea').evaluate((e) => {
      (e as HTMLTextAreaElement).setSelectionRange(0, 0);
    });
    await run(h, { kind: 'press', key: 'ArrowDown' });
    expect(await h.page.locator('textarea').evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBeGreaterThan(0);
    await run(h, { kind: 'press', key: 'ArrowUp' });
    expect(await h.page.locator('textarea').evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBe(0);
    const check = await ready('<input type="checkbox" aria-label="Approved field" onchange="document.body.dataset.changes=String(Number(document.body.dataset.changes||0)+1);document.body.dataset.changed=String(event.isTrusted)">');
    await run(check, { kind: 'check' });
    expect(await check.page.locator('input').isChecked()).toBe(true);
    expect(await check.page.locator('body').getAttribute('data-changed')).toBe('true');
    await run(check, { kind: 'check' });
    expect(await check.page.locator('body').getAttribute('data-changes')).toBe('1');
    await run(check, { kind: 'uncheck' });
    expect(await check.page.locator('input').isChecked()).toBe(false);
  });
  it('allows native Escape to dismiss a modal dialog and respects prevented keyboard defaults', async () => {
    const modal = await ready('<dialog><input aria-label="Approved field"></dialog><script>document.querySelector("dialog").showModal()</script>');
    await run(modal, { kind: 'press', key: 'Escape' });
    await expect.poll(() => modal.page.locator('dialog').evaluate((e) => (e as HTMLDialogElement).open)).toBe(false);
    const blocked = await ready('<form onsubmit="document.body.dataset.submitted=1;event.preventDefault()"><input aria-label="Approved field" onkeydown="event.preventDefault()"><button>Submit</button></form>');
    await run(blocked, { kind: 'press', key: 'Enter' });
    expect(await blocked.page.locator('body').getAttribute('data-submitted')).toBeNull();
  });
  it('stops uncertain after focus theft or a mouseover overlay and does not click a replacement', async () => {
    const focus = await ready('<input aria-label="Approved field" onfocus="document.querySelector(\'button\').focus()"><button>Steal focus</button>');
    expect(await codeOf(run(focus, { kind: 'press', key: 'Enter' }))).toBe('UNKNOWN_OUTCOME');
    const hover = await ready('<button aria-label="Approved field" onmouseover="this.outerHTML=\'<button onclick=&quot;document.body.dataset.clicked=1&quot;>Replacement</button>\'">First target</button>');
    // The hover of the executor's non-committing pre-flight already fires the handler, so the replacement ends before the fence (no effect).
    expect(['TARGET_CHANGED', 'UNKNOWN_OUTCOME']).toContain(await codeOf(run(hover, { kind: 'click' })));
    expect(await hover.page.locator('body').getAttribute('data-clicked')).toBeNull();
  });

  it('requires a positive region grant without treating generic discovery or application consent as a field override', async () => {
    const markup = CELL('nonsecret');
    const none = await ready(markup, { readProfile: { policyRuleId: 'observed-structure-v1', allowStructuralDiscovery: true, readGrants: [] } });
    expect(readRuleOf(await none.session.observe(undefined, false))).toBeNull();
    expect(await prepareCode(none, readOf(null))).toBe('READ_NOT_ALLOWED');
    const granted = await ready(markup);
    const exported = await granted.session.observe(undefined, false);
    const rule = readRuleOf(exported);
    expect(await invoke(granted, await prep(granted, readOf(rule), { exported }), readOf(rule), { readRuleId: rule })).toEqual({ value: 'nonsecret' });
    // No grant reads a field value: a controlValue recipe is refused even under the application grant.
    expect(await prepareCode(granted, readOf(rule, 'controlValue'))).toBe('READ_NOT_ALLOWED');
    const field = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="nonsecret"></main>`);
    expect(await prepareCode(field, readOf(readRuleOf(await field.session.observe(undefined, false))))).toBe('READ_NOT_ALLOWED');
    const replaced = await ready(markup);
    const prepared = await prep(replaced, readOf(rule));
    await replaced.page.locator('main').evaluate((element) => {
      element.replaceWith(element.cloneNode(true));
    });
    expect(await codeOf(invoke(replaced, prepared, readOf(rule), { readRuleId: rule }))).toBe('TARGET_CHANGED');
  });
  it('rejects the entire region text source with hidden/sensitive/field descendants and private text echoes', async () => {
    for (const descendant of ['<span hidden>private</span>', '<span data-sensitive>private</span>', '<input type="password" value="private">']) {
      const h = await ready(CELL(`Public part${descendant}`));
      const exported = await h.session.observe(undefined, false);
      const shown = Object.values(exported.observation.facts).some((fact) => fact.name === FIELD);
      if (!shown) {
        expect(exported.json).not.toContain('private');
        continue;
      }
      if (descendant.includes('hidden')) {
        // innerText never includes a hidden descendant, so the read is eligible and returns the visible part only.
        const rule = readRuleOf(exported);
        const read = await invoke(h, await prep(h, readOf(rule), { exported }), readOf(rule), { readRuleId: rule });
        expect(read).toEqual({ value: 'Public part' });
        continue;
      }
      expect(await prepareCode(h, readOf(readRuleOf(exported)))).toBe('READ_NOT_ALLOWED');
    }
  });
  it('prefers a unique region over application grants and denies equal-priority overlaps', async () => {
    // The read profile has one application grant per whitelist entry. Two grants for the entry give no single winner, so the
    // page has no read grant at all and a read is refused; a single grant reads.
    const profile = observationReadProfile(TEST_DOMAINS);
    const first = profile.readGrants?.find((grant) => grant.domain === 'localhost');
    if (first === undefined) throw new Error('GRANT');
    const overlap = await ready(CELL('nonsecret'), { readProfile: { ...profile, readGrants: [first, { ...first, policyRuleId: 'other-app-read' }] } });
    expect(readRuleOf(await overlap.session.observe(undefined, false))).toBeNull();
    expect(await prepareCode(overlap, readOf('other-app-read'))).toBe('READ_NOT_ALLOWED');
    const single = await ready(CELL('nonsecret'));
    const exported = await single.session.observe(undefined, false);
    expect(readRuleOf(exported)).toBe(first.policyRuleId);
    expect(await invoke(single, await prep(single, readOf(first.policyRuleId), { exported }), readOf(first.policyRuleId), { readRuleId: first.policyRuleId })).toEqual({ value: 'nonsecret' });
  });

  it('erases the private masking inventory and refuses late repopulation after disposal', async () => {
    const inventories = new Set<PrivateInventory>();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the original is invoked with .call(this, ...) in the wrapper below.
    const original = PrivateInventory.prototype.withhold;
    const spy = vi.spyOn(PrivateInventory.prototype, 'withhold').mockImplementation(function (this: PrivateInventory, values: readonly string[]) {
      inventories.add(this);
      original.call(this, values);
    });
    try {
      const h = await ready(`<main aria-label="Operations"><button>Other</button></main>`);
      await h.session.withhold?.(['PRIVATE-CAPTURE-CANARY']);
      expect([...inventories].some((inventory) => inventory.snapshot().some(([value]) => value === 'PRIVATE-CAPTURE-CANARY'))).toBe(true);
      const exported = await h.session.observe(undefined, false);
      const prepared = await prep(h, { kind: 'click' }, { name: 'Other', exported });
      await h.session.dispose();
      for (const inventory of inventories) {
        let entries: unknown[] | null = null;
        try {
          entries = inventory.snapshot();
        } catch {
          entries = null;
        }
        expect(entries === null || entries.length === 0).toBe(true);
      }
      expect(await codeOf(h.session.withhold?.(['LATE-CANARY']) ?? Promise.resolve())).toBe('CONTEXT_LOST');
      for (const inventory of inventories) {
        let entries: unknown[] | null = null;
        try {
          entries = inventory.snapshot();
        } catch {
          entries = null;
        }
        expect(entries === null || entries.length === 0).toBe(true);
      }
      expect(await codeOf(invoke(h, prepared, { kind: 'click' }))).toBe('CONTEXT_LOST');
    } finally {
      spy.mockRestore();
    }
  });

  it('permits benign focus styling but never writes after focus retypes, detaches or steals the pinned field', async () => {
    const positive = await ready('<style>.focused{border-color:blue}</style><input aria-label="Approved field" onfocus="this.classList.add(\'focused\')">');
    await run(positive, FILL, { value: 'EXPECTED-FILL' });
    expect(await inputValue(positive)).toBe('EXPECTED-FILL');
    for (const handler of ["this.type='password'", "this.type='hidden'", 'this.readOnly=true', 'this.disabled=true', 'this.replaceWith(this.cloneNode())', "document.querySelector('button').focus()"]) {
      const h = await ready(`<input aria-label="Approved field" onfocus="${handler}"><button>Other control</button>`);
      expect(await codeOf(run(h, FILL, { value: 'MUST-NOT-WRITE' }))).toBe('UNKNOWN_OUTCOME');
      expect(await inputValue(h)).toBe('');
    }
  });

  it('asserts readonly/disabled nonsecret values without granting password/hidden access', async () => {
    for (const attribute of ['readonly', 'disabled']) {
      const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="expected" ${attribute}></main>`);
      expect(await run(h, HAS_VALUE, { value: 'expected' })).toEqual({ assertionPassed: true });
    }
    for (const type of ['password', 'hidden']) {
      const h = await ready(`<main aria-label="Operations"><input aria-label="${FIELD}" value="expected"></main>`);
      const prepared = await prep(h, HAS_VALUE);
      await h.page.locator('input').evaluate((e, kind) => {
        e.setAttribute('type', kind);
      }, type);
      expect(await codeOf(invoke(h, prepared, HAS_VALUE, { value: 'expected' }))).toBe(type === 'password' ? 'PASSWORD_CONTROL_READ_REFUSED' : 'TARGET_CHANGED');
    }
  });

  it.each(['click', 'hover', 'check', 'press'] as const)('reveals the retained below-fold target before native %s', async (kind) => {
    const receipt = 'document.body.dataset.receipt=String(event.isTrusted)';
    const element = kind === 'check' ? `<input type="checkbox" aria-label="Approved field" onchange="${receipt}">` : kind === 'press' ? `<input aria-label="Approved field" onkeydown="${receipt}">` : `<button aria-label="Approved field" ${kind === 'hover' ? 'onmouseover' : 'onclick'}="${receipt}">Perform action</button>`;
    const h = await ready(`<div style="height:2200px"></div>${element}`);
    await h.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const operation: Operation = kind === 'press' ? { kind, key: 'Enter' } : { kind };
    const prepared = await prep(h, operation);
    expect(await h.page.evaluate(() => window.scrollY)).toBe(0);
    await invoke(h, prepared, operation);
    expect(await h.page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await h.page.locator('body').getAttribute('data-receipt')).toBe('true');
  });
  it('reveals an unchanged target inside nested scrolling containers without reacquiring it', async () => {
    const h = await ready('<section style="height:150px;width:500px;overflow:auto"><div style="height:1200px"></div><section style="height:100px;overflow:auto"><div style="height:900px"></div><button aria-label="Approved field" onclick="document.body.dataset.receipt=String(event.isTrusted)">Perform action</button></section></section>');
    await run(h, { kind: 'click' });
    expect(await h.page.locator('body').getAttribute('data-receipt')).toBe('true');
    expect(await h.page.locator('section').evaluateAll((elements) => elements.every((element) => element.scrollTop > 0))).toBe(true);
  });
  it.each([['check', true], ['uncheck', false]] as const)('does not scroll an already satisfied offscreen %s', async (kind, checked) => {
    const h = await ready(`<div style="height:2200px"></div><input type="checkbox" aria-label="Approved field" ${checked ? 'checked' : ''} onchange="document.body.dataset.changed=1">`);
    await h.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const prepared = await prep(h, { kind });
    await invoke(h, prepared, { kind });
    expect(await h.page.evaluate(() => window.scrollY)).toBe(0);
    expect(await h.page.locator('body').getAttribute('data-changed')).toBeNull();
  });
  it('stops uncertain after a scroll handler replaces the retained target, without clicking the replacement', async () => {
    const h = await ready('<div style="height:2200px"></div><button aria-label="Approved field" onclick="document.body.dataset.clicked=1">Perform action</button><script>addEventListener("scroll",()=>{const button=document.querySelector("button");const replacement=button.cloneNode(true);replacement.setAttribute("data-replacement","true");button.replaceWith(replacement);},{once:true});</script>');
    await h.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    // The executor's non-committing pre-flight scrolls the target into view, which fires the handler before the fence.
    expect(['TARGET_CHANGED', 'UNKNOWN_OUTCOME']).toContain(await codeOf(run(h, { kind: 'click' })));
    expect(await h.page.locator('button').getAttribute('data-replacement')).toBe('true');
    expect(await h.page.locator('body').getAttribute('data-clicked')).toBeNull();
  });
});

describe('QA session privacy and native toggle postconditions', () => {
  it.each(['password', 'text'])('withholds uncaptured %s bytes and aliases after removal and navigation', async (type) => {
    const secret = 'QA_PRIOR_  private​\n token';
    const alias = 'QA_PRIOR_ private token';
    const h = await ready('<input aria-label="Approved field" type="text"><button>Continue</button>');
    await h.page.locator('input').evaluate((e, args) => {
      e.setAttribute('type', args.type);
      (e as HTMLInputElement).value = args.secret;
    }, { secret, type });
    // The control value must be discovered automatically; an explicit withhold seed would
    // defeat this uncaptured-value retention oracle.
    // Native text/password inputs remove line breaks from an assigned value.
    expect((await h.page.locator('input').inputValue()) === secret.replace(/[\r\n]/gu, '')).toBe(true);
    const first = await h.session.observe(undefined, false);
    expect(JSON.stringify(first)).not.toContain('QA_PRIOR_');
    await h.page.setContent(`<button>${alias}</button>`);
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('QA_PRIOR_');
    await h.page.goto(`${h.origin}/next`);
    await h.page.setContent(`<button>${alias}</button>`);
    expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('QA_PRIOR_');
    await h.session.dispose();
    await expect(h.session.observe(undefined, false)).rejects.toThrow();
    await expect(h.session.withhold?.(['LATE_PRIVATE'])).rejects.toThrow();
  });
  it('fails closed persistently on private inventory count/byte overflow instead of evicting earlier bytes', async () => {
    for (const values of [Array.from({ length: 4097 }, (_, i) => `secret-${String(i)}`), Array.from({ length: 260 }, (_, i) => `${String(i)}-${'x'.repeat(4096)}`)]) {
      const h = await ready('<input aria-label="Approved field" value="EARLIER_SECRET">');
      await expect(h.session.withhold?.(values)).rejects.toThrow('CONTEXT_LOST');
      await h.page.goto(`${h.origin}/next`);
      await h.page.setContent('<button>EARLIER_SECRET</button>');
      await expect(h.session.observe(undefined, false)).rejects.toThrow();
      await expect(h.session.withhold?.(['new'])).rejects.toThrow();
    }
  });
  it.each(['event.preventDefault()', 'this.checked=false', 'this.replaceWith(this.cloneNode())', "this.type='radio'"])('does not report a prevented/reverted/replaced checkbox as success: %s', async (handler) => {
    const h = await ready(`<input type="checkbox" aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1;${handler}">`);
    expect(await codeOf(run(h, { kind: 'check' }))).toBe('UNKNOWN_OUTCOME');
    expect(await h.page.evaluate(() => Reflect.get(window, 'receipt') as unknown)).toBe(1);
  });
  it('refuses radio uncheck during preparation and before any native input while allowing radio check', async () => {
    const h = await ready('<input type="radio" checked aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1">');
    const refusal = await rejection(run(h, { kind: 'uncheck' }));
    expect(refusal).not.toBeNull();
    expect(await h.page.locator('input').isChecked()).toBe(true);
    expect(await h.page.evaluate(() => Reflect.get(window, 'receipt') as unknown)).toBeUndefined();
    const unchecked = await ready('<input type="radio" aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1">');
    await run(unchecked, { kind: 'check' });
    expect(await unchecked.page.locator('input').isChecked()).toBe(true);
    expect(await unchecked.page.evaluate(() => Reflect.get(window, 'receipt') as unknown)).toBe(1);
  });
});

it('poisons later observation after an unexpected collector error instead of forgetting prior inventory', async () => {
  const h = await ready('<button aria-label="Approved field">Seed</button>');
  await h.session.withhold?.(['PRIVATE_BEFORE_ERROR']);
  await h.page.locator('button').evaluate((e) => {
    e.textContent = '\ud800';
  });
  expect(await codeOf(h.session.observe(undefined, false))).toBe('INVALID_UNICODE');
  await h.page.goto(`${h.origin}/next`);
  await h.page.setContent('<button>PRIVATE_BEFORE_ERROR</button>');
  await expect(h.session.observe(undefined, false)).rejects.toThrow();
});

it('keeps explicit sensitive-region text private after the region is gone', async () => {
  const h = await ready('<section data-sensitive><span>PRIVATE_REGION_004</span></section><input aria-label="Approved field">');
  expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('PRIVATE_REGION_004');
  await h.page.goto(`${h.origin}/next`);
  await h.page.setContent('<button>PRIVATE_REGION_004</button>');
  expect(JSON.stringify(await h.session.observe(undefined, false))).not.toContain('PRIVATE_REGION_004');
});
