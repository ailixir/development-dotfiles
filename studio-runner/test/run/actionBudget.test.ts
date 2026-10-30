import { describe, expect, it } from 'vitest';
import { ActionBudget, budgetFor, clampMs, LEARN_ACTION_BUDGET_MS, LEARN_PROFILE, REPLAY_PROFILE, profileFor, DISPATCH_WINDOW_MS, MIN_AUTOMATIC_OBSERVATION_MS } from '../../src/run/actionBudget.js';

describe('the action budgets', () => {
  it('the timeouts handed out in one learn dispatch sum to at most the budget', () => {
    let clock = 0;
    const budget = new ActionBudget(LEARN_ACTION_BUDGET_MS, () => clock);
    const handed: number[] = [];
    // Every phase of the worst case: each call consumes exactly the timeout it was given.
    const caps = [LEARN_PROFILE.identitySnapshotMs, LEARN_PROFILE.boundCheckMs, LEARN_PROFILE.actionabilityWaitMs, LEARN_PROFILE.identitySnapshotMs, LEARN_PROFILE.boundCheckMs, LEARN_PROFILE.focusMs, 1000, 1000, LEARN_PROFILE.actionMs, 5_000, 5_000, 1000];
    for (const cap of caps) { const t = budget.take(cap); handed.push(t); clock += t; }
    const clamps = handed.filter(t => t === 1).length;
    expect(handed.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(LEARN_ACTION_BUDGET_MS + clamps);
    expect(budget.expired()).toBe(true);
  });

  it('every derived timeout is at least 1 ms', () => {
    expect(clampMs(0)).toBe(1);
    expect(clampMs(-5)).toBe(1);
    expect(clampMs(0.4)).toBe(1);
    expect(clampMs(Number.NaN)).toBe(1);
    expect(clampMs(2.9)).toBe(2);
    const exhausted = new ActionBudget(0, () => 0);
    expect(exhausted.take(10_000)).toBe(1);
    expect(exhausted.remaining()).toBe(0);
  });

  it('the learn and replay tables carry the D-3 values', () => {
    expect(LEARN_PROFILE).toMatchObject({ totalMs: 8_000, actionabilityWaitMs: 3_000, identitySnapshotMs: 750, boundCheckMs: 500, focusMs: 750, actionMs: 2_500, navStartMs: 300, navGraceMs: 1_500, navSettleMs: null });
    expect(REPLAY_PROFILE).toMatchObject({ totalMs: null, actionabilityWaitMs: 8_000, identitySnapshotMs: 2_000, boundCheckMs: 5_000, focusMs: 2_000, actionMs: 10_000, navStartMs: 300, navGraceMs: 1_500, navSettleMs: 30_000 });
    expect(profileFor('learn')).toBe(LEARN_PROFILE);
    expect(profileFor('replay')).toBe(REPLAY_PROFILE);
    expect(DISPATCH_WINDOW_MS - LEARN_ACTION_BUDGET_MS).toBeGreaterThanOrEqual(MIN_AUTOMATIC_OBSERVATION_MS);
  });

  it('budgetFor limits learn to its total and replay to the control remaining time', () => {
    const now = () => 1_000;
    expect(budgetFor(LEARN_PROFILE, 60_000, now).remaining()).toBe(8_000);
    expect(budgetFor(LEARN_PROFILE, 3_000, now).remaining()).toBe(3_000);
    expect(budgetFor(REPLAY_PROFILE, 12_000, now).remaining()).toBe(12_000);
    expect(budgetFor(REPLAY_PROFILE, -500, now).remaining()).toBe(0);
  });
});
