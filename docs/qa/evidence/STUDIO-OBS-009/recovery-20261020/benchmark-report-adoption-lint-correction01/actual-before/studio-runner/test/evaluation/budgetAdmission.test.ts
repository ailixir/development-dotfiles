/**
 * STUDIO-OBS-009 T0 QA B7/B8: the budget admission ledger, the start guard and the stop rule. The statuses are
 * computed, not typed; an unknown price or headroom keeps every provider call at zero. A counting stub proves it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AdmissionError, appendAdmission, computeAdmission, createStopRule, emptyLedger, guardStart, measureProposals, proposalCaps, runBenchmark, sessionPlan, verifyLedger,
  type AdmissionLedger, type ProposalPlan, type StudioApiClient,
} from '../../evaluation/observed-authoring/evaluate.mjs';
import { frozenManifest } from './observedCorpus.js';

const manifest = frozenManifest();
// MODEL-SIZING (2026-10-18): the production session totals, and the explicit proposal plans the token caps come from.
const CAPS = { maxModelInputTokensTotal: 786432, maxModelOutputTokensTotal: 98304, maxOutputTokensPerCall: 4096, maxInputBytesPerCall: 65536, source: 'unit test' };
const BENCH_PLAN: ProposalPlan = { plannedProposals: 579, contingencyFactor: 1.5, inputBytesPerCall: 32768, basis: 'unit test: ruling-draft section 4 (193 per repetition x 3)' };
const PROBE_PLAN: ProposalPlan = { plannedProposals: 3, contingencyFactor: 1, inputBytesPerCall: 65536, basis: 'unit test: AC-8 probe, 3 calls' };
const PRICE = { pInPerMTok: 1, pOutPerMTok: 4, source: 'unit-test price list' };
const NOW = new Date('2026-10-18T20:00:00.000Z');
const decide = (extra: Partial<Parameters<typeof computeAdmission>[0]> = {}) => computeAdmission({ purpose: 'ac7-benchmark', manifest, price: null, headroomUsd: null, enforcedCaps: CAPS, proposalPlan: BENCH_PLAN, now: NOW, ...extra });

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'admission-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('computeAdmission', () => {
  it('derives sessions from the manifest and the token caps from the proposal plan, not from sessions x session totals', () => {
    expect(sessionPlan(manifest)).toEqual({ runs: 75, sessions: 81, contingencySessions: 122 });
    const base = decide();
    // 579 planned proposals x 1.5 = 869 (ruling-draft section 4); output 869 x 4096, input 869 x 32,768.
    expect(base.computed).toMatchObject({ plannedSessions: 81, contingencySessions: 122, plannedProposals: 579, contingencyProposals: 869, tokenCapIn: 869 * 32768, tokenCapOut: 869 * 4096 });
    expect(869 * 4096).toBe(3_559_424);
    // The old formula would have inflated the caps 3x: 122 x 98,304 = 11,993,088 output.
    expect(base.computed.tokenCapOut).toBeLessThan(122 * 98304 / 3);
    expect(base.computed.capBasis).toMatchObject({ output: 'contingencyProposals x maxOutputTokensPerCall', input: 'contingencyProposals x inputBytesPerCall' });
  });

  it('takes an explicit input cap instead of a per-call assumption, and refuses a plan that names neither or both', () => {
    expect(proposalCaps({ plannedProposals: 10, contingencyFactor: 1, inputTokenCap: 500_000, basis: 'pm cap' }, CAPS)).toMatchObject({ tokenCapIn: 500_000, tokenCapOut: 40_960 });
    const base: ProposalPlan = { plannedProposals: 10, contingencyFactor: 1, basis: 'x' };
    expect(() => proposalCaps(base, CAPS)).toThrow('ADMISSION_PROPOSAL_PLAN');
    expect(() => proposalCaps({ ...base, inputBytesPerCall: 1, inputTokenCap: 1 }, CAPS)).toThrow('ADMISSION_PROPOSAL_PLAN');
    expect(() => proposalCaps({ ...base, inputBytesPerCall: 1, contingencyFactor: 0.5 }, CAPS)).toThrow('ADMISSION_PROPOSAL_PLAN');
    expect(() => proposalCaps({ ...base, inputBytesPerCall: 1, plannedProposals: 0 }, CAPS)).toThrow('ADMISSION_PROPOSAL_PLAN');
    expect(() => decide({ proposalPlan: undefined as unknown as ProposalPlan })).toThrow('ADMISSION_PROPOSAL_PLAN');
  });

  it('reads ADMISSION_REFUSED_PRICE_UNKNOWN when the price is unknown, whatever the headroom', () => {
    expect(decide().status).toBe('ADMISSION_REFUSED_PRICE_UNKNOWN');
    expect(decide({ headroomUsd: { value: 400, source: 'x' } }).status).toBe('ADMISSION_REFUSED_PRICE_UNKNOWN');
  });

  it('reads ADMISSION_REFUSED_HEADROOM_UNKNOWN when only the headroom is unknown', () => {
    const entry = decide({ price: PRICE });
    expect(entry.status).toBe('ADMISSION_REFUSED_HEADROOM_UNKNOWN');
    expect(entry.notAdmittedBecause.join(' ')).toContain('unrun, owner user');
  });

  it('refuses a cost bound above the allocation, an allocation above the headroom, and one above the 500 ceiling', () => {
    const bound = (869 * 32768 * 1 + 869 * 4096 * 4) / 1_000_000;
    expect(bound).toBeGreaterThan(40);
    expect(decide({ price: PRICE, headroomUsd: { value: 300, source: 's' }, allocationUsd: 10 }).status).toBe('ADMISSION_REFUSED_OVER_ALLOCATION');
    expect(decide({ price: PRICE, headroomUsd: { value: 30, source: 's' }, allocationUsd: 60 }).status).toBe('ADMISSION_REFUSED_OVER_ALLOCATION');
    expect(decide({ price: PRICE, headroomUsd: { value: 900, source: 's' }, allocationUsd: 600 }).status).toBe('ADMISSION_REFUSED_OVER_ALLOCATION');
  });

  it('admits only a complete, in-bounds record, and then names the stop threshold at 80 percent of the allocation', () => {
    const entry = decide({ price: PRICE, headroomUsd: { value: 300, source: 'user, 2026-10-18' }, allocationUsd: 100, admittedBy: 'user' });
    expect(entry.status).toBe('ADMITTED');
    expect(entry.stopThresholdUsd).toBe(80);
    expect(entry.admittedAt).toBe(NOW.toISOString());
    expect(entry.manifestSha256).toBe(manifest.manifestSha256);
  });

  it('never converts the 2026-10-04 call count into dollars and states the unknowns', () => {
    const entry = decide();
    expect(entry.notAdmittedBecause.join(' ')).toContain('473 of 500 calls');
    expect(entry.allocationUsd).toBeNull();
    expect(entry.computed.costBoundUsd).toBeNull();
  });
});

describe('append-only ledger', () => {
  it('appends dated decisions with a digest chain and refuses a rewritten earlier entry', () => {
    const path = join(dir, 'ledger.json');
    const first = appendAdmission(path, decide(), { create: true });
    const second = appendAdmission(path, decide({ now: new Date('2026-10-18T21:00:00.000Z'), headroomUsd: { value: 300, source: 's' }, price: PRICE }));
    expect(first).toMatchObject({ seq: 1, prevEntrySha256: null });
    expect(second.seq).toBe(2);
    expect(second.prevEntrySha256).toMatch(/^[a-f0-9]{64}$/u);
    const ledger = JSON.parse(readFileSync(path, 'utf8')) as AdmissionLedger;
    expect(verifyLedger(ledger)).toEqual([]);
    const tampered = structuredClone(ledger);
    const early = tampered.admissions[0];
    if (early) early.status = 'ADMITTED';
    expect(verifyLedger(tampered)).toContain('CHAIN_2');
    writeFileSync(path, JSON.stringify(tampered));
    expect(() => appendAdmission(path, decide({ now: new Date('2026-10-18T22:00:00.000Z') }))).toThrow(/LEDGER_CORRUPT/u);
  });

  it('refuses to create a ledger implicitly and refuses a decision dated before the previous one', () => {
    expect(() => appendAdmission(join(dir, 'missing.json'), decide())).toThrow('LEDGER_MISSING');
    const path = join(dir, 'order.json');
    appendAdmission(path, decide(), { create: true });
    expect(() => appendAdmission(path, decide({ now: new Date('2026-10-17T00:00:00.000Z') }))).toThrow(/LEDGER_REJECTED/u);
  });
});

describe('start guard and the counting stub', () => {
  const stub = () => {
    let calls = 0;
    const handler = { get: (_t: object, prop: string): unknown => (prop === 'then' ? undefined : () => { calls += 1; return Promise.reject(new Error('provider call attempted')); }) };
    return { client: new Proxy({}, handler) as unknown as StudioApiClient, calls: () => calls };
  };
  const path = (): string => { const p = join(dir, `g-${String(Math.random()).slice(2)}.json`); return p; };

  it('refuses with no ledger entry, a refused entry, another manifest, another purpose and a future admission', () => {
    const empty = emptyLedger();
    expect(() => guardStart({ ledger: empty, manifestSha256: manifest.manifestSha256 })).toThrow(/ADMISSION_MISSING/u);
    const p = path();
    appendAdmission(p, decide(), { create: true });
    const refused = JSON.parse(readFileSync(p, 'utf8')) as AdmissionLedger;
    expect(() => guardStart({ ledger: refused, manifestSha256: manifest.manifestSha256 })).toThrow('LATEST_NOT_ADMITTED:ADMISSION_REFUSED_PRICE_UNKNOWN');
    const q = path();
    appendAdmission(q, decide({ price: PRICE, headroomUsd: { value: 300, source: 's' }, allocationUsd: 100, admittedBy: 'user' }), { create: true });
    const admitted = JSON.parse(readFileSync(q, 'utf8')) as AdmissionLedger;
    expect(guardStart({ ledger: admitted, manifestSha256: manifest.manifestSha256, now: new Date('2026-10-18T20:00:01.000Z') }).status).toBe('ADMITTED');
    expect(() => guardStart({ ledger: admitted, manifestSha256: 'a'.repeat(64), now: new Date('2026-10-18T20:00:01.000Z') })).toThrow('MANIFEST_MISMATCH');
    expect(() => guardStart({ ledger: admitted, manifestSha256: manifest.manifestSha256, purpose: 'ac8-schema-probe', now: new Date('2026-10-18T20:00:01.000Z') })).toThrow('PURPOSE_MISMATCH');
    // Interleaved purposes: a later refused ac8 entry does not close an admitted ac7 entry, and does not open ac8 either.
    appendAdmission(q, decide({ purpose: 'ac8-schema-probe', manifest: null, proposalPlan: PROBE_PLAN, now: new Date('2026-10-18T20:05:00.000Z') }));
    const interleaved = JSON.parse(readFileSync(q, 'utf8')) as AdmissionLedger;
    expect(guardStart({ ledger: interleaved, manifestSha256: manifest.manifestSha256, now: new Date('2026-10-18T20:06:00.000Z') }).purpose).toBe('ac7-benchmark');
    expect(() => guardStart({ ledger: interleaved, manifestSha256: null, purpose: 'ac8-schema-probe', now: new Date('2026-10-18T20:06:00.000Z') })).toThrow('LATEST_NOT_ADMITTED:ADMISSION_REFUSED_PRICE_UNKNOWN');
    expect(() => guardStart({ ledger: admitted, manifestSha256: manifest.manifestSha256, now: NOW })).toThrow('ADMITTED_AT_NOT_BEFORE_NOW');
  });

  it('with the price unknown a D_C run makes zero provider calls and stops before the first session', async () => {
    const p = path();
    appendAdmission(p, decide(), { create: true });
    const ledger = JSON.parse(readFileSync(p, 'utf8')) as AdmissionLedger;
    const { client, calls } = stub();
    await expect(runBenchmark({ manifest, mode: 'D_C', client, ledger })).rejects.toBeInstanceOf(AdmissionError);
    expect(calls()).toBe(0);
  });

  it('with the headroom unknown a D_C run makes zero provider calls', async () => {
    const p = path();
    appendAdmission(p, decide({ price: PRICE }), { create: true });
    const ledger = JSON.parse(readFileSync(p, 'utf8')) as AdmissionLedger;
    const { client, calls } = stub();
    await expect(runBenchmark({ manifest, mode: 'D_C', client, ledger })).rejects.toThrow('LATEST_NOT_ADMITTED:ADMISSION_REFUSED_HEADROOM_UNKNOWN');
    expect(calls()).toBe(0);
  });

  it('refuses a D_C run with no ledger at all, and refuses a narrowed D_C run', async () => {
    const { client, calls } = stub();
    await expect(runBenchmark({ manifest, mode: 'D_C', client, ledger: emptyLedger() })).rejects.toThrow('ADMISSION_MISSING');
    await expect(runBenchmark({ manifest, mode: 'D_C', client, ledger: emptyLedger(), select: ['C01-rf-example-url'] })).rejects.toThrow('D_C runs the whole corpus');
    expect(calls()).toBe(0);
  });

  it('refuses a frozen-manifest digest that differs from the admitted one', async () => {
    const p = path();
    appendAdmission(p, decide({ price: PRICE, headroomUsd: { value: 300, source: 's' }, allocationUsd: 100, admittedBy: 'user' }), { create: true });
    const ledger = JSON.parse(readFileSync(p, 'utf8')) as AdmissionLedger;
    const edited = structuredClone(manifest);
    edited.manifestSha256 = 'b'.repeat(64);
    const { client, calls } = stub();
    await expect(runBenchmark({ manifest: edited, mode: 'D_C', client, ledger })).rejects.toThrow(/MANIFEST_INVALID/u);
    expect(calls()).toBe(0);
  });
});

describe('stop rule (80 percent of the allocation, or the first hard-gate hit)', () => {
  const rule = () => createStopRule({ allocationUsd: 10, price: { pInPerMTok: 1_000_000 / 1000, pOutPerMTok: 0 }, reservedCeiling: { input: 1000, output: 100 } });
  // price makes 1000 input tokens cost exactly 1 USD, so 8 sessions of 1000 tokens reach the 8 USD threshold.

  it('lets the session that crosses 80 percent finish and never starts the next one', () => {
    const stop = rule();
    for (let i = 1; i <= 7; i += 1) expect(stop.record({ inputTokens: 1000, outputTokens: 0 }).stop).toBe(false);
    const crossing = stop.record({ inputTokens: 1000, outputTokens: 0 });
    expect(crossing).toMatchObject({ stop: true, reason: 'STOPPED_BUDGET_80', spentUsd: 8 });
    expect(stop.nextSessionAllowed()).toBe(false);
    expect(() => stop.record({ inputTokens: 1, outputTokens: 1 })).toThrow('SESSION_AFTER_STOP');
  });

  it('stops at the first false pass or leak', () => {
    const a = rule();
    expect(a.record({ inputTokens: 10, outputTokens: 0, falsePass: true })).toMatchObject({ stop: true, reason: 'STOPPED_HARD_GATE' });
    const b = rule();
    expect(b.record({ inputTokens: 10, outputTokens: 0, leak: true }).reason).toBe('STOPPED_HARD_GATE');
  });

  it('charges the reserved ceiling when a session reports no usage (conservative)', () => {
    const stop = rule();
    expect(stop.record({ inputTokens: null, outputTokens: null })).toMatchObject({ costBasis: 'reserved-ceiling', spentUsd: 1 });
  });

  it('charges what the session recorded as reserved (proposals x per-call ceilings, capped at the session totals) before the session totals', () => {
    const recorded = () => createStopRule({ allocationUsd: 10, price: { pInPerMTok: 1_000_000 / 1000, pOutPerMTok: 0 }, reservedCeiling: { input: 1000, output: 100 }, perCallCeiling: { input: 100, output: 10 } });
    // 3 recorded proposals x 100 input = 300 tokens = 0.3 USD, not the 1000-token session total.
    expect(recorded().record({ inputTokens: null, outputTokens: null, modelProposals: 3 })).toMatchObject({ costBasis: 'recorded-reservations', spentUsd: 0.3 });
    // Never more than the session total, whatever the proposal count says.
    expect(recorded().record({ inputTokens: null, outputTokens: null, modelProposals: 50 })).toMatchObject({ costBasis: 'recorded-reservations', spentUsd: 1 });
    // No recorded proposals and no usage: the session total, as before.
    expect(recorded().record({ inputTokens: null, outputTokens: null, modelProposals: null })).toMatchObject({ costBasis: 'reserved-ceiling', spentUsd: 1 });
    // Reported usage still wins.
    expect(recorded().record({ inputTokens: 200, outputTokens: 0, modelProposals: 50 })).toMatchObject({ costBasis: 'reported', spentUsd: 0.2 });
  });

  it('resuming needs a new dated ledger entry: a STOPPED latest entry keeps the guard shut', () => {
    const p = join(dir, 'stopped.json');
    appendAdmission(p, decide({ price: PRICE, headroomUsd: { value: 300, source: 's' }, allocationUsd: 100, admittedBy: 'user' }), { create: true });
    appendAdmission(p, { ...decide({ now: new Date('2026-10-18T21:00:00.000Z') }), status: 'STOPPED_BUDGET_80' });
    const ledger = JSON.parse(readFileSync(p, 'utf8')) as AdmissionLedger;
    expect(() => guardStart({ ledger, manifestSha256: manifest.manifestSha256, now: new Date('2026-10-18T22:00:00.000Z') })).toThrow('LATEST_NOT_ADMITTED:STOPPED_BUDGET_80');
  });
});

describe('B7 proposal measurement (a local fixture run can refute, never confirm)', () => {
  const doc = (proposals: number, ceiling: number) => ({
    declaredFixtureCeiling: ceiling,
    sessions: [{ sessionOrdinal: 1, actualCounters: { modelProposals: proposals, modelOutputTokens: proposals * ceiling, modelInputTokens: proposals * 16_000 } }],
  });

  // The totals B7 was measured against, before MODEL-SIZING. Passing them keeps the 2026-10-18 B7 reading reproducible.
  const BEFORE_MODEL_SIZING = { perCallOutputTokens: 4096, outputTotal: 32000, inputTotal: 262144, csiDailyOutput: 640000, csiDailyInput: 5242880 };

  it('reproduces the B7 reading at the earlier totals: a 10-step learn needing 13 proposals refutes 7 at a 2048 fixture ceiling', () => {
    const result = measureProposals([doc(13, 2048)], BEFORE_MODEL_SIZING);
    expect(result.maxProposalsAtProductionCeilings).toBe(7);
    expect(result.verdict).toBe('REFUTES_PROPOSALS_PER_SESSION_ASSUMPTION');
    expect(result.sessions[0]).toMatchObject({ proposals: 13, reservedOutputAtFixtureCeiling: 26_624, reservedOutputAtProductionCeiling: 53_248, exceedsProductionOutputTotal: true });
    expect(result.caveat).toContain('never confirm');
  });

  it('at the production defaults 13 proposals fit (24 is the floor) and 25 refute it', () => {
    const fits = measureProposals([doc(13, 2048)]);
    expect(fits.maxProposalsAtProductionCeilings).toBe(24);
    expect(fits.verdict).toBe('NOT_REFUTED_LOCALLY_NOT_CONFIRMED');
    expect(fits.sessions[0]).toMatchObject({ reservedOutputAtProductionCeiling: 53_248, exceedsProductionOutputTotal: false });
    const over = measureProposals([doc(25, 2048)]);
    expect(over.verdict).toBe('REFUTES_PROPOSALS_PER_SESSION_ASSUMPTION');
    expect(over.sessions[0]).toMatchObject({ proposals: 25, reservedOutputAtProductionCeiling: 102_400, exceedsProductionOutputTotal: true });
  });

  it('does not confirm anything when the fixture needs the floor or fewer', () => {
    expect(measureProposals([doc(6, 2048)]).verdict).toBe('NOT_REFUTED_LOCALLY_NOT_CONFIRMED');
    expect(measureProposals([doc(24, 2048)]).verdict).toBe('NOT_REFUTED_LOCALLY_NOT_CONFIRMED');
  });
});
