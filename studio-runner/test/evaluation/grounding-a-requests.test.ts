/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream A: the request builders are faithful ports of the backend. Golden tests against real captured request
 * bodies: providerSchema equality, `sourceReferences` suggestions, and the NEXT_ACTION context projection.
 * Screening evidence only (not ADR-SC-005 D-C evidence).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Reference { referenceKind: string; sourceRevision: string; stepId: string; startUtf16: number; endUtf16: number; kind: string; intendedSlot: string }
interface Step { stepId: string; text: string }
interface Obligation { obligationId?: string; stepId: string; occurrence: number; operationKind: string; targetIntent: string; scopeIntent: string | null; referenceIndex: number | null; needId: string | null; predicate: string | null }
interface Context { sessionId: string; scopeHash: string; sourceRevision: string; configurationRevision: string; sourceSteps: Step[]; configurationReferences: unknown[]; authoringContext: unknown[]; inputs: Record<string, unknown>[]; sourceReferences?: Reference[]; obligations: Obligation[]; needs: unknown[]; observation: unknown; executionEvidence: Record<string, unknown> | null; coordinate: { stepId: string; ordinal: number }; learningWindow?: unknown }
interface Body { contents: { parts: { text: string }[]; role: string }[]; systemInstruction: { parts: { text: string }[]; role: string }; generationConfig: { maxOutputTokens: number; responseMimeType: string; responseJsonSchema: unknown; thinkingConfig: { thinkingLevel: string } } }
interface Requests {
  providerSchema(kind: string): unknown; outputContract(): string; canonical(value: unknown): string;
  sourceReferenceCandidates(steps: Step[], options: { sourceRevision?: string; allows?: (url: string) => boolean }): Reference[];
  literals(text: string): [number, number][]; quotedSpans(text: string): [number, number][]; makeAllows(): (url: string) => boolean; hostOf(url: string): string | null;
  loadTemplate(name: string): Body; templateEnvelope(body: Body): { kind: string; requestId: string; attempt: number; context: Context };
  admitPlan(reply: unknown): { sourceReferences: Reference[]; obligations: Obligation[]; needs: unknown[] };
  buildNextActionRequest(args: Record<string, unknown>): { context: Context; body: Body; inputs: Record<string, unknown>[] };
  buildSourcePlanRequest(args: Record<string, unknown>): { context: Context; body: Body };
  makeSession(task: unknown): Record<string, unknown>; bodyMetrics(body: Body): { gatewayInputAdmitted: boolean; gatewayInputBytes: number; bodyBytes: number; translationInputAdmitted: boolean; translationInputBytes: number };
}
const requests = (await import(new URL('../../evaluation/grounding/lib/requests.mjs', import.meta.url).href)) as Requests;

const CAPTURED = '/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/ae64f648-5f71-4252-a09f-ba8184d1e60f/scratchpad/perf/bench/bodies/';
// The captures live in a past session's scratch directory; once that is emptied (it exists, with no files) the golden cases have nothing to replay and skip.
const HAVE_CAPTURES = existsSync(CAPTURED) && readdirSync(CAPTURED).some(file => file.endsWith('.req.json'));
const loopbackOrAny = (url: string) => /^https?:\/\/127\.0\.0\.1:\d+\//u.test(url) || requests.makeAllows()(url);
const strip = (items: Record<string, unknown>[], key: string) => items.map(item => Object.fromEntries(Object.entries(item).filter(([name]) => name !== key)));

describe('providerSchema(kind) equals the schema the backend sent (GuidedPromptAssembler.buildProviderSchema port)', () => {
  for (const [kind, name] of [['SOURCE_PLAN', 'source-plan'], ['NEXT_ACTION', 'next-action']] as const) {
    it(`${kind}: canonical and key-order equal to the captured template`, () => {
      const template = requests.loadTemplate(name);
      expect(requests.templateEnvelope(template).kind).toBe(kind);
      const mine = requests.providerSchema(kind);
      expect(requests.canonical(mine)).toBe(requests.canonical(template.generationConfig.responseJsonSchema));
      expect(JSON.stringify(mine)).toBe(JSON.stringify(template.generationConfig.responseJsonSchema));
    });
  }
  it('the wire body has the exact generationConfig the gateway client builds (no temperature, LOW thinking, 4096 tokens)', () => {
    const template = requests.loadTemplate('next-action');
    const { context } = requests.templateEnvelope(template);
    const session = { sessionId: context.sessionId, scopeHash: context.scopeHash, scope: { sourceRevision: '1', configurationRevision: '1' }, sourceSteps: context.sourceSteps.map(s => ({ stepId: s.stepId })), manifest: { sourceRevision: '1', configurationRevision: '1', sourceSteps: context.sourceSteps, configurationReferences: [], authoringContext: [] } };
    const request = requests.buildSourcePlanRequest({ session });
    expect(Object.keys(request.body)).toEqual(['contents', 'systemInstruction', 'generationConfig']);
    expect(Object.keys(request.body.generationConfig)).toEqual(['maxOutputTokens', 'responseMimeType', 'responseJsonSchema', 'thinkingConfig']);
    expect(request.body.generationConfig).toMatchObject({ maxOutputTokens: 4096, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(request.body.contents[0]?.role).toBe('user');
    expect(Object.keys(JSON.parse(request.body.contents[0]?.parts[0]?.text ?? '{}') as object)).toEqual(['kind', 'requestId', 'attempt', 'context']);
  });
  it('the systemInstruction is the current backend contract; versus the capture it only ADDS paragraphs (documented drift)', () => {
    const template = requests.loadTemplate('source-plan');
    const captured = template.systemInstruction.parts[0]?.text ?? '';
    const current = requests.outputContract();
    const request = requests.buildSourcePlanRequest({ session: { sessionId: 's', scopeHash: 'h', scope: { sourceRevision: '1', configurationRevision: '1' }, sourceSteps: [{ stepId: 'a' }], manifest: { sourceRevision: '1', configurationRevision: '1', sourceSteps: [{ stepId: 'a', text: 'Click "Go"' }], configurationReferences: [], authoringContext: [] } } });
    expect(request.body.systemInstruction.parts[0]?.text).toBe(current);
    const paragraphs = (text: string) => text.split('\n\n');
    for (const paragraph of paragraphs(captured)) expect(current).toContain(paragraph);
    expect(paragraphs(current).length).toBeGreaterThan(paragraphs(captured).length);
  });
});

describe('sourceReferences suggestions (GuidedAuthoredUriCandidates port)', () => {
  it('reproduces the backend-computed suggestions of the repository templates', () => {
    for (const name of ['source-plan']) {
      const { context } = requests.templateEnvelope(requests.loadTemplate(name));
      const mine = requests.sourceReferenceCandidates(context.sourceSteps, { sourceRevision: context.sourceRevision, allows: loopbackOrAny });
      expect(JSON.stringify(mine)).toBe(JSON.stringify(context.sourceReferences));
      expect(mine.length).toBeGreaterThan(0);
    }
  });

  describe.skipIf(!HAVE_CAPTURES)('golden: every captured initial SOURCE_PLAN body', () => {
    it('matches sourceReferences exactly (order included) and rebuilds the whole context', () => {
      let checked = 0; let references = 0;
      for (const file of readdirSync(CAPTURED).filter(f => f.endsWith('.req.json'))) {
        const body = JSON.parse(readFileSync(CAPTURED + file, 'utf8')) as Body;
        const envelope = requests.templateEnvelope(body);
        const c = envelope.context;
        if (envelope.kind !== 'SOURCE_PLAN' || c.learningWindow !== undefined || c.obligations.length > 0) continue;
        const mine = requests.sourceReferenceCandidates(c.sourceSteps, { sourceRevision: c.sourceRevision, allows: loopbackOrAny });
        expect(JSON.stringify(mine), file).toBe(JSON.stringify(c.sourceReferences));
        checked++; references += mine.length;
      }
      expect(checked).toBeGreaterThanOrEqual(100);
      expect(references).toBeGreaterThan(900);
    });
  });

  it('edge cases follow the Java rules: surrogate pairs, curly quotes, variables, bare URLs, ambiguity', () => {
    const step = (text: string): Step[] => [{ stepId: 's1', text }];
    const find = (text: string) => requests.sourceReferenceCandidates(step(text), { allows: requests.makeAllows() });
    // emoji occupies two UTF-16 code units: the literal span is [6,9) as the contract's own example says
    expect(find('Type "😀a" in Search').map(r => [r.startUtf16, r.endUtf16, r.intendedSlot])).toEqual([[6, 9, 'fill.value'], [6, 9, 'selectOption.value'], [6, 9, 'assert.expected']]);
    // curly double quotes are quotes; the closing delimiter is excluded
    expect(requests.quotedSpans('Type “abc” now')).toEqual([[6, 9]]);
    // a quoted URL is a destination only (not offered again as text), a bare URL too; trailing punctuation makes a bare URL ambiguous
    expect(find('Go to "https://example.com/a b"').length).toBe(0); // the literal lexes, but a space is not a valid host/URL character (hostOf)
    expect(find('Open https://example.com/app now').map(r => [r.kind, r.startUtf16, r.endUtf16])).toEqual([['destination', 5, 28]]);
    expect(find('Open https://example.com/app.').length).toBe(0);
    expect(find('Open "https://example.com/app"').map(r => [r.kind, r.startUtf16, r.endUtf16])).toEqual([['destination', 6, 29]]);
    // IP literals are not eligible destinations (AllowedDomains.hostOf), allow-all notwithstanding
    expect(find('Open "http://127.0.0.1:8080/x"').length).toBe(0);
    expect(requests.hostOf('https://Example.COM/x')).toBe('example.com');
    expect(requests.hostOf('https://user@example.com/')).toBeNull();
    // a quoted literal that mixes text and a plain <var> is one template literal; a lone <var> token is not a source span
    const mixed = find('Search for "Top <var BANK>?"');
    expect(mixed.map(r => [r.startUtf16, r.endUtf16, r.kind])).toEqual([[12, 27, 'nonsecretText'], [12, 27, 'nonsecretText'], [12, 27, 'nonsecretText']]);
    expect(find('Type "<var BANK>" in Search').length).toBe(0);
    // a secret token is never part of a template span
    expect(find('Type "a <secret PW>" in Search').length).toBe(0);
  });

  it('caps the suggestion list at 200 candidates', () => {
    const steps: Step[] = Array.from({ length: 100 }, (_, i) => ({ stepId: `s${String(i)}`, text: `Type "v${String(i)}" and "w${String(i)}"` }));
    expect(requests.sourceReferenceCandidates(steps, {}).length).toBe(200);
  });
});

describe('NEXT_ACTION context (GuidedPromptAssembler.buildPositiveContext + admitPlan + capturePromptInputsLocked)', () => {
  it('rebuilds the template context apart from server-minted ids', () => {
    const template = requests.templateEnvelope(requests.loadTemplate('next-action'));
    const c = template.context;
    const plan = { sourceReferences: [] as Reference[], needs: [] as unknown[], obligations: [] as Obligation[] };
    // The template's inputs came from references the model chose; reconstruct matching references so the projection is exercised.
    for (const input of c.inputs) plan.sourceReferences.push({ referenceKind: 'sourceSpan', sourceRevision: '1', stepId: String(input.sourceStepId), startUtf16: 1, endUtf16: 2, kind: String(input.kind), intendedSlot: String(input.intendedSlot) });
    const stepIndex = c.sourceSteps.findIndex(s => s.stepId === c.coordinate.stepId);
    const all: Obligation[] = [];
    c.inputs.forEach((input, index) => { if (input.sourceStepId !== c.coordinate.stepId) all.push({ stepId: String(input.sourceStepId), occurrence: 0, operationKind: input.kind === 'destination' ? 'navigate' : 'selectOption', targetIntent: 'x', scopeIntent: null, referenceIndex: index, needId: null, predicate: null }); });
    plan.obligations = [...all, ...c.obligations].map(o => ({ ...o }));
    plan.obligations = plan.obligations.map(o => Object.fromEntries(Object.entries(o).filter(([name]) => name !== 'obligationId')) as unknown as Obligation);
    const admitted = requests.admitPlan({ ...plan });
    const session = { sessionId: c.sessionId, scopeHash: c.scopeHash, contextId: c.executionEvidence?.contextId, scope: { sourceRevision: c.sourceRevision, configurationRevision: c.configurationRevision }, sourceSteps: c.sourceSteps.map(s => ({ stepId: s.stepId })), manifest: { sourceRevision: c.sourceRevision, configurationRevision: c.configurationRevision, sourceSteps: c.sourceSteps, configurationReferences: c.configurationReferences, authoringContext: c.authoringContext } };
    const built = requests.buildNextActionRequest({ session, plan: admitted, stepIndex, done: c.coordinate.ordinal, observation: c.observation, evidence: c.executionEvidence });
    expect(Object.keys(built.context)).toEqual(Object.keys(c));
    expect(requests.canonical(strip(built.context.obligations as unknown as Record<string, unknown>[], 'obligationId'))).toBe(requests.canonical(strip(c.obligations as unknown as Record<string, unknown>[], 'obligationId')));
    expect(requests.canonical(strip(built.context.inputs, 'inputId'))).toBe(requests.canonical(strip(c.inputs, 'inputId')));
    expect(built.context.coordinate).toEqual(c.coordinate);
    expect(built.context.needs).toEqual(c.needs);
    expect(admitted.obligations.every(o => typeof o.obligationId === 'string' && o.obligationId.length === 36)).toBe(true);
  });

  it('D-11: derives needs from the needIds (ADR-SC-007 WI-1) and allocates a UUID bindingId for every need, as GuidedDependencyPlanner.allocate does', () => {
    const base = { occurrence: 0, targetIntent: 'x', scopeIntent: null, referenceIndex: null, predicate: null };
    const reply = {
      sourceReferences: [],
      obligations: [
        { ...base, stepId: 'a', operationKind: 'read', needId: 'need-title' },
        { ...base, stepId: 'b', operationKind: 'fill', needId: 'need-title' },
        { ...base, stepId: 'b', operationKind: 'fill', occurrence: 1, needId: 'need-title' },
        { ...base, stepId: 'c', operationKind: 'assert', predicate: 'containsText', needId: 'need-title' },
        { ...base, stepId: 'c', operationKind: 'assert', occurrence: 1, predicate: 'visible', needId: null },
        { ...base, stepId: 'c', operationKind: 'click', occurrence: 2, needId: null },
      ],
      // A stray model-written needs field is ignored, not copied (the protected harness fakes still return needs: []).
      needs: [{ needId: 'stray', producerStepId: 'z', consumers: [] }],
    };
    const admitted = requests.admitPlan(reply);
    const bindingId = (admitted.needs[0] as { bindingId: string }).bindingId;
    expect(bindingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(admitted.needs).toHaveLength(1);
    expect(strip(admitted.needs as Record<string, unknown>[], 'bindingId')).toEqual([
      { needId: 'need-title', producerStepId: 'a', consumers: [{ stepId: 'b', argumentSlot: 'fill.value' }, { stepId: 'c', argumentSlot: 'assert.expected' }] },
    ]);
    expect(reply.needs[0]).not.toHaveProperty('bindingId');
  });

  describe.skipIf(!HAVE_CAPTURES)('golden: replaying captured sessions through admitPlan', () => {
    it('reproduces obligations, inputs, needs and coordinate for at least 98% of the captured NEXT_ACTION bodies', () => {
      const ids = readdirSync(CAPTURED).filter(f => f.endsWith('.req.json')).map(f => parseInt(f, 10)).sort((a, b) => a - b);
      const planBySession = new Map<string, unknown>();
      let ok = 0; let total = 0;
      for (const id of ids) {
        const envelope = requests.templateEnvelope(JSON.parse(readFileSync(`${CAPTURED}${String(id)}.req.json`, 'utf8')) as Body);
        const c = envelope.context;
        if (envelope.kind === 'SOURCE_PLAN') {
          try {
            const response = JSON.parse(readFileSync(`${CAPTURED}${String(id)}.resp.json`, 'utf8')) as { candidates: { content: { parts: { text: string }[] } }[] };
            const reply = JSON.parse(response.candidates[0]?.content.parts[0]?.text ?? 'null') as { obligations?: unknown } | null;
            if (reply?.obligations !== undefined && !planBySession.has(c.sessionId)) planBySession.set(c.sessionId, reply);
          } catch { /* a failed capture has no plan */ }
          continue;
        }
        const reply = planBySession.get(c.sessionId);
        if (reply === undefined) continue;
        total++;
        const session = { sessionId: c.sessionId, scopeHash: c.scopeHash, contextId: c.executionEvidence?.contextId, scope: { sourceRevision: c.sourceRevision, configurationRevision: c.configurationRevision }, sourceSteps: c.sourceSteps.map(s => ({ stepId: s.stepId })), manifest: { sourceRevision: c.sourceRevision, configurationRevision: c.configurationRevision, sourceSteps: c.sourceSteps, configurationReferences: c.configurationReferences, authoringContext: c.authoringContext } };
        const mine = requests.buildNextActionRequest({ session, plan: requests.admitPlan(reply), stepIndex: c.sourceSteps.findIndex(s => s.stepId === c.coordinate.stepId), done: c.coordinate.ordinal, observation: c.observation, evidence: c.executionEvidence }).context;
        const same = JSON.stringify(Object.keys(mine)) === JSON.stringify(Object.keys(c))
          && requests.canonical(strip(mine.obligations as unknown as Record<string, unknown>[], 'obligationId')) === requests.canonical(strip(c.obligations as unknown as Record<string, unknown>[], 'obligationId'))
          && requests.canonical(strip(mine.inputs, 'inputId')) === requests.canonical(strip(c.inputs, 'inputId'))
          && requests.canonical(mine.needs) === requests.canonical(c.needs) && requests.canonical(mine.coordinate) === requests.canonical(c.coordinate);
        if (same) ok++;
      }
      expect(total).toBeGreaterThanOrEqual(250);
      // 300 of 304 in the 2026-10-26 capture; the 4 misses are sessions whose admitted plan was not the first SOURCE_PLAN reply.
      expect(ok / total).toBeGreaterThanOrEqual(0.98);
    });
  });

  it('measures the gateway admission the way the client checks it (payload + contract bytes against 262144)', () => {
    const template = requests.loadTemplate('next-action');
    const metrics = requests.bodyMetrics(template);
    expect(metrics.gatewayInputBytes).toBeLessThan(262144);
    expect(metrics.gatewayInputAdmitted).toBe(true);
    expect(metrics.translationInputAdmitted).toBe(true);
    // 70 KB: inside the gateway's 262144 but over the translation service's own 65536 cap (GuidedTranslationService ~l.1635)
    const mid = structuredClone(template);
    const midPart = mid.contents[0]?.parts[0];
    if (midPart) midPart.text += 'x'.repeat(70000);
    expect(requests.bodyMetrics(mid)).toMatchObject({ gatewayInputAdmitted: true, translationInputAdmitted: false });
    const huge = structuredClone(template);
    const first = huge.contents[0];
    if (first?.parts[0]) first.parts[0].text += 'x'.repeat(300000);
    expect(requests.bodyMetrics(huge).gatewayInputAdmitted).toBe(false);
  });
});
