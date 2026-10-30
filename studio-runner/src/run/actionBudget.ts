/**
 * Action budgets and the learn / replay constant tables (ADR-SC-007 WI-4, plan D-3 CONSTANTS; critique 1 items C2, C3).
 *
 * One dispatch call to the backend has a 15 s transport window (HttpRunnerDispatchClient.transportDeadline). A learn
 * `invoke` therefore gets an 8,000 ms budget in total; the automatic post-dispatch observation only uses what remains of
 * 12,000 ms. Every Playwright timeout is handed out by `ActionBudget.take`, which is never below 1 ms because a Playwright
 * timeout of 0 DISABLES the timeout.
 */

export const LEARN_ACTION_BUDGET_MS = 8_000;
export const PREPARE_BUDGET_MS = 8_000;
/** The whole dispatch call (action + automatic observation) must end within this, leaving a reserve of the 15 s transport window. */
export const DISPATCH_WINDOW_MS = 12_000;
/** Below this remainder the automatic post-dispatch observation is skipped and the backend pulls it in a separate call. */
export const MIN_AUTOMATIC_OBSERVATION_MS = 1_500;

export type ActionProfileName = 'learn' | 'replay';

export interface ActionProfileTable {
  readonly name: ActionProfileName;
  /** Total budget of one invoke; null = the caller supplies the control's remaining time. */
  readonly totalMs: number | null;
  readonly actionabilityWaitMs: number;
  readonly identitySnapshotMs: number;
  readonly boundCheckMs: number;
  readonly focusMs: number;
  readonly actionMs: number;
  /** Delay measured after a click, toggle or key returns, within which a navigation request must start. */
  readonly navStartMs: number;
  /** The old grace for Enter. */
  readonly navGraceMs: number;
  /** Navigation commit allowance; null = whatever remains of the budget (learn). */
  readonly navSettleMs: number | null;
}

export const LEARN_PROFILE: ActionProfileTable = Object.freeze({
  name: 'learn', totalMs: LEARN_ACTION_BUDGET_MS, actionabilityWaitMs: 3_000, identitySnapshotMs: 750, boundCheckMs: 500, focusMs: 750,
  actionMs: 2_500, navStartMs: 300, navGraceMs: 1_500, navSettleMs: null,
});
export const REPLAY_PROFILE: ActionProfileTable = Object.freeze({
  name: 'replay', totalMs: null, actionabilityWaitMs: 8_000, identitySnapshotMs: 2_000, boundCheckMs: 5_000, focusMs: 2_000,
  actionMs: 10_000, navStartMs: 300, navGraceMs: 1_500, navSettleMs: 30_000,
});
export const profileFor = (name: ActionProfileName): ActionProfileTable => (name === 'learn' ? LEARN_PROFILE : REPLAY_PROFILE);

/** A Playwright timeout in whole milliseconds, never below 1 (0 would disable the timeout). */
export function clampMs(ms: number): number {
  return Number.isFinite(ms) ? Math.max(1, Math.floor(ms)) : 1;
}

export class ActionBudget {
  readonly #deadline: number;
  readonly #now: () => number;
  constructor(totalMs: number, now: () => number = Date.now) {
    this.#now = now;
    this.#deadline = now() + Math.max(0, totalMs);
  }
  /** Milliseconds left, never negative. */
  remaining(): number {
    return Math.max(0, this.#deadline - this.#now());
  }
  /** max(1, floor(min(cap, remaining))): the timeout to hand to one Playwright call. */
  take(capMs: number): number {
    return clampMs(Math.min(capMs, this.remaining()));
  }
  expired(): boolean {
    return this.remaining() <= 0;
  }
}

/**
 * The budget of one invoke: learn has its own total, replay takes the control's remaining time. `controlRemainingMs` is measured on the
 * control's own clock (InvocationControl.remainingMs), never by subtracting the session clock from the control's deadline: the executor's
 * run clock and Date.now are different clocks.
 */
export function budgetFor(profile: ActionProfileTable, controlRemainingMs: number, now: () => number = Date.now): ActionBudget {
  const fromControl = Math.max(0, controlRemainingMs);
  return new ActionBudget(profile.totalMs === null ? fromControl : Math.min(profile.totalMs, fromControl), now);
}
