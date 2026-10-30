/* global document, NodeFilter */
// Captures the AC1 baseline of ADR-SC-007 WI-2: what the SPK-07 spike's perceive.mjs produces, at freeze B, for every
// observed-authoring fixture page and the committed large pages. It writes
//   test/fixtures/perception-parity/baseline.json   outline, derived facts, counters, inventory and the environment fingerprint
//   test/fixtures/perception-parity/collected.json  the raw collected objects (snapshot json, element facts, echo) per page
//
// Usage (spike present, dist/ present, Chromium installed; nothing under evaluation/grounding or dist/ is written):
//   node test/fixtures/perception-parity/capture-spike-baseline.mjs
//
// The spike's own inventory step (privateInventoryFor) is NOT used: it loads the instrumented collector through
// collectorInstrumented.generate(), which rewrites generated/*.meta.json. The inventory is built here exactly as
// privateInventoryFor builds it (production collector under lifted limits, united with the page-side lightInventory), from
// the compiled production collector, read-only, and handed to the spike through perceive({inventory}).
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The spike's collector is read from the WI-3 frozen copy (byte-identical to the dist module the baseline was captured with), because the
// collector itself is deleted from src/ and dist/ by ADR-SC-007 WI-4.
import { installObservationCollector } from '../../../evaluation/grounding/generated/frozen-dist/run/observationCollector.js';
import { verifyFreeze } from '../../../evaluation/grounding/freeze.mjs';
import { baseConfig } from '../../../evaluation/grounding/lib/arms/A1.mjs';
import { call, evaluateHandle, isolatedWorld, session } from '../../../evaluation/grounding/lib/cdp.mjs';
import { LIFTED_LIMITS, LIFTED_WORK_LIMITS } from '../../../evaluation/grounding/lib/collectorInstrumented.mjs';
import { lightInventory, perceive } from '../../../evaluation/grounding/lib/perceive.mjs';
import spikePure from '../spike-pure/spike-pure.cjs';
import spikeFactsModule from './spike-facts.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const FREEZE_B_HARNESS_SHA256 = 'c46e72077cae491c919254b961571842919b4bb80b3dcad963b141b34f8b6388';
const VIEWPORT = { width: 1280, height: 720 };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const { chromium } = createRequire(import.meta.url)('playwright');

function htmlFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFilesUnder(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

export function pageList() {
  const observed = join(root, 'evaluation', 'observed-authoring', 'pages');
  const large = join(here, 'pages');
  return [
    ...htmlFilesUnder(observed).sort().map((file) => ({ id: `observed/${relative(observed, file)}`, file, large: false })),
    ...htmlFilesUnder(large).sort().map((file) => ({ id: `large/${relative(large, file)}`, file, large: true })),
  ];
}

const LARGE_PASSES = {
  'large/large-catalog.html': [
    { id: 'plain', stepText: 'Select "Kenya" in the "Country" menu', targetIntent: 'Country', privateValues: [] },
    { id: 'private', stepText: 'Click the "Read more about item 7" link', targetIntent: 'Read more about item 7', privateValues: ['Kenya'], auto: 2 },
  ],
  'large/large-form.html': [
    { id: 'plain', stepText: 'Type "x" in the "Field 0500" box', targetIntent: 'Field 0500', privateValues: [] },
    { id: 'private', stepText: 'Click the "Submit registration" button', targetIntent: 'Submit registration', privateValues: [], auto: 2 },
  ],
};

function passesFor(spec) {
  return LARGE_PASSES[spec.id] ?? [
    { id: 'plain', stepText: '', targetIntent: '', privateValues: [] },
    { id: 'private', stepText: '', targetIntent: '', privateValues: [], auto: 2 },
  ];
}

/** The first `count` distinct visible text strings of the page (4 or more characters), read in the page itself. */
async function autoPrivateValues(page, count) {
  return page.evaluate((limit) => {
    const seen = [];
    const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && seen.length < limit) {
      const text = node.data.replace(/\s+/g, ' ').trim();
      if (text.length >= 4 && !seen.includes(text)) seen.push(text);
    }
    return seen;
  }, count);
}

async function inventoryFor(cdp) {
  const lightWorld = await isolatedWorld(cdp);
  const lightHandle = await evaluateHandle(cdp, lightWorld, `(${lightInventory.toString()})()`);
  const light = await call(cdp, lightHandle, 'function() { return this; }');
  let production = [];
  let status = 'ok';
  try {
    const base = await baseConfig();
    const options = { ...base, limits: { ...LIFTED_LIMITS }, workLimits: { ...LIFTED_WORK_LIMITS } };
    const world = await isolatedWorld(cdp);
    const handle = await evaluateHandle(cdp, world, `(${installObservationCollector.toString()})(${JSON.stringify(options)}, [])`);
    await call(cdp, handle, 'function(identity) { return this.collect(identity); }', [{ documentId: randomUUID(), generation: 1, observedAt: new Date().toISOString() }]);
    production = await call(cdp, handle, 'function() { return this.privateInventory(); }');
    await call(cdp, handle, 'function() { return this.dispose(); }').catch(() => undefined);
  } catch (error) {
    status = `failed: ${String(error?.message ?? error).split('\n')[0]}`;
  }
  const merged = new Map();
  for (const [value, strict] of [...production, ...light]) merged.set(value, strict === true || merged.get(value) === true);
  return { entries: [...merged], status };
}

function spikeOutputs(perceived) {
  const nodes = perceived.nodes;
  const shownIndexes = [...perceived.shown];
  const refs = spikeFactsModule.spikeFacts(nodes, shownIndexes, spikePure);
  for (const ref of Object.keys(refs)) if (!perceived.byRef.has(ref)) throw new Error(`FACTS_REF_NOT_IN_SPIKE_BYREF ${ref}`);
  return { facts: refs, shownRefs: [...perceived.byRef.keys()] };
}

async function environmentFingerprint(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(readFileSync(join(here, 'fingerprint-probe.html'), 'utf8'));
  const metrics = await page.evaluate(() => Array.from(document.querySelectorAll('#probe span')).map((el) => {
    const rect = el.getBoundingClientRect();
    return [Math.round(rect.width * 1000) / 1000, Math.round(rect.height * 1000) / 1000];
  }));
  await context.close();
  const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'playwright', 'package.json'), 'utf8'));
  return { chromium: browser.version(), playwright: version, platform: process.platform, arch: process.arch, viewport: VIEWPORT, layoutProbeSha256: sha256(JSON.stringify(metrics)) };
}

async function main() {
  const freeze = JSON.parse(readFileSync(join(root, 'evaluation', 'grounding', 'corpus', 'freeze.json'), 'utf8'));
  if (freeze.harness.sha256 !== FREEZE_B_HARNESS_SHA256) throw new Error('FREEZE_IS_NOT_FREEZE_B');
  // The files this baseline runs must be byte-identical to freeze B. Other harness files (request builders, runners) are not
  // part of perception; any that changed since freeze B are recorded, not hidden.
  const grounding = join(root, 'evaluation', 'grounding');
  const mattering = ['lib/perceive.mjs', 'lib/pwEngine.mjs', 'lib/synth.mjs', 'lib/cdp.mjs', 'lib/collectorInstrumented.mjs', 'lib/arms/A1.mjs', 'lib/arms/S3.mjs', 'freeze.mjs'];
  for (const file of mattering) {
    if (sha256(readFileSync(join(grounding, file))) !== freeze.harness.files[file]) throw new Error(`FREEZE_B_DRIFT ${file}`);
  }
  const verified = verifyFreeze();
  const otherDrift = [...verified.errors, ...verified.warnings].filter((message) => !mattering.some((file) => message.includes(file)));
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [] });
  const baseline = {
    schemaVersion: 1,
    freeze: { harnessSha256: freeze.harness.sha256, files: freeze.harness.files, corpusSha256: freeze.sha256, otherHarnessDriftSinceFreezeB: otherDrift },
    distCollectorSha256: sha256(readFileSync(join(root, 'evaluation', 'grounding', 'generated', 'frozen-dist', 'run', 'observationCollector.js'))),
    environment: await environmentFingerprint(browser),
    pages: {},
  };
  const collectedAll = {};
  for (const spec of pageList()) {
    const html = readFileSync(spec.file, 'utf8');
    baseline.pages[spec.id] = { source: relative(root, spec.file), htmlSha256: sha256(html), passes: {} };
    for (const pass of passesFor(spec)) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.setContent(html);
      const cdp = await session(page);
      const privateValues = [...pass.privateValues, ...(pass.auto ? await autoPrivateValues(page, pass.auto) : [])];
      const inventory = await inventoryFor(cdp);
      const box = {};
      const spy = {
        async send(method, params) {
          const result = await cdp.send(method, params);
          if (method === 'Runtime.callFunctionOn' && typeof params?.functionDeclaration === 'string' && params.functionDeclaration.includes('ariaSnapshotJSON')) box.collected = result.result.value;
          return result;
        },
      };
      const perceived = await perceive({ page, cdp: spy, inventory: inventory.entries, privateValues, stepText: pass.stepText, targetIntent: pass.targetIntent, resolveIds: false });
      if (box.collected === undefined) throw new Error('COLLECTED_NOT_CAPTURED');
      const key = JSON.stringify(box.collected);
      if (collectedAll[spec.id] === undefined) collectedAll[spec.id] = box.collected;
      else if (JSON.stringify(collectedAll[spec.id]) !== key) throw new Error(`COLLECTED_DIFFERS_BETWEEN_PASSES ${spec.id}`);
      const { facts, shownRefs } = spikeOutputs(perceived);
      baseline.pages[spec.id].passes[pass.id] = {
        stepText: pass.stepText, targetIntent: pass.targetIntent, privateValues, inventory: inventory.entries, inventoryStatus: inventory.status,
        outline: perceived.outline, facts, shownRefs,
        counters: {
          withheldPrivate: perceived.meta.withheldPrivate, withheldKept: perceived.meta.withheldKept, withheldSensitive: perceived.meta.withheldSensitive,
          echoScrubbed: perceived.meta.echoScrubbed, valuesStripped: perceived.meta.valuesStripped, unsupported: perceived.meta.unsupported, passwordControls: perceived.meta.passwordControls,
        },
        projection: { projected: perceived.meta.projected, tier: perceived.meta.projectionTier, notShown: perceived.meta.notShown, unprojectedBytes: perceived.meta.unprojectedBytes, bytes: perceived.meta.bytes },
      };
      await context.close();
      console.log(`${spec.id} ${pass.id}: ${String(perceived.meta.bytes)} bytes, projected=${String(perceived.meta.projected)}, inventory ${String(inventory.entries.length)} (${inventory.status})`);
    }
  }
  await browser.close();
  writeFileSync(join(here, 'baseline.json'), `${JSON.stringify(baseline, null, 1)}\n`);
  writeFileSync(join(here, 'collected.json'), `${JSON.stringify(collectedAll)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
