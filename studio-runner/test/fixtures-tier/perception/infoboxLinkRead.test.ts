import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real Chromium types for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser } from 'playwright';

import { guardDist, launchChromium } from './harness.js';
import { html, open, serve, TestControl, type Opened, type Operation, type Served } from './cutover-support.js';

/**
 * A Wikipedia-style infobox: the value of the "Designed by" row is a link, so the data cell holds nothing but that link.
 * The certified table-title row chain ends at the cell, so the cell (not the link) is the readable target.
 */

guardDist();

const PAGE = `<main><p>Python was conceived by <a href="/wiki/Guido_van_Rossum">Guido van Rossum</a> and first released in 1991.</p>
<table><tbody>
<tr><th colspan="2">Python</th></tr>
<tr><th scope="row"><a href="/wiki/Software_design">Designed by</a></th><td><a href="/wiki/Guido_van_Rossum">Guido van Rossum</a></td></tr>
<tr><th scope="row"><a href="/wiki/Typing_discipline">Typing discipline</a></th><td>Duck, dynamic, strong</td></tr>
<tr><th scope="row">Mixed</th><td><a href="/wiki/Guido_van_Rossum">Guido van Rossum</a> (born 1956)</td></tr>
</tbody></table>
<ul><li><a href="/wiki/Guido_van_Rossum">Guido van Rossum</a></li></ul></main>`;

describe('read of a link-valued data cell in a titled table row', () => {
  let browser: Browser;
  let served: Served;
  const opened: Opened[] = [];
  beforeAll(async () => {
    browser = await launchChromium();
    served = await serve({ '/infobox': html(PAGE) });
  });
  afterAll(async () => {
    for (const created of opened.splice(0)) await created.close();
    await browser.close();
    await served.close();
  });

  it('offers the link-only cell as a scoped read target, prepares it, and reads the link text', async () => {
    const created = await open(browser, served, '/infobox');
    opened.push(created);
    const exported = await created.session.observe(undefined, false, { stepText: 'Copy the "Designed by" value from the infobox for Python', targetIntents: ['Designed by'] });
    const facts = Object.entries(exported.observation.facts);
    const cells = facts.filter(([, f]) => f.role === 'cell' && f.text === 'Guido van Rossum' && f.readScope?.tableTitleRef !== undefined);
    expect(cells).toHaveLength(1);
    const [ref, cell] = cells[0] ?? ['', undefined];
    expect(cell?.name).toBe('');
    expect(cell?.evidence).toContain('Python');
    // The link inside the cell keeps its read scope too: the cell (five-step chain) and the link (six-step chain) are both scoped read targets.
    const linkFacts = facts.filter(([, f]) => f.role === 'link' && f.evidence === 'Guido van Rossum Python');
    expect(linkFacts).toHaveLength(1);
    expect(linkFacts[0]?.[1].readScope?.tableTitleRef).toBe(cell?.readScope?.tableTitleRef);
    // A cell with text beside its link is not a link-only cell: nothing new is offered for it.
    expect(facts.filter(([, f]) => f.role === 'cell' && f.evidence.includes('Mixed'))).toEqual([]);
    expect(exported.observation.outline).toMatch(/cell \[e\d+\] \{near="Designed by Python"\}/u);

    const rule = exported.observation.readRuleId;
    if (rule === null) throw new Error('the page has no read grant');
    const operation: Operation = { kind: 'read', bindingId: 'binding', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
    const resolved = await created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation, authoredLiteral: null });
    expect(resolved.identity).toEqual({ role: 'cell', name: null });
    expect(resolved.locator.map(step => step.by)).toEqual(['tag', 'filterHas', 'tag', 'filterHas', 'tag']);
    const identity = { admissionId: 'infobox-read', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'infobox-read', ordinal: 0 }, authority: 'infobox-owner' };
    const result = await created.session.invoke({ invocationIdentity: identity, preparationId: 'infobox-preparation', resolved, operation, resolvedValue: null, origin: exported.observation.origin,
      maxValueBytes: 4096, readRuleId: rule, profile: 'learn', expect: { documentId: exported.observation.documentId, generation: exported.observation.generation } }, new TestControl());
    expect(result).toEqual({ value: 'Guido van Rossum' });
  });
  it('also prepares and reads the sole link of a link-only cell through the six-step chain', async () => {
    const created = await open(browser, served, '/infobox');
    opened.push(created);
    const exported = await created.session.observe(undefined, false, { stepText: 'Copy the "Designed by" value from the infobox for Python', targetIntents: ['Designed by'] });
    const links = Object.entries(exported.observation.facts).filter(([, f]) => f.role === 'link' && f.evidence === 'Guido van Rossum Python');
    expect(links).toHaveLength(1);
    const [ref] = links[0] ?? [''];
    const rule = exported.observation.readRuleId;
    if (rule === null) throw new Error('the page has no read grant');
    const operation: Operation = { kind: 'read', bindingId: 'binding', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
    const resolved = await created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation, authoredLiteral: null });
    expect(resolved.identity).toEqual({ role: 'link', name: 'Guido van Rossum' });
    expect(resolved.locator.map(step => step.by)).toEqual(['tag', 'filterHas', 'tag', 'filterHas', 'tag', 'role']);
    const identity = { admissionId: 'link-read', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'link-read', ordinal: 0 }, authority: 'link-owner' };
    const result = await created.session.invoke({ invocationIdentity: identity, preparationId: 'link-preparation', resolved, operation, resolvedValue: null, origin: exported.observation.origin,
      maxValueBytes: 4096, readRuleId: rule, profile: 'learn', expect: { documentId: exported.observation.documentId, generation: exported.observation.generation } }, new TestControl());
    expect(result).toEqual({ value: 'Guido van Rossum' });
  });

  it('reads the one named link of a cell that shares it with other text, never the whole cell', async () => {
    const created = await open(browser, served, '/infobox');
    opened.push(created);
    const exported = await created.session.observe(undefined, false, { stepText: 'Copy the "Mixed" value from the infobox for Python', targetIntents: ['Mixed'] });
    const links = Object.entries(exported.observation.facts).filter(([, f]) => f.role === 'link' && f.evidence.includes('Mixed') && f.readScope?.tableTitleRef !== undefined);
    expect(links).toHaveLength(1);
    const [ref] = links[0] ?? [''];
    const rule = exported.observation.readRuleId;
    if (rule === null) throw new Error('the page has no read grant');
    const operation: Operation = { kind: 'read', bindingId: 'binding', recipe: { kind: 'visibleText', classification: 'permittedBusinessData', policyRuleId: rule } };
    const resolved = await created.session.prepareTarget({ ref, documentId: exported.observation.documentId, generation: exported.observation.generation, origin: exported.observation.origin, operation, authoredLiteral: null });
    expect(resolved.identity).toEqual({ role: 'link', name: 'Guido van Rossum' });
    expect(resolved.locator.map(step => step.by)).toEqual(['tag', 'filterHas', 'tag', 'filterHas', 'tag', 'role']);
    const identity = { admissionId: 'mixed-read', requestDigest: 'a'.repeat(64), operationHash: 'b'.repeat(64), coordinate: { stepId: 'mixed-read', ordinal: 0 }, authority: 'mixed-owner' };
    const result = await created.session.invoke({ invocationIdentity: identity, preparationId: 'mixed-preparation', resolved, operation, resolvedValue: null, origin: exported.observation.origin,
      maxValueBytes: 4096, readRuleId: rule, profile: 'learn', expect: { documentId: exported.observation.documentId, generation: exported.observation.generation } }, new TestControl());
    expect(result).toEqual({ value: 'Guido van Rossum' });
  });
});
