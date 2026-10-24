import type { SessionRecording } from '../server/adapters.js';
/**
 * The real runner error-code set (AC-17, ADR-002 open item **O-5**).
 *
 * Story 10.6 shipped three placeholders — `STEP_FAILED`, `RUN_ERROR`, `RUN_NOT_STARTED` — built
 * around a launcher that refused every launch. With a real browser the run has real failure
 * conditions, and this module is the single enumeration of the codes they map to.
 *
 * Two properties make the set worth having, and both are asserted in `test/run/errors.test.ts`
 * rather than left to inspection:
 *
 * **(a) Disjoint from the API's `ExecutionErrorCode`, except for `TIMEOUT` and `CANCELLED`.** Architecture §5.4
 * assigns every other value there to the dispatcher or a reaper; a runner that emitted one would
 * be claiming an observation it cannot make. §8.2 fixes exactly one runner-observable case — a
 * parent-enforced total timeout is `ERROR`/`TIMEOUT` — so `TIMEOUT` is *reserved* here and
 * **emitted by story 10.13**, which owns the enforcement. The test reads the contract's
 * enumeration rather than a copy of it, because 10.7 adds dispatch-time codes in the same wave.
 * Studio v1 WP4 adds the second shared value, `CANCELLED`, for a run stopped by
 * `DELETE /v2/runs/{id}` (ADR-002 §29); the API assigns its own copy only against a cancel it
 * recorded.
 *
 * **(b) Total.** {@link RunFailureKind} enumerates the run's failure conditions and
 * {@link errorCodeFor} switches exhaustively over them, so a new failure kind fails the
 * type-check instead of inventing a string at the call site.
 *
 * STUDIO-OBS-012A AC-3 removed the kinds only the deleted artifact-1 run path could produce —
 * `artifact-revalidation`, `runtime-incompatible`, `sandbox-unavailable`, `unsupported-multi-page`,
 * `url-scheme-not-permitted` and `secret-origin-not-allowed` — together with their codes.
 */
/**
 * Every `outcome.errorCode` this runner may emit, each traced to an observable condition.
 *
 * `RunOutcome.errorCode` is left open by the contract (`docs/specs/studio/openapi.yaml`,
 * `RunOutcome.errorCode`: "a runner-assigned code, left open rather than enumerated"), which is
 * exactly why the enumeration has to exist here: an open wire field is a licence to invent one
 * unless the producer enumerates its own.
 */
export declare const RUNNER_ERROR_CODES: {
    /** Chromium did not start. The generic case: no browser process, no readings (AC-6a). */
    readonly BROWSER_LAUNCH_FAILED: "BROWSER_LAUNCH_FAILED";
    /**
     * The job's admitted-start deadline had already elapsed at the launch point (AC-4, §5.2).
     *
     * Deliberately **not** `START_TIMEOUT`: that value belongs to the API's reaper (§5.4) and is
     * assigned when a runner never reports a start at all. This is the runner refusing, which is a
     * different observation made by a different component.
     */
    readonly START_DEADLINE_EXCEEDED: "START_DEADLINE_EXCEEDED";
    /**
     * The run could not produce or flush a recording **and had no assertion outcome to report**.
     *
     * A recording failure alone never becomes the run's outcome — §6.1, AC-8: evidence and outcome
     * are independent, and a run whose steps passed is `PASSED` with failed evidence. This code is
     * reachable only where the recording lifecycle failed before any step ran.
     */
    readonly RECORDING_FAILED: "RECORDING_FAILED";
    /** A step's assertion or action failed. The run stops at the first one (§5.2). */
    readonly STEP_FAILED: "STEP_FAILED";
    /**
     * **Reserved, not emitted here.** §8.2 fixes the parent-enforced total-runtime timeout as
     * `ERROR`/`TIMEOUT`, and it is the single value this set shares with `ExecutionErrorCode`.
     * Enforcement — the deadline, the kill and the emission — is story **10.13**.
     */
    readonly TIMEOUT: "TIMEOUT";
    /**
     * The run was stopped by `DELETE /v2/runs/{id}` (Studio v1 WP4, ADR-002 §29): ordered stop,
     * bounded grace, then the process tree — the deadline's own path, for a different reason. Also
     * the answer for a run cancelled before its browser started, which then never starts one.
     *
     * Shared with `ExecutionErrorCode` like `TIMEOUT`, and for the same reason: the condition is one
     * both sides observe. The API copies nothing; it assigns its own `CANCELLED` only where it
     * recorded the request.
     */
    readonly CANCELLED: "CANCELLED";
    /**
     * The run path itself threw where no enumerated condition applies: the scratch directory could
     * not be created, the child exited without a result, the protocol was violated.
     *
     * It is a residual, not a catch-all for conditions that have their own code above, and it is
     * the one placeholder from 10.6 that is **justified rather than replaced**: a component that
     * cannot report its own faults reports nothing, and "nothing" is what a reaper has to guess at.
     */
    readonly RUN_ERROR: "RUN_ERROR";
};
export declare const OBSERVED_RUNNER_ERROR_CODES: {
    /** An existing observed failure is annotated with the trusted login signature. */
    readonly LOGIN_REQUIRED: "LOGIN_REQUIRED";
    /** Observed password controls never grant a value-read capability. */
    readonly PASSWORD_CONTROL_READ_REFUSED: "PASSWORD_CONTROL_READ_REFUSED";
    /** Revalidated source input metadata no longer binds to its declaring step/slot. */
    readonly REFERENCE_MISMATCH: "REFERENCE_MISMATCH";
};
export type RunnerErrorCode = (typeof RUNNER_ERROR_CODES)[keyof typeof RUNNER_ERROR_CODES];
/** The enumeration as a list, for the disjointness and completeness assertions. */
export declare const RUNNER_ERROR_CODE_VALUES: readonly RunnerErrorCode[];
/**
 * The run's failure conditions.
 *
 * The union is the thing that keeps {@link RUNNER_ERROR_CODES} honest: `errorCodeFor` switches
 * over it exhaustively (`@typescript-eslint/switch-exhaustiveness-check` is an error in this
 * package), so adding a condition without giving it a code does not compile.
 */
export type RunFailureKind = 'browser-launch' | 'start-deadline' | 'recording' | 'step' | 'total-timeout' | 'cancelled' | 'run-fault';
/** Every failure kind, so a test can assert the mapping is total in both directions. */
export declare const RUN_FAILURE_KINDS: readonly RunFailureKind[];
/** The `outcome.result` each failure kind produces (§8.2). */
export type RunFailureResult = 'FAILED' | 'ERROR';
export declare function errorCodeFor(kind: RunFailureKind): RunnerErrorCode;
/**
 * §8.2: "a step locator or assertion timeout is `FAILED`; a parent-enforced total timeout is
 * `ERROR`". Everything that prevents the run from producing an assertion outcome is `ERROR`,
 * and a policy refusal is one of those: the action was never performed, so nothing was asserted.
 */
export declare function resultFor(kind: RunFailureKind): RunFailureResult;
/** Internal evidence carrier only; it never grants an executable session or invents a run origin. */
export declare class ObservedPreReadyFailure extends Error {
    readonly code: string;
    readonly recording: SessionRecording;
    constructor(code: string, recording: SessionRecording);
}
