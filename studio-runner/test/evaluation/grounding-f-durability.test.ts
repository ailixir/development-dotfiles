/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/** SPK-07 workstream F: durability classification, locator collection, cookie variants, and the rerun file naming. */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const dur = await load('../../evaluation/grounding/durability.mjs');
const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(join(tmpdir(), 'spk07-f-dur-')); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const row = (extra: any) => ({ key: `${extra.task}|${extra.step ?? 0}|${extra.arm}|${extra.rep ?? 1}|${extra.attempt ?? 1}`, step: 0, rep: 1, attempt: 1, status: 'ACTION', correctElement: true, executable: true,
  locator: { kind: 'role', role: 'button', name: 'Go' }, locatorTier: 'role', ...extra });

describe('classifyResolution', () => {
  it('splits OK, FAIL_CLOSED and WRONG_UNIQUE', () => {
    expect(dur.classifyResolution([5], [5])).toBe('OK');
    expect(dur.classifyResolution([], [5])).toBe('FAIL_CLOSED');
    expect(dur.classifyResolution([5, 6], [5])).toBe('FAIL_CLOSED');
    expect(dur.classifyResolution([6], [5])).toBe('WRONG_UNIQUE');
  });
});

describe('collectFrozen', () => {
  it('dedupes locators across reps, tiers hint arms as hint, skips wrong or non-executable picks, prefers the final attempt', () => {
    const rows = [
      row({ task: 't', arm: 'S2', rep: 1 }), row({ task: 't', arm: 'S2', rep: 2 }),
      row({ task: 't', arm: 'A1', rep: 1, locatorTier: 'role' }),
      row({ task: 't', arm: 'S3', rep: 1, correctElement: false }),
      row({ task: 't', arm: 'S4', rep: 1, executable: false }),
      row({ task: 'u', arm: 'S3', rep: 1, locator: { kind: 'label', value: 'Old' }, locatorTier: 'label', correctElement: false }),
      row({ task: 'u', arm: 'S3', rep: 1, attempt: 2, locator: { kind: 'label', value: 'New' }, locatorTier: 'label' }),
    ];
    const frozen = dur.collectFrozen(rows);
    expect(frozen.map((f: any) => [f.task, f.arm, f.tier, f.reps])).toEqual([['t', 'S2', 'role', [1, 2]], ['t', 'A1', 'hint', [1]], ['u', 'S3', 'label', [1]]]);
    expect(frozen[2].locator.value).toBe('New');
    expect(dur.collectFrozen(rows, { includeWrong: true }).some((f: any) => f.arm === 'S3' && f.task === 't')).toBe(true);
    expect(dur.collectFrozen(rows, { arms: ['A1'] })).toHaveLength(1);
  });
});

describe('cookieVariants and trialPlan', () => {
  const reject = { chain: [{ m: 'getByRole', a: ['button', { name: 'Reject', exact: true }] }] };
  const accept = { chain: [{ m: 'getByRole', a: ['button', { name: 'Accept', exact: true }] }] };
  const task = { id: 't', site: 'gov.uk', setup: [{ op: 'click', gt: reject }, { op: 'click', gt: { chain: [{ m: 'getByText', a: ['Open'] }] } }] };
  it('has no opposite variant without a banner hint', () => {
    expect(dur.cookieVariants(task, {}).opposite).toBeNull();
  });
  it('swaps the task\'s reject click for an optional accept click, keeping the other setup ops, and the reverse', () => {
    const { baseline, opposite } = dur.cookieVariants(task, { 'gov.uk': { cookie: { accept, reject } } });
    expect(baseline.setup).toEqual(task.setup);
    expect(opposite.name).toBe('accepted');
    expect(opposite.setup[0]).toMatchObject({ op: 'click', gt: accept, optional: true });
    expect(opposite.setup[1]).toEqual(task.setup[1]);
    const acceptTask = { ...task, setup: [{ op: 'click', gt: accept }] };
    expect(dur.cookieVariants(acceptTask, { 'gov.uk': { cookie: { accept, reject } } }).opposite).toMatchObject({ name: 'rejected' });
    const noChoice = { ...task, setup: [] };
    expect(dur.cookieVariants(noChoice, { 'gov.uk': { cookie: { accept, reject } } }).opposite.name).toBe('accepted');
  });
  it('varies one factor at a time: 5 baseline contexts, then viewport 1920x1080, locale en-GB and the opposite cookie choice', () => {
    const plan = dur.trialPlan(task, { 'gov.uk': { cookie: { accept, reject } } }, 5);
    expect(plan.map((p: any) => p.cond)).toEqual(['baseline', 'baseline', 'baseline', 'baseline', 'baseline', 'viewport', 'locale', 'cookie-opposite']);
    expect(plan.filter((p: any) => p.cond === 'baseline').every((p: any) => p.viewport.width === 1280 && p.viewport.height === 720 && p.locale === 'en-US')).toBe(true);
    const viewport = plan.find((p: any) => p.cond === 'viewport');
    expect([viewport.viewport.width, viewport.viewport.height, viewport.locale]).toEqual([1920, 1080, 'en-US']);
    const locale = plan.find((p: any) => p.cond === 'locale');
    expect([locale.viewport.width, locale.locale]).toEqual([1280, 'en-GB']);
    expect(plan.find((p: any) => p.cond === 'cookie-opposite').variant.name).toBe('accepted');
    expect(dur.trialPlan({ ...task, site: 'none' }, {}, 5)).toHaveLength(7);
  });
});

describe('QA-D4: S3/S4 typed locators are collected with their selector and resolved', () => {
  it('keeps the carried selector (or derives it from the typed locator) and never reports UNSUPPORTED_SHAPE for them', async () => {
    const typed = [{ by: 'role', role: 'button', name: 'Go', exact: true }];
    const rows = [row({ task: 't', arm: 'S3', rep: 1, locator: typed, selector: 'internal:role=button[name="Go"s]', locatorTier: 'role' }),
      row({ task: 'u', arm: 'S4', rep: 1, locator: typed, locatorTier: 'role' })];
    const frozen = dur.collectFrozen(rows);
    expect(frozen.map((f: any) => f.selector)).toEqual(['internal:role=button[name="Go"s]', 'internal:role=button[name="Go"s]']);
    expect(frozen.every((f: any) => f.kind === 'frozen' && f.tier === 'role')).toBe(true);
    const seen: any[] = [];
    const task = { id: 't', steps: [{ operation: { kind: 'click' }, gt: {} }] };
    const out = await dur.walkLoad({ load: {}, task, trial: { cond: 'baseline' }, frozen: [frozen[0]], deps: {
      resolveGt: async () => ({ void: false, ids: [3] }), performStep: async () => undefined,
      locatorFromFrozen: (l: any, selector: string) => { seen.push(selector); return l; }, locatorIds: async () => [3], engineIds: async (_l: any, selector: string) => { seen.push(selector); return [3]; } } });
    expect(out[0]).toMatchObject({ outcome: 'OK', engineChecked: true });
    expect(seen).toEqual(['internal:role=button[name="Go"s]', 'internal:role=button[name="Go"s]']);
  });
});

describe('D-3 durability of an equivalent-descendant locator', () => {
  it('stays OK while the locator is still a click-equivalent descendant of the GT, and is WRONG_UNIQUE otherwise', async () => {
    const task = { id: 't', steps: [{ operation: { kind: 'click' }, gt: {} }] };
    const item = { task: 't', step: 0, arm: 'S1', tier: 'hint', kind: 'hint', locator: { kind: 'text', value: 'Menu' }, locatorKey: 'k', equivalentDescendant: true };
    const base = { resolveGt: async () => ({ void: false, ids: [87] }), performStep: async () => undefined, locatorFromFrozen: (l: any) => l, locatorIds: async () => [88], engineIds: async () => null };
    const ok = await dur.walkLoad({ load: {}, task, trial: {}, frozen: [item], deps: { ...base, equivalent: async () => ({ equivalent: true }) } });
    expect(ok[0]).toMatchObject({ outcome: 'OK', equivalentDescendant: true });
    const wrong = await dur.walkLoad({ load: {}, task, trial: {}, frozen: [item], deps: { ...base, equivalent: async () => ({ equivalent: false }) } });
    expect(wrong[0].outcome).toBe('WRONG_UNIQUE');
    const notFlagged = await dur.walkLoad({ load: {}, task, trial: {}, frozen: [{ ...item, equivalentDescendant: false }], deps: { ...base, equivalent: async () => ({ equivalent: true }) } });
    expect(notFlagged[0].outcome).toBe('WRONG_UNIQUE');
  });
});

describe('walkLoad', () => {
  const task = { id: 't', steps: [{ operation: { kind: 'click' }, gt: {} }, { operation: { kind: 'click' }, gt: {} }] };
  const item = (step: number, arm: string, key: string) => ({ task: 't', step, arm, tier: 'role', kind: 'frozen', locator: { kind: 'role', role: 'button', name: key }, locatorKey: key });
  const trial = { n: 1, viewport: '1280x720', locale: 'en-US', cookie: 'default' };
  const idsByName: Record<string, number[]> = { ok: [10], gone: [], dup: [10, 11], wrong: [99], step2: [20] };
  const mk = (gtVoidAt: number | null = null) => {
    const performed: number[] = [];
    return { performed, deps: {
      resolveGt: async () => (gtVoidAt !== null && performed.length === gtVoidAt ? { void: true, reason: 'GT_ABSENT' } : { void: false, ids: [performed.length === 0 ? 10 : 20], locator: {} }),
      performStep: async () => { performed.push(1); },
      locatorFromFrozen: (l: any) => (l.name === 'shape' ? (() => { throw new Error('LOCATOR_SHAPE x'); })() : l),
      locatorIds: async (l: any) => idsByName[l.name] ?? [],
    } };
  };
  it('classifies each frozen locator against the independently re-resolved GT and advances chains with the GT', async () => {
    const { deps, performed } = mk();
    const rows = await dur.walkLoad({ load: {}, task, trial, deps, frozen: [item(0, 'S2', 'ok'), item(0, 'S3', 'gone'), item(0, 'S3', 'dup'), item(0, 'S4', 'wrong'), item(1, 'S3', 'step2'), item(0, 'S2', 'shape')] });
    expect(rows.map((r: any) => [r.step, r.arm, r.outcome])).toEqual([[0, 'S2', 'OK'], [0, 'S3', 'FAIL_CLOSED'], [0, 'S3', 'FAIL_CLOSED'], [0, 'S4', 'WRONG_UNIQUE'], [0, 'S2', 'UNSUPPORTED_SHAPE'], [1, 'S3', 'OK']]);
    expect(performed).toHaveLength(1);
  });
  it('flags HZ-6 when the engine and the public API disagree, and classifies by the engine result', async () => {
    const { deps } = mk();
    const rows = await dur.walkLoad({ load: {}, task, trial, frozen: [item(0, 'S2', 'ok')], deps: { ...deps, engineIds: async () => [11] } });
    expect(rows[0]).toMatchObject({ hz6: true, engineChecked: true, outcome: 'WRONG_UNIQUE', engineCount: 1, publicCount: 1 });
    const agree = await dur.walkLoad({ load: {}, task, trial, frozen: [item(0, 'S2', 'ok')], deps: { ...deps, engineIds: async () => [10] } });
    expect(agree[0]).toMatchObject({ outcome: 'OK', engineChecked: true });
    expect(agree[0].hz6).toBeUndefined();
  });
  it('marks a trial VOID when the GT is gone (this step and later ones)', async () => {
    const { deps } = mk(0);
    const rows = await dur.walkLoad({ load: {}, task, trial, deps, frozen: [item(0, 'S2', 'ok'), item(1, 'S2', 'step2')] });
    expect(rows.map((r: any) => r.outcome)).toEqual(['VOID', 'VOID']);
  });
  it('marks every locator VOID when the load itself is void', async () => {
    const rows = await dur.walkLoad({ load: { void: true, reason: 'SETUP_GT_ABSENT' }, task, trial, deps: {}, frozen: [item(0, 'S2', 'ok')] });
    expect(rows[0]).toMatchObject({ outcome: 'VOID', reason: 'SETUP_GT_ABSENT' });
  });
});

describe('rerun output names and trial matrix', () => {
  it('first run writes durability.jsonl, later runs write a timestamped file', () => {
    const dir = tmp();
    expect(dur.outputNames(dir, new Date('2026-10-26T10:00:00Z'))).toEqual({ rows: 'durability.jsonl', summary: 'durability-summary.json' });
    writeFileSync(join(dir, 'durability.jsonl'), '');
    expect(dur.outputNames(dir, new Date('2026-10-27T11:30:05Z')).rows).toBe('durability-20261027T113005Z.jsonl');
  });
  it('runs the one-factor-at-a-time plan and writes rows with condition and hoursSinceRun', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ startedAt: '2026-10-26T06:00:00Z', endedAt: '2026-10-26T10:00:00Z' })); // next-day clock starts at the END of the run
    const task = { id: 't', site: 's', url: 'https://x.test/', setup: [], steps: [{ operation: { kind: 'click' }, gt: {} }] };
    const opened: any[] = [];
    const frozen = [{ task: 't', step: 0, arm: 'S2', tier: 'role', kind: 'frozen', locator: { kind: 'role', role: 'button', name: 'ok' }, locatorKey: 'ok' }];
    const result = await dur.runDurability({ runDir: dir, browser: {}, tasks: [task], frozen, contexts: 5, concurrency: 2, now: () => new Date('2026-10-27T12:00:00Z'),
      sites: { s: { cookie: { accept: { chain: [{ m: 'getByText', a: ['A'] }] }, reject: { chain: [{ m: 'getByText', a: ['R'] }] } } } },
      openTaskLoad: async (o: any) => { opened.push([o.viewport.width, o.locale]); return { void: false, close: async () => undefined }; },
      deps: { resolveGt: async () => ({ void: false, ids: [1] }), performStep: async () => undefined, locatorFromFrozen: (l: any) => l, locatorIds: async () => [1] } });
    expect(result.summary.jobs).toBe(5 + 1 + 1 + 1);
    expect(opened).toHaveLength(8);
    expect(opened.filter(o => o[0] === 1920)).toHaveLength(1);
    expect(opened.filter(o => o[1] === 'en-GB')).toHaveLength(1);
    const rows = readFileSync(join(dir, result.names.rows), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    expect(rows).toHaveLength(8);
    expect(rows.map((r: any) => r.trial.cond).sort()).toEqual(['baseline', 'baseline', 'baseline', 'baseline', 'baseline', 'cookie-opposite', 'locale', 'viewport']);
    expect(rows.every((r: any) => r.outcome === 'OK' && r.hoursSinceRun === 26)).toBe(true);
    expect(result.summary.byTier.role.OK).toBe(8);
    expect(result.summary.byCondition.viewport.OK).toBe(1);
  });
});
