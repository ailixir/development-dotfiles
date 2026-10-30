// SPK-07 corpus probe: load every page listed in corpus/sites.json in fresh headless Chromium
// (1280x720) and record HTTP status, title, challenge words and cookie banners.
// usage (from studio-runner/): node evaluation/grounding/corpus/probe.mjs [--only id1,id2] [--url https://x/ ...]
//   --only   probe just these site ids (default: every site in sites.json)
//   --url    ad-hoc probe of the given URLs, printed to stdout, sites.json untouched
// Writes: sites.json (pages[].probe, site.probeVerdict). It never edits `status`/`heldOut`/`rejectReason`.
//
// Second mode: `--random [--seed N] [--count N]` builds the blind "random" stratum (see corpus/README.md):
//   * pool = distinct no-setup real-site URLs of corpus/tasks.draft.jsonl, minus the volatile-feed pages in RANDOM_EXCLUDE_URLS
//   * seeded mulberry32 RNG; each draw picks a pool page uniformly, then one of its interactive aria refs uniformly
//   * GT = `locator('aria-ref=eN').normalize()` converted to the gt.chain format, re-resolved (count 1, same element)
//   * crop = page.screenshot({clip}) around the element box (+margin) with NO page mutation; the outline is drawn on a canvas
//     in a separate about:blank page; output corpus/random/<id>.png, corpus/random/index.json, and the rnd-* task lines are
//     (re)written into corpus/tasks.draft.jsonl (existing rnd-* lines are replaced).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const SITES = new URL('./sites.json', import.meta.url);

// Words that mean a human-verification wall. Hard = found in the title or visible text.
const HARD = [
  /captcha/i, /verify you are (a )?human/i, /are you (a )?(human|robot)/i, /unusual traffic/i,
  /just a moment/i, /checking your browser/i, /attention required/i, /access denied/i,
  /please enable javascript/i, /press (&|and) hold/i, /confirm you are not a robot/i, /bot detection/i,
];
// Soft = present only in markup (invisible reCAPTCHA scripts etc. are common on healthy pages).
const SOFT = [/cf-challenge/i, /challenge-platform/i, /recaptcha/i, /hcaptcha/i, /datadome/i, /px-captcha/i, /turnstile/i];

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const only = flag('--only')?.split(',') ?? null;
const urlAt = args.indexOf('--url');
const adHoc = urlAt < 0 ? [] : args.slice(urlAt + 1).filter((a) => !a.startsWith('--'));

async function probeOne(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const record = { url, probedAt: new Date().toISOString() };
  const t0 = Date.now();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    record.status = response?.status() ?? null;
    record.finalUrl = page.url();
    record.title = await page.title();
    record.loadMs = Date.now() - t0;
    const body = await page.evaluate(() => document.body?.innerText ?? '');
    record.bodyTextLength = body.length;
    const html = await page.content();
    const haystack = `${record.title}\n${body.slice(0, 20000)}`;
    record.hardChallengeWords = HARD.filter((re) => re.test(haystack)).map(String);
    record.softChallengeMarkers = SOFT.filter((re) => re.test(html)).map(String);
    record.cookieBanner = await page.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 40 && r.height > 20 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const known = ['#onetrust-banner-sdk', '#CybotCookiebotDialog', '#usercentrics-root', '#cookie-banner', '.cookie-banner', '#cookiebanner', '[id*="cookie" i]', '[class*="cookie-banner" i]', '[class*="cookie-notice" i]', '[class*="consent" i]', '[role="dialog"]', '[role="alertdialog"]', '[aria-label*="cookie" i]', '[data-nosnippet]'];
      const hits = [];
      for (const sel of known) for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
        if (!/cookie|consent|privacy|gdpr/i.test(text)) continue;
        const buttons = [...el.querySelectorAll('button, a[role="button"], input[type=button], input[type=submit]')].filter(visible).map((b) => (b.innerText || b.value || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6);
        hits.push({ selector: sel, text: text.slice(0, 140), buttons });
      }
      const uniq = []; const seen = new Set();
      for (const h of hits) { if (seen.has(h.text)) continue; seen.add(h.text); uniq.push(h); }
      return uniq.slice(0, 3);
    });
    const snapshot = await page.ariaSnapshot({ mode: 'ai' });
    record.interactiveRefs = (snapshot.match(/^\s*- (button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|menuitem|slider|spinbutton)\b[^\n]*\[ref=e\d+\]/gm) ?? []).length;
    const reasons = [];
    if (record.status === null || record.status >= 400) reasons.push(`HTTP ${String(record.status)}`);
    if (record.hardChallengeWords.length) reasons.push('challenge words in title/visible text');
    if (record.bodyTextLength < 50 && record.interactiveRefs < 10) reasons.push(`visible text only ${String(record.bodyTextLength)} chars (blank page or JS app that did not render)`);
    if (record.interactiveRefs < 3) reasons.push(`only ${String(record.interactiveRefs)} interactive elements`);
    record.failReasons = reasons;
    record.verdict = reasons.length === 0 ? 'pass' : 'fail';
  } catch (error) {
    record.error = String(error.message ?? error).split('\n')[0];
    record.verdict = 'fail';
  } finally {
    await context.close();
  }
  return record;
}


// ---------------------------------------------------------------------------------------------------------------
// --random mode
// ---------------------------------------------------------------------------------------------------------------
const RANDOM_EXCLUDE_URLS = new Set([
  'https://news.ycombinator.com/', 'https://news.ycombinator.com/newest', 'https://en.wikipedia.org/wiki/Main_Page',
  'https://store.steampowered.com/search/?term=portal', 'https://openlibrary.org/search?q=dune',
  'https://forecast.weather.gov/MapClick.php?lat=40.7146&lon=-74.0071',
]);
const INTERACTIVE = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'spinbutton'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Parses the text of a Playwright locator (`getByRole('link', { name: 'x' }).nth(1)`) into the gt.chain format. */
export function locatorStringToChain(source) {
  let i = 0;
  const peek = () => source[i];
  const fail = (m) => { throw new Error(`chain parse: ${m} at ${String(i)} in ${source.slice(0, 120)}`); };
  const ws = () => { while (i < source.length && /\s/u.test(source[i])) i += 1; };
  const ident = () => { const m = /^[A-Za-z_$][\w$]*/u.exec(source.slice(i)); if (!m) fail('identifier'); i += m[0].length; return m[0]; };
  const str = () => {
    const q = source[i]; i += 1; let out = '';
    while (i < source.length && source[i] !== q) {
      if (source[i] === '\\') { i += 1; const c = source[i]; out += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c; } else out += source[i];
      i += 1;
    }
    if (source[i] !== q) fail('unterminated string');
    i += 1; return out;
  };
  const value = () => {
    ws();
    const c = peek();
    if (c === "'" || c === '"' || c === '`') return str();
    if (c === '{') {
      i += 1; const obj = {};
      for (;;) {
        ws(); if (peek() === '}') { i += 1; return obj; }
        const key = /[A-Za-z_$]/u.test(peek()) ? ident() : str(); ws();
        if (peek() !== ':') fail('colon'); i += 1;
        obj[key] = value(); ws();
        if (peek() === ',') i += 1;
      }
    }
    if (c === '[') { i += 1; const arr = []; for (;;) { ws(); if (peek() === ']') { i += 1; return arr; } arr.push(value()); ws(); if (peek() === ',') i += 1; } }
    if (c === '/') {
      let j = i + 1; let inClass = false;
      while (j < source.length && (source[j] !== '/' || inClass)) { if (source[j] === '\\') j += 1; else if (source[j] === '[') inClass = true; else if (source[j] === ']') inClass = false; j += 1; }
      const pattern = source.slice(i + 1, j); i = j + 1;
      const f = /^[a-z]*/u.exec(source.slice(i))[0]; i += f.length;
      return { regex: pattern, ...(f ? { flags: f } : {}) };
    }
    const lit = /^(true|false|null|-?\d+(\.\d+)?)/u.exec(source.slice(i));
    if (lit && !/[A-Za-z_$]/u.test(source[i + lit[0].length] ?? '')) { i += lit[0].length; return lit[1] === 'true' ? true : lit[1] === 'false' ? false : lit[1] === 'null' ? null : Number(lit[0]); }
    return { chain: chainExpr() };
  };
  const chainExpr = () => {
    const calls = [];
    for (;;) {
      ws(); const m = ident(); ws();
      if (peek() !== '(') fail('open paren'); i += 1;
      const args = [];
      for (;;) { ws(); if (peek() === ')') { i += 1; break; } args.push(value()); ws(); if (peek() === ',') i += 1; }
      calls.push({ m, a: args });
      ws();
      if (peek() === '.') { i += 1; continue; }
      return calls;
    }
  };
  const chain = chainExpr(); ws();
  if (i < source.length) fail('trailing input');
  return chain;
}

const PNG_DRAW = async (page, dataUrl, rect) => page.evaluate(async ({ dataUrl, rect }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  const g = canvas.getContext('2d'); g.drawImage(img, 0, 0);
  g.lineJoin = 'round';
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.strokeRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6);
  g.strokeStyle = '#e60026'; g.lineWidth = 3; g.strokeRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6);
  return canvas.toDataURL('image/png');
}, { dataUrl, rect });

async function randomMode(browser) {
  const { resolveChain } = await import(new URL('./verify.mjs', import.meta.url));
  const seed = Number(flag('--seed') ?? 20261026);
  const count = Number(flag('--count') ?? 40);
  const tasksPath = new URL('./tasks.draft.jsonl', import.meta.url);
  const all = readFileSync(tasksPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const kept = all.filter((t) => !t.id.startsWith('rnd-'));
  const siteOf = new Map();
  const pool = [];
  for (const t of kept) {
    if (t.url.startsWith('fixture://') || RANDOM_EXCLUDE_URLS.has(t.url) || (t.setup ?? []).length > 0) continue;
    if (!siteOf.has(t.url)) { siteOf.set(t.url, { site: t.site, heldOut: t.heldOut }); pool.push(t.url); }
  }
  pool.sort();
  console.log(`random pool: ${String(pool.length)} pages, seed ${String(seed)}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const drawPage = await context.newPage(); await drawPage.goto('about:blank');
  const pages = [];
  for (const url of pool) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForTimeout(2500);
      const snapshot = await page.ariaSnapshot({ mode: 'ai' });
      const refs = [];
      for (const line of snapshot.split('\n')) {
        const m = /^\s*- ([a-z]+)\b.*\[ref=(e\d+)\]/u.exec(line);
        if (m && INTERACTIVE.includes(m[1])) refs.push({ role: m[1], ref: m[2] });
      }
      pages.push({ url, page, refs, ...siteOf.get(url) });
      console.log('  loaded', url, 'interactive refs', refs.length);
    } catch (error) { console.log('  SKIP page', url, String(error.message).split('\n')[0]); await page.close(); }
  }
  const rng = mulberry32(seed);
  const accepted = []; const rejected = {}; const seen = new Set();
  const reject = (why) => { rejected[why] = (rejected[why] ?? 0) + 1; };
  mkdirSync(new URL('./random/', import.meta.url), { recursive: true });
  let draws = 0;
  while (accepted.length < count && draws < count * 12) {
    draws += 1;
    const entry = pages[Math.floor(rng() * pages.length)];
    const pick = entry.refs[Math.floor(rng() * entry.refs.length)];
    const key = `${entry.url}#${pick.ref}`;
    if (seen.has(key)) { reject('duplicate draw'); continue; }
    seen.add(key);
    try {
      const target = entry.page.locator(`aria-ref=${pick.ref}`);
      if ((await target.count()) !== 1) { reject('aria-ref not resolvable'); continue; }
      const info = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') ?? '', docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, disabled: el.disabled === true };
      });
      if (info.width < 8 || info.height < 8) { reject('target smaller than 8px'); continue; }
      const normalized = await target.normalize();
      const chain = locatorStringToChain(String(normalized));
      const resolved = resolveChain(entry.page, chain);
      if ((await resolved.count()) !== 1) { reject('normalized chain not unique'); continue; }
      const same = await (await target.elementHandle()).evaluate((a, b) => a === b, await resolved.elementHandle());
      if (!same) { reject('normalized chain resolves to another element'); continue; }
      const mx = 220; const my = 130;
      const x0 = Math.max(0, Math.floor(info.x - mx)); const y0 = Math.max(0, Math.floor(info.y - my));
      const x1 = Math.min(info.docW, Math.ceil(info.x + info.width + mx)); const y1 = Math.min(info.docH, Math.ceil(info.y + info.height + my));
      const clip = { x: x0, y: y0, width: Math.min(x1 - x0, 1280), height: Math.min(y1 - y0, 760) };
      const shot = await entry.page.screenshot({ clip, fullPage: true, type: 'png' });
      const rect = { x: info.x - x0, y: info.y - y0, width: Math.min(info.width, clip.width - (info.x - x0)), height: Math.min(info.height, clip.height - (info.y - y0)) };
      const outlined = await PNG_DRAW(drawPage, `data:image/png;base64,${shot.toString('base64')}`, rect);
      const id = `rnd-${String(accepted.length + 1).padStart(3, '0')}`;
      writeFileSync(new URL(`./random/${id}.png`, import.meta.url), Buffer.from(outlined.split(',')[1], 'base64'));
      let kind = 'click'; let value;
      if (['textbox', 'searchbox', 'spinbutton'].includes(pick.role) || (pick.role === 'combobox' && info.tag !== 'select')) { kind = 'fill'; value = 'spk07'; }
      else if (pick.role === 'combobox') kind = 'selectOption';
      else if (['checkbox', 'radio'].includes(pick.role)) kind = 'check';
      accepted.push({ id, url: entry.url, site: entry.site, heldOut: entry.heldOut, png: `random/${id}.png`, role: pick.role, tag: info.tag, ref: pick.ref, draw: draws, gt: { chain }, operation: { kind, ...(value ? { value } : {}) }, box: { x: Math.round(info.x), y: Math.round(info.y), width: Math.round(info.width), height: Math.round(info.height) }, clip });
    } catch (error) { reject(`error: ${String(error.message).split('\n')[0].slice(0, 80)}`); }
  }
  for (const e of pages) await e.page.close();
  await context.close();

  writeFileSync(new URL('./random/index.json', import.meta.url), `${JSON.stringify({
    seed, rng: 'mulberry32', samplingScheme: 'page uniform over pool, then interactive aria-ref uniform within the page',
    interactiveRoles: INTERACTIVE, pool, excludedUrls: [...RANDOM_EXCLUDE_URLS], draws, rejected, generatedAt: new Date().toISOString(),
    items: accepted.map(({ id, url, png, gt, role, site, heldOut, tag, ref, draw, box, clip, operation }) => ({ id, url, png, gt, role, site, heldOut, tag, ref, draw, operation, box, clip })),
  }, null, 1)}\n`);
  const lines = kept.map((t) => JSON.stringify(t));
  for (const a of accepted) {
    lines.push(JSON.stringify({ id: a.id, site: a.site, url: a.url, stratum: 'random', heldOut: a.heldOut, expect: 'ACTION', setup: [], steps: [{ text: '', operation: a.operation, gt: a.gt }], image: a.png, notes: `blind stratum: steps[0].text is empty until a writer sees only ${a.png}; role ${a.role}` }));
  }
  writeFileSync(tasksPath, `${lines.join('\n')}\n`);
  console.log(`random: accepted ${String(accepted.length)} of ${String(draws)} draws; rejected ${JSON.stringify(rejected)}`);
}

const browser = await chromium.launch({ headless: true });
try {
  if (args.includes('--random')) {
    await randomMode(browser);
  } else if (adHoc.length) {
    for (const url of adHoc) {
      const r = await probeOne(browser, url);
      console.log(JSON.stringify({ url, verdict: r.verdict, status: r.status, title: r.title, hard: r.hardChallengeWords, soft: r.softChallengeMarkers, cookie: r.cookieBanner?.map((c) => c.buttons), refs: r.interactiveRefs, err: r.error }));
    }
  } else {
    const doc = JSON.parse(readFileSync(SITES, 'utf8'));
    for (const site of doc.sites) {
      if (only && !only.includes(site.id)) continue;
      for (const pageEntry of site.pages) {
        pageEntry.probe = await probeOne(browser, pageEntry.url);
        console.log(site.id, pageEntry.key, pageEntry.probe.verdict, pageEntry.probe.status ?? pageEntry.probe.error, JSON.stringify(pageEntry.probe.title));
      }
      site.probeVerdict = site.pages.every((p) => p.probe?.verdict === 'pass') ? 'pass' : 'fail';
    }
    doc.probedAt = new Date().toISOString();
    writeFileSync(SITES, `${JSON.stringify(doc, null, 2)}\n`);
  }
} finally {
  await browser.close();
}
