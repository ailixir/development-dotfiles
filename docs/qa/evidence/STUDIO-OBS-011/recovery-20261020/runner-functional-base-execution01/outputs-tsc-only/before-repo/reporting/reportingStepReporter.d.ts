/**
 * The `StepReporter` implementation story 10.2 left as a seam (AC-14a, AC-15, AC-16).
 *
 * 10.2 shipped `StepReporter` as an interface with a comment naming this story as its supplier.
 * This is that supplier — it is wired into the **existing** seam rather than running alongside a
 * parallel reporting path, so the executor's per-step outcomes (`PASS | FAIL | SKIPPED`, null
 * timings for skipped steps) reach the wire exactly as the executor produced them.
 *
 * **Reporting is asynchronous to execution.** `stepStarted` and `stepFinished` return `void` and
 * return immediately: they update the in-memory snapshot synchronously and hand the delivery to a
 * detached promise. A slow or failing callback therefore cannot block a step, delay a step or
 * change a step's recorded timings — which is the property AC-15 is actually about. The detached
 * deliveries are chained rather than fanned out, so the drain path can wait for them (AC-12),
 * nothing ever surfaces as an unhandled rejection, and a `409` really does stop the next report
 * instead of racing one that was already in the air (AC-18).
 *
 * **`STARTED` is sent from `markBrowserStarted`, not from admission and not from a call
 * beginning.** A run whose launcher never reports a launch sends no `STARTED` at all, and because
 * sequence numbers are assigned synchronously at build time, `STARTED` always carries a lower
 * `runnerSequence` than any step report (AC-14a).
 */
import type { StepReporter } from '../executor/stepReporter.js';
import type { ReportClient } from './reportClient.js';
import type { EvidenceState, ReportBody, RunOutcome, RunSnapshot } from './snapshot.js';
/**
 * The browser start, as observed (AC-10, AC-11.2).
 *
 * `startedAtMs` is a **reading** of the run clock — the result of subtracting the origin from the
 * monotonic sample that defined it — and is therefore exactly `0`. The browser-start log line
 * carries that reading. ADR-002 §4.1: `0` is the browser start, and it is a position on the
 * timeline rather than a missing value.
 */
export interface BrowserStartObservation {
    readonly browserStartedAt: Date;
    readonly startedAtMs: number;
}
export interface RunReporter extends StepReporter {
    /**
     * Records the browser start and sends `STARTED`. Call this only once the browser has actually
     * started — not when admission succeeds, and not when an HTTP call begins.
     *
     * The instant and the first run-clock reading arrive **together**, from the one place that
     * observed them: recording-context readiness (AC-10, AC-11.2). Nothing here reads a clock, so
     * there is no second origin to disagree with the first.
     */
    browserStarted(origin: BrowserStartObservation): void;
    /** Sends the terminal report with byte-identical bounded retry. Awaits delivery. */
    sendFinal(outcome: RunOutcome, evidence: EvidenceState): Promise<void>;
    /** Resolves once every detached progress delivery has settled (drain path, AC-12). */
    settled(): Promise<void>;
    /** Reports built, in build order. Test seam for sequence ordering (AC-13, AC-14a). */
    readonly built: readonly ReportBody[];
}
export interface RunReporterOptions {
    readonly snapshot: RunSnapshot;
    readonly client: ReportClient;
}
export declare function createRunReporter(options: RunReporterOptions): RunReporter;
