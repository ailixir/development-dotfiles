// eslint-disable-next-line no-restricted-imports -- Native full-label provenance tier.
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { perceive } from '../../../src/run/perceive.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { collectPage, type CollectedPage } from '../../../src/run/perceptionInPage.js';
import { runOnEngine } from '../../../src/run/playwrightEngine.js';
import { cdpOf, guardDist, launchChromium, openPage } from './harness.js';
guardDist();
describe('complete own labels retain privacy and original bounds', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchChromium(); });
  afterAll(async () => { await browser.close(); });
  it.each(['text', 'search'])('native %s value omission preserves complete empty own text before and after fill', async type => {
    const page = await openPage(browser, `<input type="${type}" aria-label="Recipient"><input type="${type}" aria-label="Delete">`);
    try {
      const inventory = new PrivateInventory(), cdp = await cdpOf(page);
      const inspect = async (): Promise<void> => {
        const p = await perceive({ cdp, inventory });
        for (const name of ['Recipient', 'Delete']) {
          const entry = Object.entries(p.facts).find(([, f]) => f.name === name);
          const fact = entry?.[1];
          expect(fact).toMatchObject({ nameComplete: true, ownTextComplete: true });
          expect(entry && p.evidenceSegments[entry[0]]?.some(s => s.field === 'ownText')).toBe(false);
        }
        const raw = await runOnEngine(p.engine, collectPage) as CollectedPage;
        expect(Object.values(raw.facts).filter(f => f.directValueOnly === 'NATIVE_INPUT_VALUE_ONLY')).toHaveLength(2);
        expect(JSON.stringify({ outline: p.outline, facts: p.facts })).not.toContain('value-canary');
        expect(JSON.stringify({ outline: p.outline, facts: p.facts })).not.toContain('NATIVE_INPUT_VALUE_ONLY');
      };
      await inspect();
      await page.getByRole(type === 'search' ? 'searchbox' : 'textbox', { name: 'Recipient', exact: true }).fill('delete value-canary');
      await page.getByRole(type === 'search' ? 'searchbox' : 'textbox', { name: 'Delete', exact: true }).fill('harmless value-canary');
      await inspect();
      // A destructive accessible name remains public; the excluded destructive VALUE cannot add
      // any own-text evidence or source authorization. Java's ordinary destructive gates stay strict.
    } finally { await page.context().close(); }
  });
  it('recognises only empty pseudo content and rejects unknown or mixed native origins', async () => {
    const page = await openPage(browser, `<style>
      #normal::before { content: normal } #none::after { content: none }
      #empty::before { content: "" } #generated::before { content: "Delete" }
    </style>
    <input id="normal" aria-label="Normal" value="value-canary">
    <input id="none" aria-label="None" value="value-canary">
    <input id="empty" aria-label="Empty" value="value-canary">
    <input id="generated" aria-label="Generated" value="value-canary">
    <input role="textbox" aria-label="Explicit" value="value-canary">
    <input role="button" aria-label="Override" value="value-canary">
    <input aria-label="Owned" aria-owns="owned" value="value-canary"><span id="owned">Delete</span>
    <input id="child" aria-label="Child" value="value-canary">
    <input aria-label="Valued" aria-valuetext="value-canary" value="value-canary">
    <input aria-label="Autocomplete" autocomplete="current-password" value="value-canary">
    <input aria-label="Masked" style="-webkit-text-security:disc" value="value-canary">
    <div data-sensitive><input aria-label="Sensitive" value="value-canary"></div>
    <div contenteditable="true"><input aria-label="EditableAncestor" value="value-canary"></div>
    <textarea aria-label="Multiline">value-canary</textarea>
    <div role="textbox" contenteditable="true" aria-label="Custom">value-canary</div>
    <input type="button" aria-label="NativeButton" value="value-canary">
    <div id="shadow"></div>`);
    try {
      await page.locator('#child').evaluate(el => { el.append(document.createTextNode('Delete')); });
      await page.locator('#shadow').evaluate(el => {
        const root = el.attachShadow({ mode: 'open' });
        root.innerHTML = '<input aria-label="Shadow" value="value-canary"><slot></slot>';
        const slotted = document.createElement('input'); slotted.setAttribute('aria-label', 'Slotted'); slotted.value = 'value-canary'; el.append(slotted);
      });
      const p = await perceive({ cdp: await cdpOf(page), inventory: new PrivateInventory() });
      const raw = await runOnEngine(p.engine, collectPage) as CollectedPage;
      const collectNames = (nodes: CollectedPage['json']): Map<string, string> => {
        const names = new Map<string, string>();
        const walk = (node: CollectedPage['json'][number] | string): void => {
          if (typeof node === 'string') return;
          if (node.ref) names.set(node.ref, node.name ?? '');
          node.children?.forEach(walk);
        }; nodes.forEach(walk); return names;
      };
      const names = collectNames(raw.json);
      const certified = Object.entries(raw.facts).filter(([, f]) => f.directValueOnly !== undefined).map(([ref]) => names.get(ref));
      expect(certified.sort()).toEqual(['Empty', 'None', 'Normal']);
      for (const name of ['Generated', 'Explicit', 'Override', 'Owned', 'Child', 'Valued', 'Multiline', 'Custom', 'Shadow', 'Slotted']) {
        const ref = [...names].find(([, label]) => label === name)?.[0];
        expect(ref, name).toBeDefined(); expect(ref && raw.facts[ref]?.directValueOnly, name).toBeUndefined();
      }
      for (const name of ['Generated', 'Explicit', 'Child', 'Multiline']) {
        expect(Object.values(p.facts).find(f => f.name === name)?.ownTextComplete, name).toBe(false);
      }
      expect(JSON.stringify({ outline: p.outline, facts: p.facts })).not.toContain('value-canary');
    } finally { await page.context().close(); }
  });
  it('combined complete own text refuses truncated destructive union', async () => {
    const page = await openPage(browser, `<button aria-label="Open">${'x'.repeat(300)} delete account</button><button>Continue</button>`);
    try {
      const p = await perceive({ cdp: await cdpOf(page), inventory: new PrivateInventory() });
      expect(Object.values(p.facts).find(f => f.name === 'Open')).toMatchObject({ nameComplete: true, ownTextComplete: false });
      expect(Object.values(p.facts).find(f => f.name === 'Continue')).toMatchObject({ nameComplete: true, ownTextComplete: true });
    } finally { await page.context().close(); }
  });
  it('split-private direct content cannot claim complete empty own text', async () => {
    const page = await openPage(browser, '<button aria-label="Open"><span>sealed</span><span>value</span></button>');
    try {
      const inventory = new PrivateInventory(); inventory.withhold(['sealedvalue']);
      const p = await perceive({ cdp: await cdpOf(page), inventory });
      expect(Object.values(p.facts).some(f => !f.ownTextComplete)).toBe(true);
      expect(p.outline.text).not.toContain('sealed'); expect(p.outline.text).not.toContain('value"');
    } finally { await page.context().close(); }
  });
});
