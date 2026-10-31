/**
 * The code-execution module (ADR-SC-008 D2, D3.1, D3.4). Frozen step code is a JavaScript async function body. Every mode
 * (learning, retained prefix, proof, manual and scheduled runs) runs it through `runStep`, and this is the only file in the
 * package that turns a string into code: one AsyncFunction construction, admitted by a hash check and by V8's own syntax
 * check. The Playwright objects the code sees are wrapped by `stepCodeBinding.ts`, which applies the existing boundary.
 *
 * The injected names are the only names the code is given. `process`, `globalThis`, `require` and `fetch` are shadowed with
 * `undefined`: hygiene against accidental use, not a control (ordinary JavaScript still reaches Node, for example through
 * dynamic module loading). Generated code runs with the full privileges of its process (ADR-SC-008 D3.4, named residual).
 *
 * `typescript` is imported statically and used only on the error path, to give the repair loop a line and a column; it
 * costs about 100 ms of load time in every process that imports this module.
 */
import ts from 'typescript';

import { OriginNotAllowed } from '../allowedDomains.js';
import type { InvocationControl } from '../executor/observedReplay.js';
import { hashObserved, ObservedRefusal, type ObservedErrorCode } from '../validator/observedReferencePolicy.js';
import { ClosedActionError, closePlaywrightError } from './closedError.js';
import { createBinding, type BeforeCall, type EffectEntry, type StepTally } from './stepCodeBinding.js';

/** The part of the D2 record the executor needs. The rest of the record (captures, uses, hashes) is the caller's. */
export interface FrozenStep {
  readonly stepId: string;
  readonly code: string;
  /** SHA-256 over the canonical JSON of `code`: hashObserved(code). */
  readonly sourceHash: string;
  /** Declared by the record (E5). E1 does not read them: the caller binds `uses` into vars and commits `captures` from the returned vars. */
  readonly uses?: readonly string[];
  readonly captures?: readonly string[];
}

export interface StepRun {
  readonly page: object;
  readonly context: object;
  /** Playwright's expect (injected so that this module stays Playwright-free). */
  readonly expect: unknown;
  readonly inputs: Readonly<Record<string, string>>;
  /** Opaque secret handles. Passed to the code untouched; the hook interface is how the secrets work (E8) reaches the calls. */
  readonly secrets: object;
  /** Run-local record. The code reads and writes it; the same object is returned in the result. */
  readonly vars: Record<string, unknown>;
  readonly control: InvocationControl;
  readonly allowedDomains: readonly string[];
  /** Runs once after the code: the main frame must be on an allowed domain. An OriginNotAllowed becomes POLICY_REFUSED. */
  readonly afterBlock?: () => Promise<void>;
  readonly adoptPage?: (page: object) => void;
  /** Pages adopted by earlier steps, which context.pages() shows besides the run page. */
  readonly pages?: readonly object[];
  readonly beforeCall?: BeforeCall;
  /** Optional holder that stays readable after the caller abandons runStep (see StepTally). */
  readonly tally?: StepTally;
  /** Learning prepare: run up to the first effectful call and stop there with no effect (see BindingOptions.untilFence). */
  readonly untilFence?: boolean;
}

export interface SyntaxDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface StepResult {
  readonly ok: boolean;
  readonly closedCode?: ObservedErrorCode;
  readonly fenceCrossed: boolean;
  /** Method names only: never arguments, never Playwright text. */
  readonly effects: readonly EffectEntry[];
  /** True when more than MAX_EFFECTS effects happened and the list holds the first ones only. */
  readonly effectsTruncated: boolean;
  readonly vars: Record<string, unknown>;
  /** True when a call acted in an adopted page, which the run's video does not show. */
  readonly offscreen: boolean;
  /** Until-fence mode only: the code reached its first effectful call and was stopped there. With ok it is "ok until the fence"; effects stay empty. */
  readonly fenceReached: boolean;
  /** On TARGET_DRIFT from the strict wait: 0 for a missing target, 2 or more for an ambiguous one. */
  readonly matchCount?: number;
  readonly syntax?: SyntaxDiagnostic;
}

/** ADR-SC-008 D2 [I]: at most 16 KiB of code per step. */
export const MAX_CODE_BYTES = 16 * 1024;
const INJECTED = ['page', 'context', 'expect', 'inputs', 'secrets', 'vars'] as const;
const SHADOWED = ['process', 'globalThis', 'require', 'fetch'] as const;

type StepFunction = (...args: unknown[]) => Promise<unknown>;
type StepFunctionConstructor = new (...parameters: string[]) => StepFunction;
const AsyncFunction = (Object.getPrototypeOf(async function holder(): Promise<void> { /* only its constructor is used */ }) as { constructor: StepFunctionConstructor }).constructor;

/** Line and column (1-based) of the first syntax problem in the model's own code. V8 rejects the code either way; this only locates it. */
function locateSyntaxError(code: string, fallback: string): SyntaxDiagnostic {
  const wrapped = `async function step() {\n${code}\n}`;
  const diagnostic = ts.transpileModule(wrapped, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 } }).diagnostics?.[0];
  if (diagnostic?.file === undefined || diagnostic.start === undefined) return { line: 1, column: 1, message: fallback };
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return { line: Math.max(1, position.line), column: position.character + 1, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ') };
}

function refused(vars: Record<string, unknown>, syntax?: SyntaxDiagnostic): StepResult {
  const base = { ok: false, closedCode: 'INVALID_CONTRACT' as const, fenceCrossed: false, effects: [], effectsTruncated: false, vars, offscreen: false, fenceReached: false };
  return syntax === undefined ? base : { ...base, syntax };
}

export type Admission =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'STEP_SHAPE' | 'SOURCE_HASH_MISMATCH' | 'STEP_SYNTAX'; readonly syntax?: SyntaxDiagnostic };

function construct(step: FrozenStep): { readonly fn: StepFunction } | Extract<Admission, { ok: false }> {
  // Each field is read once: what is hashed is exactly what is constructed.
  const { stepId, code, sourceHash } = step;
  const shaped = typeof stepId === 'string' && typeof code === 'string' && typeof sourceHash === 'string';
  if (!shaped || Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) return { ok: false, reason: 'STEP_SHAPE' };
  try {
    if (hashObserved(code) !== sourceHash) return { ok: false, reason: 'SOURCE_HASH_MISMATCH' };
  } catch {
    return { ok: false, reason: 'STEP_SHAPE' };
  }
  try {
    return { fn: new AsyncFunction(...INJECTED, ...SHADOWED, `"use strict";\n${code}`) };
  } catch (error) {
    return { ok: false, reason: 'STEP_SYNTAX', syntax: locateSyntaxError(code, error instanceof Error ? error.name : 'SyntaxError') };
  }
}

/** Hash and syntax admission without running anything and without a browser (learning "admit" time, every replay). */
export function admitStep(step: FrozenStep): Admission {
  const built = construct(step);
  return 'fn' in built ? { ok: true } : built;
}

function fromClosedAction(code: string, fenced: boolean): ObservedErrorCode {
  switch (code) {
    case 'TARGET_CHANGED': return 'TARGET_DRIFT';
    case 'POLICY_DENIED': return 'POLICY_REFUSED';
    case 'PASSWORD_CONTROL_READ_REFUSED': return 'PASSWORD_CONTROL_READ_REFUSED';
    case 'UNKNOWN_OUTCOME': return 'OUTCOME_UNKNOWN';
    case 'READ_NOT_ALLOWED':
    case 'READ_REFUSED': return 'READ_REFUSED';
    case 'BUDGET_EXCEEDED': return 'TIMEOUT';
    default: return fenced ? 'OUTCOME_UNKNOWN' : 'TARGET_DRIFT';
  }
}

/**
 * How many elements a POSITIVE check of presence found when Playwright refused to pick one (a strict-mode violation inside a matcher), or undefined for
 * any other error. Fail closed: only a matcher that asserts something is there and shown qualifies, so the model can be asked to pick the element again.
 * A negated check (Playwright reports its failure with pass === true), a hidden or absent check (toBeHidden, state options such as visible:false) and
 * any matcher not named here stay assertion failures: a repair of those (first(), a filter) could pass while a second element is shown.
 * Only the integer leaves the error; the text is read, never copied.
 */
const POSITIVE_TEXT_MATCHERS: ReadonlySet<string> = new Set(['toHaveText', 'toContainText']);
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');
function positiveEvidence(result: { readonly name?: unknown; readonly pass?: unknown; readonly expected?: unknown }): boolean {
  if (result.pass !== false) return false;
  if (result.name === 'toBeVisible') return result.expected === 'visible';
  if (typeof result.name !== 'string' || !POSITIVE_TEXT_MATCHERS.has(result.name)) return false;
  const { expected } = result;
  if (typeof expected === 'string') return expected !== '';
  if (Object.prototype.toString.call(expected) !== '[object RegExp]') return false;
  const pattern = expected as RegExp;
  // A pattern that matches empty text, or that holds a negative look-around, can assert absence.
  return !new RegExp(pattern.source, pattern.flags.replace(/[gy]/gu, '')).test('') && !/\(\?<?!/u.test(pattern.source);
}
function strictViolationCount(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { matcherResult, message } = error as { matcherResult?: unknown; message?: unknown };
  if (typeof matcherResult !== 'object' || matcherResult === null || typeof message !== 'string' || !positiveEvidence(matcherResult)) return undefined;
  const text = message.replace(ANSI, '');
  if (!text.includes('strict mode violation')) return undefined;
  const count = /resolved to (\d{1,6}) elements/u.exec(text)?.[1];
  return count === undefined ? undefined : Number(count);
}

/** Maps anything the code, Playwright or the binding threw to a closed code. The text of the incoming error is never copied. */
function closeStepError(error: unknown, fenced: boolean): ObservedErrorCode {
  if (error instanceof ObservedRefusal) return error.code;
  if (error instanceof OriginNotAllowed) return 'POLICY_REFUSED';
  if (typeof error === 'object' && error !== null && 'matcherResult' in error) return !fenced && strictViolationCount(error) !== undefined ? 'TARGET_DRIFT' : 'ASSERTION_FAILED';
  const closed = closePlaywrightError(error, fenced ? 'postFence' : 'preFence');
  if (closed instanceof ClosedActionError) return fromClosedAction(closed.code, fenced);
  if (closed instanceof ObservedRefusal) return closed.code;
  return fenced ? 'OUTCOME_UNKNOWN' : 'TARGET_DRIFT';
}

/** Rejects when the control's own deadline passes or its signal aborts, so code that never returns cannot hold the step open. */
function stopWatch(control: InvocationControl): { readonly stopped: Promise<never>; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    const stop = (): void => {
      try { control.check(); } catch (error) { reject(error instanceof Error ? error : new ObservedRefusal('CANCELLED')); return; }
      reject(new ObservedRefusal('CANCELLED'));
    };
    // A timer can fire a hair before the control's own clock says the deadline passed: the control decides, so poison it first.
    const expire = (): void => { control.poison('TIMEOUT'); stop(); };
    abort = stop;
    const left = control.remainingMs?.();
    if (left !== undefined) timer = setTimeout(expire, Math.max(1, left));
    if (control.signal.aborted) stop();
    else control.signal.addEventListener('abort', stop, { once: true });
  });
  stopped.catch(() => undefined);
  return {
    stopped,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      if (abort !== undefined) control.signal.removeEventListener('abort', abort);
    },
  };
}

export async function runStep(step: FrozenStep, run: StepRun): Promise<StepResult> {
  const built = construct(step);
  if (!('fn' in built)) return refused(run.vars, built.syntax);
  const admitted = built.fn;

  const binding = createBinding({ control: run.control, allowedDomains: run.allowedDomains, pages: [run.page, ...(run.pages ?? [])], ...(run.tally === undefined ? {} : { tally: run.tally }), ...(run.untilFence === true ? { untilFence: true } : {}), ...(run.beforeCall === undefined ? {} : { beforeCall: run.beforeCall }), ...(run.adoptPage === undefined ? {} : { adoptPage: run.adoptPage }) });
  const watch = stopWatch(run.control);
  let failure: { readonly error: unknown } | undefined;
  try {
    binding.applyDefaults(run.page, run.context);
    const running = admitted(binding.wrap(run.page), binding.wrap(run.context), binding.wrapExpect(run.expect), run.inputs, run.secrets, binding.wrapVars(run.vars), undefined, undefined, undefined, undefined);
    await Promise.race([running, watch.stopped]);
    await Promise.race([binding.settle(), watch.stopped]);
    run.control.check();
    if (!binding.fenceReached) await run.afterBlock?.();
  } catch (error) {
    // In until-fence mode nothing after the stop counts, not even what the code did after it swallowed the stop.
    if (!binding.fenceReached) failure = { error };
  } finally {
    watch.dispose();
    // Whatever the code left behind (timers, listeners, route handlers, un-awaited calls) can no longer reach the page.
    binding.revoke();
  }
  const common = { fenceCrossed: binding.fenceCrossed, effects: binding.effects, effectsTruncated: binding.effectsTruncated, vars: run.vars, offscreen: binding.offscreen, fenceReached: binding.fenceReached };
  if (failure === undefined) return { ok: true, ...common };
  const closedCode = closeStepError(failure.error, binding.fenceCrossed);
  // The count the matcher itself reported wins over one a swallowed, earlier waitFor miss may have left behind.
  const matchCount = strictViolationCount(failure.error) ?? binding.matchCount;
  return { ok: false, closedCode, ...common, ...(closedCode === 'TARGET_DRIFT' && matchCount !== undefined ? { matchCount } : {}) };
}
