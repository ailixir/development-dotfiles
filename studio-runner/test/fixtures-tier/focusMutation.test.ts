/**
 * STUDIO-OBS-009 AC-7 FOCUS-MUTATION-01 b (4), real Chromium (T0 ruling A9, rule FM).
 *
 * The primary positive proof. The unit twins (`test/run/observationCollectorInvoke.test.ts`) script MutationObserver records into
 * a DOM stand-in; this file lets a real page's own focus handler mutate a real DOM and runs the collector's `fill` through the same
 * route production uses: `installObservationCollector.toString()` installed in an isolated world over CDP, then `collect` and
 * `invoke`. It reproduces the STUDIO-OBS-015 D5 probe's trigger matrix (`w3-d5-diagnosis01/probe/probe.mjs`: no trigger, `focus`,
 * `input`, `change` mutating an `<output>` elsewhere) with the focus-time mutation placed outside the target and its ancestors.
 *
 * Positive cases write and return `{}`. Every listed negative control still refuses `POST_FOCUS_CHANGED` and writes nothing.
 * The retype / focus-stolen / read-only controls are the unit tier's (`observationCollectorInvoke.test.ts`, kept by name).
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
// eslint-disable-next-line no-restricted-imports -- Real-browser oracle for the collector's in-page `fill`; the production route is `browser.ts`, whose installer this file uses by source text exactly as it does.
import { chromium } from 'playwright';
// eslint-disable-next-line no-restricted-imports -- Types of the same oracle import.
import type { Browser, CDPSession, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installObservationCollector } from '../../src/run/observationCollector.js';
import { observationOptions } from '../../src/run/observationSanitizer.js';

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
  origin = `http://127.0.0.1:${String(address.port)}`;
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
});

/**
 * MAIN > DIV#wrap > FORM#f > SECTION#s > TEXTAREA#destination, with an OUTPUT, an empty portal and a button elsewhere.
 * `handler` runs inside the textarea's `focus` listener, `trigger` names which event it listens to.
 */
const pageWith = (handler: string, trigger = 'focus'): string => `<!doctype html><html><head><title>Operations</title></head><body><main aria-label='Operations'>`
  + `<div id='wrap'><form id='f'><section id='s'><label for='destination'>Destination</label><textarea id='destination'></textarea></section></form></div>`
  + `<output aria-label='Order reference'>${FRESH}</output><div id='portal'></div><button id='submit'>Submit</button></main>`
  + (handler ? `<script>document.getElementById('destination').addEventListener('${trigger}',()=>{${handler}});</script>` : '')
  + `</body></html>`;

interface Attempt { readonly threw: string | null; readonly value: unknown; readonly written: string }

async function fillOnFocus(html: string): Promise<Attempt> {
  current = html;
  const page: Page = await browser.newPage();
  try {
    await page.goto(`${origin}/flow`);
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const tree = await cdp.send('Page.getFrameTree');
    const world = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'focus-mutation', grantUniveralAccess: false });
    const options = observationOptions({ sessionId: 's', scopeHash: 'a'.repeat(64), approvedOrigins: [origin], rules: [], knownSecrets: [], applicationPolicy: { policyRuleId: 'p', allowStructuralDiscovery: true, readGrants: [] } });
    const installed = await cdp.send('Runtime.callFunctionOn', { executionContextId: world.executionContextId, functionDeclaration: installObservationCollector.toString(), arguments: [{ value: options }, { value: [] }], returnByValue: false });
    if (installed.exceptionDetails || !installed.result.objectId) throw new Error(`INSTALL ${installed.exceptionDetails?.exception?.description ?? ''}`);
    const objectId = installed.result.objectId;
    const call = async (declaration: string, argument: unknown): Promise<{ threw: string | null; value: unknown }> => {
      const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: declaration, arguments: [{ value: argument }], returnByValue: true });
      return result.exceptionDetails ? { threw: result.exceptionDetails.exception?.description ?? 'threw', value: null } : { threw: null, value: result.result.value };
    };
    const collected = await call('function(i){return this.collect(i)}', { documentId: 'doc', generation: 1, observedAt: new Date().toISOString() });
    const observation = collected.value as { nodes: { name: string; nodeId: string; documentId: string; generation: number; locatorHints: { exact?: boolean }[] }[] };
    const node = observation.nodes.find((candidate) => candidate.name === 'Destination' && candidate.locatorHints[0]?.exact === true);
    if (!node) throw new Error(`NODE ${JSON.stringify(observation.nodes.map((candidate) => candidate.name))}`);
    const invocation = { target: { nodeId: node.nodeId, documentId: node.documentId, generation: node.generation, locator: node.locatorHints[0] }, operation: { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }, resolvedValue: FRESH, origin, maxValueBytes: 4096 };
    const filled = await call('function(i){return this.invoke(i)}', invocation);
    const written = await page.evaluate(() => (document.getElementById('destination') as HTMLTextAreaElement | null)?.value ?? '<detached>');
    await call('function(){this.dispose()}', null);
    return { threw: filled.threw, value: filled.value, written };
  } finally {
    await page.close();
  }
}

const writes = (attempt: Attempt): void => {
  expect(attempt.threw).toBeNull();
  expect(attempt.value).toEqual({});
  expect(attempt.written).toBe(FRESH);
};
const refuses = (attempt: Attempt): void => {
  expect(attempt.threw).not.toBeNull();
  expect(attempt.threw).toContain('POST_FOCUS_CHANGED');
  expect(attempt.written).not.toBe(FRESH);
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
});

describe('FOCUS-MUTATION-01 on real Chromium: a change to the target or its ancestors still refuses POST_FOCUS_CHANGED and writes nothing', () => {
  it.each(['readonly', 'name', 'autocomplete', 'aria-hidden', 'contenteditable', 'aria-disabled', 'disabled'])('a non-allowlisted attribute set on the target: %s', async (name) => {
    refuses(await fillOnFocus(pageWith(`${target}.setAttribute('${name}','${name === 'aria-hidden' || name === 'aria-disabled' ? 'true' : 'x'}');`)));
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
    refuses(await fillOnFocus(pageWith(`document.querySelector('output').textContent='changed';${target}.setAttribute('aria-expanded','true');${target}.setAttribute('name','other');`)));
  });
});
