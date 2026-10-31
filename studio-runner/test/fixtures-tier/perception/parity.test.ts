import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { perceive, perceiveCollected, internalsOf } from '../../../src/run/perceive.js';
import { collectPage, type CollectedPage } from '../../../src/run/perceptionInPage.js';
import { openEngine, runOnEngine } from '../../../src/run/playwrightEngine.js';
import { PrivateInventory } from '../../../src/run/privateInventory.js';
import { differencesFrom, loadBaseline, loadCollected, loadDifferences, sha256 } from '../../fixtures/perception-parity/parity.js';
import { validatePublicObservation } from '../../../src/validator/observedSnapshots.js';
import { shownRefsOf } from '../../../src/validator/outlineRefs.js';
import { packageRoot } from '../../helpers/corpus.js';
import { cdpOf, environmentFingerprint, guardDist, launchChromium, openPage } from './harness.js';

/**
 * AC1 layer 2 (ADR-SC-007 WI-2): the live perception of every observed-authoring fixture page and the committed large pages
 * against the spike's output at freeze B, in the browser the baseline was captured with. Layout (near / in / headers)
 * depends on the browser and its fonts, so the environment fingerprint must match and a mismatch FAILS: it is never skipped.
 * The portable half of the comparison (layer 1) runs in the default tier, in test/run/perceive.test.ts.
 */

guardDist();

const baseline = loadBaseline();
const collected = loadCollected();
const differences = loadDifferences() as unknown as {
  outline: Record<string, { removed: string[]; added: string[] }>;
  facts: Record<string, Record<string, { fields: string[] }>>;
  siblings: Record<string, Record<string, string>>;
};
const cases = Object.entries(baseline.pages).flatMap(([id, entry]) => Object.entries(entry.passes).map(([passId, pass]) => ({ id, passId, key: `${id}|${passId}`, pass, source: entry.source, htmlSha256: entry.htmlSha256 })));

describe('AC1 layer 2: live parity with the spike baseline', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('runs in the environment the baseline was captured in (a mismatch is a failure, not a skip)', async () => {
    const live = await environmentFingerprint(browser);
    expect(live, 'Re-capture the baseline on this machine: node test/fixtures/perception-parity/capture-spike-baseline.mjs').toEqual(baseline.environment);
  });

  it.each(cases.map((c) => [c.key, c] as const))('%s', async (_key, c) => {
    const html = readFileSync(join(packageRoot, c.source), 'utf8');
    // The spike's recorded facts predate frameTitle (layer 1 prints the nameless iframe line); only the live collection carries the frame's title.
    const titled = c.key.startsWith('observed/e3/frame.html');
    expect(sha256(html), 'the page changed since the baseline was captured').toBe(c.htmlSha256);
    const page = await openPage(browser, html);
    try {
      const cdp = await cdpOf(page);
      // the in-page port collects exactly what the spike's COLLECT program collected (boxes included)
      const probe = await openEngine(cdp);
      const live = await runOnEngine(probe, collectPage) as CollectedPage;
      const originalFacts = Object.fromEntries(Object.entries(live.facts).map(([ref, fact]) => {
        // Only the internal native certificates and markers are outside frozen COLLECT's shape (directValueOnly marks a native input's own value, frameTitle carries an iframe's title for the withholding match).
        return [ref, Object.fromEntries(Object.entries(fact).filter(([key]) => !['nativeTextRoot','scopeRefs','readScope','directValueOnly','frameTitle'].includes(key)))];
      }));
      expect({ ...live, facts: originalFacts }).toEqual(collected[c.id]);
      const inventory = new PrivateInventory();
      inventory.merge(c.pass.inventory);
      const started = performance.now();
      const perception = await perceive({
        cdp, inventory, privateValues: c.pass.privateValues, stepText: c.pass.stepText, targetIntents: [c.pass.targetIntent], resolveBackendIds: false,
      });
      const elapsed = performance.now() - started;
      expect(elapsed, `${c.key} took ${String(Math.round(elapsed))} ms`).toBeLessThan(10_000);
      validatePublicObservation({ outline: perception.outline.text, facts: Object.fromEntries(Object.entries(perception.facts).map(([ref, fact]) => [ref, { ...fact, evidenceSegments: perception.evidenceSegments[ref] ?? [] }])) } as never);
      const internal = internalsOf(perception);
      // Compare the old fields while independently checking every new native/ordinal certificate.
      // New READ_ASSERT_ONLY context is appended, so removing its exact marked segment preserves
      // the original evidence bytes and offsets. No private or clipped text is reconstructed.
      const oldFacts = Object.fromEntries(Object.entries(perception.facts).map(([ref, fact]) => {
        const native = live.facts[ref]?.nativeTextRoot;
        const oldRole = c.pass.facts[ref]?.role;
        if (native && fact.role !== oldRole && oldRole === 'text') expect(fact.role).toBe(native);
        const marked = perception.evidenceSegments[ref]?.find(part => part.purpose === 'READ_ASSERT_ONLY');
        return [ref, { ...fact, role: native && oldRole === 'text' ? 'text' : fact.role, evidence: marked ? fact.evidence.slice(0, Math.max(0, marked.start - 1)) : fact.evidence }];
      }));
      const oldOutline = perception.outline.text.split('\n').map(line => {
        const ref = [...shownRefsOf(line)][0];
        const n = ref ? internal?.byRef.get(ref) : undefined;
        let result = line.replace(/ \{ordinal=[0-9]+\/[0-9]+\}/gu, '');
        if (ref && live.facts[ref]?.nativeTextRoot && c.pass.facts[ref]?.role === 'text') {
          const content = /^(\s*)- (?:paragraph|strong) \[(e[0-9]+)\] \{text=("(?:[^"\\]|\\.)*")\}(.*)$/u.exec(result);
          result = content ? `${content[1] ?? ''}- text ${content[3] ?? ''} [${content[2] ?? ''}]${content[4] ?? ''}` : result.replace(/- (?:paragraph|strong)(?= |$)/u, '- text');
        }
        if (n?.nearReadOnly) result = result.replace(/ \{near="(?:[^"\\]|\\.)*"\}/gu, '');
        return result;
      }).join('\n');
      const oldSegments = Object.fromEntries(Object.entries(perception.evidenceSegments).map(([ref, parts]) => [ref, parts.filter(p => p.purpose === undefined)]));
      const actual = differencesFrom(c.pass, { outline: oldOutline, facts: oldFacts, segments: oldSegments });
      const dropped = Object.keys(c.pass.facts).filter(ref => perception.facts[ref] === undefined);
      if (dropped.length) {
        expect(['large/large-form.html|private','large/large-catalog.html|private']).toContain(c.key);
        const complete = perceiveCollected(live, inventory.matcher(c.pass.privateValues), { maxBytes: 1000000 });
        for (const ref of dropped) {
          const full = complete.facts[ref]; expect(full).toBeDefined();
          if (full?.ordinal) {
            const peers = Object.entries(complete.facts).filter(([, f]) => f.role === full.role && f.name === full.name && f.evidence === full.evidence);
            expect(peers.length).toBe(full.ordinal.count); expect(peers.every(([peer]) => !perception.facts[peer])).toBe(true);
          } else {
            const sources = [...(full?.scopeRefs ?? []), ...(full?.readScope?.sourceRefs ?? [])];
            expect(sources.length).toBeGreaterThan(0);
            if (!sources.some(source => !perception.facts[source])) {
              // The catalog now accounts the native row/header sources before the same 40KB
              // cut. Ordinary singleton tails may move past that exact truncation frontier.
              expect(c.key).toBe('large/large-catalog.html|private');
              expect(perception.outline.projectionTier).toBe('truncated');
              const frontier = Math.max(...Object.keys(perception.facts).map(shown => complete.byRef.get(shown)?.i ?? -1));
              expect(complete.byRef.get(ref)?.i).toBeGreaterThan(frontier);
            }
          }
        }
        const allowed = new Set([...c.pass.outline.split('\n'), ...(differences.outline[c.key]?.added ?? []), ...(titled ? ['    - iframe "Comment form" [e5]'] : [])]);
        for (const line of oldOutline.split('\n')) if (!/^… [0-9]+ more nodes not shown$/u.test(line)) expect(allowed.has(line), line).toBe(true);
      }
      const documentedOutline = differences.outline[c.key];
      const documentedAdded = (documentedOutline?.added ?? []).map(line => titled ? line.replace('- iframe [', '- iframe "Comment form" [') : line);
      if (dropped.length === 0) expect(actual.outline, c.key).toEqual(documentedOutline ? { removed: documentedOutline.removed, added: documentedAdded } : null);
      expect(actual.facts, c.key).toEqual(Object.fromEntries([...Object.entries(differences.facts[c.key] ?? {}).filter(([ref]) => !dropped.includes(ref)).map(([ref, entry]) => [ref, entry.fields]), ...(titled ? [['e5', ['extra']]] : []), ...dropped.map(ref => [ref, ['missing']])]));
      expect(actual.siblings, c.key).toEqual(Object.fromEntries(Object.entries(differences.siblings[c.key] ?? {}).filter(([ref]) => !dropped.includes(ref))));
      expect(perception.outline.projected).toBe(c.pass.projection.projected);
      expect(perception.outline.projectionTier).toBe(c.pass.projection.tier);
      expect(perception.outline.bytes).toBeLessThanOrEqual(40_000);
      if (!documentedOutline) {
        for (const name of ['withheldPrivate', 'withheldKept', 'withheldSensitive', 'echoScrubbed', 'valuesStripped', 'unsupported', 'passwordControls'] as const) {
          expect(perception.counters[name], `${c.key} ${name}`).toBe(c.pass.counters[name]);
        }
      }
    } finally {
      await page.context().close();
    }
  });
});
