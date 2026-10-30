/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, Node and browser-page globals (the DRAW and in-world functions run in a page). */
// SPK-07 S4 visual channel: a value-masked, Set-of-Marks screenshot. Screening evidence only.
//
// The raw screenshot is taken harness-side with page.screenshot({animations:'disabled', caret:'hide'}). Masks and marks are
// drawn on a canvas in a SEPARATE about:blank Playwright page (never in the target page, and never with Playwright's `mask`
// option, which injects overlay elements into the page DOM). Mask rectangles are computed in an isolated world from the
// boxes of every control that can hold a value, every [data-sensitive] subtree, every unsupported surface (canvas, video,
// iframe) and every text or attribute that matches a supplied private value. Masks are opaque, so the masked bytes cannot
// depend on any typed value.
import { call } from './cdp.mjs';
import { createMatcher, lightInventory } from './perceive.mjs';

export const MASK_COLOR = '#1f1f1f';
const MASK_PAD = 2;
const MARK_COLORS = ['#e6194b', '#3cb44b', '#0082c8', '#f58231', '#911eb4', '#008080', '#aa6e28', '#800000'];
const BUTTONISH = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'];

const MASK_RECTS = `function(entries) {
  const createMatcher = ${createMatcher.toString()};
  const lightInventory = ${lightInventory.toString()};
  // The same private inventory the outline is scrubbed with (production inventory + supplied values), plus the page's controls right now.
  const matcher = createMatcher([...entries, ...lightInventory()]);
  const BUTTONISH = ${JSON.stringify(BUTTONISH)};
  const BLOCKS = ['block', 'flex', 'grid', 'table-cell', 'list-item', 'flow-root', 'table', 'table-row'];
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  const addRect = (r, why) => {
    if (!r || r.width <= 0 || r.height <= 0) return;
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    if (x1 <= x0 || y1 <= y0) return;
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, why });
  };
  const hit = s => matcher.hit(s);
  const all = (sel) => { try { return this.querySelectorAll(this.parseSelector('css=' + sel), document); } catch (e) { return []; } };
  for (const el of all('input, textarea, select')) {
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? String(el.type || 'text').toLowerCase() : tag;
    if (tag === 'input' && BUTTONISH.includes(type) && !hit(el.value)) continue; // a button's value is its label, masked only if private
    addRect(el.getBoundingClientRect(), tag === 'input' && type === 'password' ? 'password' : 'control');
  }
  for (const el of all('[contenteditable], [role=textbox], [role=searchbox], [role=combobox], [role=spinbox], [role=spinbutton], [role=slider]')) {
    if (el.getAttribute('contenteditable') === 'false') continue;
    const box = el.getBoundingClientRect();
    addRect(box, 'editable');
    // Typed text can overflow a visible-overflow editable: cover every content line over the element's full width (a clipped one cannot show it).
    const overflowing = getComputedStyle(el).overflowY === 'visible';
    const range = document.createRange(); range.selectNodeContents(el);
    if (overflowing) for (const line of range.getClientRects()) addRect({ left: box.left, right: box.right, top: line.top, bottom: line.bottom, width: box.width, height: line.height }, 'editable');
  }
  for (const el of all('[data-sensitive]')) {
    addRect(el.getBoundingClientRect(), 'sensitive');
    let n = 0;
    for (const d of el.querySelectorAll('*')) { if (++n > 500) break; addRect(d.getBoundingClientRect(), 'sensitive'); }
  }
  for (const el of all('canvas, video, iframe, embed, object')) addRect(el.getBoundingClientRect(), 'surface');
  if (matcher.count > 0) {
    // Every rendered text node, open shadow roots included (MDN's result dropdown lives in a shadow root).
    const textRoots = [document.body || document.documentElement];
    for (let i = 0; i < textRoots.length; i++) {
      const root = textRoots[i];
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (!hit(n.data)) continue;
        // The mask must not depend on the typed glyphs: a text range is as wide as the echoed text, so a proportional font would make
        // the mask geometry differ between two values. Mask the containing block (or its full-width lines when it is page-sized).
        let host = n.parentElement;
        while (host && !BLOCKS.includes(getComputedStyle(host).display)) host = host.parentElement;
        const hr = host ? host.getBoundingClientRect() : null;
        if (hr && hr.width * hr.height <= 0.25 * vw * vh) addRect(hr, 'private-text');
        else {
          const range = document.createRange(); range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            if (hr) addRect({ left: hr.left, right: hr.right, top: r.top, bottom: r.bottom, width: hr.width, height: r.height }, 'private-text');
            else addRect(r, 'private-text');
          }
        }
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) textRoots.push(el.shadowRoot);
    }
    for (const el of all('[aria-label], [title], [alt], [placeholder], [value], [aria-valuetext]')) {
      if (['aria-label', 'title', 'alt', 'placeholder', 'value', 'aria-valuetext'].some(a => hit(el.getAttribute(a)))) addRect(el.getBoundingClientRect(), 'private-attribute');
    }
  }
  return { rects: out, viewport: { width: vw, height: vh } };
}`;

// Self-contained: Playwright serializes this function and runs it in the drawing page.
const DRAW = async ({ b64, masks, marks, color, palette }) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const g = canvas.getContext('2d');
  g.drawImage(bitmap, 0, 0);
  g.fillStyle = color;
  for (const m of masks) g.fillRect(Math.floor(m.x), Math.floor(m.y), Math.ceil(m.w), Math.ceil(m.h));
  const font = Math.max(10, Math.round(10 * (marks.scale || 1)));
  g.font = 'bold ' + font + 'px monospace'; g.textBaseline = 'top';
  let drawn = 0;
  for (const m of marks.items) {
    const c = palette[m.k % palette.length];
    g.lineWidth = Math.max(1, marks.scale || 1); g.strokeStyle = c;
    g.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
    const text = m.ref; const tw = Math.ceil(g.measureText(text).width) + 4; const th = font + 2;
    const lx = Math.min(Math.max(0, m.x), canvas.width - tw); const ly = m.y - th >= 0 ? m.y - th : m.y;
    g.fillStyle = c; g.fillRect(lx, ly, tw, th);
    g.fillStyle = '#ffffff'; g.fillText(text, lx + 2, ly + 1);
    drawn++;
  }
  return { b64: canvas.toDataURL('image/png').split(',')[1], width: canvas.width, height: canvas.height, drawn };
};

const drawPages = new WeakMap();
async function drawingPage(page) {
  const browser = page.context().browser();
  if (!browser) throw new Error('VISUAL_NO_BROWSER');
  if (!drawPages.has(browser)) {
    const context = await browser.newContext(); // separate context: no shared cookies, never the target page
    const drawing = await context.newPage();
    await drawing.goto('about:blank');
    drawPages.set(browser, { context, page: drawing });
  }
  return drawPages.get(browser).page;
}

export async function closeDrawingPages(page) {
  const browser = page.context().browser();
  const entry = browser && drawPages.get(browser);
  if (entry) { await entry.context.close().catch(() => undefined); drawPages.delete(browser); }
}

const pngWidth = buffer => buffer.readUInt32BE(16);

/**
 * @param {{ page:object, perceived:{handle:{cdp:object, engine:string}, nodes:object[], byRef:Map, viewport:{width:number,height:number}}, privateValues?:string[], marks?:boolean }} args
 * @returns {Promise<{ mimeType:'image/png', base64:string, bytes:number, width:number, height:number, masks:number, marks:number, maskReasons:Record<string,number> }>}
 */
export async function maskedScreenshot({ page, perceived, privateValues = [], marks = true }) {
  const raw = await page.screenshot({ animations: 'disabled', caret: 'hide', type: 'png' });
  const entries = [...(perceived.inventory ?? []), ...privateValues.filter(v => typeof v === 'string' && v.length > 0).map(v => [v, true])];
  const { rects, viewport } = await call(perceived.handle.cdp, perceived.handle.engine, MASK_RECTS, [entries]);
  const scale = pngWidth(raw) / viewport.width;
  const toPx = r => ({ x: r.x * scale - MASK_PAD, y: r.y * scale - MASK_PAD, w: r.w * scale + 2 * MASK_PAD, h: r.h * scale + 2 * MASK_PAD });
  const masks = rects.map(toPx);
  const items = [];
  if (marks) {
    const area = viewport.width * viewport.height;
    let k = 0;
    for (const [ref, node] of perceived.byRef) {
      if (node.kind !== 'node' || !(node.interactive || node.clickable) || !node.box) continue;
      const { x, y, width, height } = node.box;
      if (width < 2 || height < 2 || x + width <= 0 || y + height <= 0 || x >= viewport.width || y >= viewport.height) continue;
      if (width * height > 0.4 * area) continue; // only small boxes: a page-sized frame carries no grounding signal
      items.push({ ref, x: x * scale, y: y * scale, w: width * scale, h: height * scale, k: k++ });
    }
    items.sort((a, b) => b.w * b.h - a.w * a.h || (a.ref < b.ref ? -1 : 1));
  }
  const drawing = await drawingPage(page);
  const drawn = await drawing.evaluate(DRAW, { b64: raw.toString('base64'), masks, marks: { items, scale }, color: MASK_COLOR, palette: MARK_COLORS });
  const reasons = {};
  for (const r of rects) reasons[r.why] = (reasons[r.why] ?? 0) + 1;
  return { mimeType: 'image/png', base64: drawn.b64, bytes: Buffer.byteLength(drawn.b64, 'base64'), width: drawn.width, height: drawn.height, masks: masks.length, marks: drawn.drawn, maskReasons: reasons };
}
