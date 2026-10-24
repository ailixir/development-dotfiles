/**
 * Progress and terminal delivery (AC-13, AC-16, AC-17, AC-18, AC-19, AC-20, architecture §5.3).
 *
 * **Two retry policies, deliberately opposite, in the same file so neither can be "simplified"
 * into the other:**
 *
 * - `deliverProgress` (`STARTED`, `PROGRESS`) — one attempt, failure dropped. A lost progress
 *   delivery is repaired by the next cumulative snapshot, so retrying it buys nothing and costs
 *   an ordering hazard.
 * - `deliverTerminal` (`FINAL`) — retried until acknowledged, within a bounded count and window,
 *   with jitter. The API side is idempotent by `(attemptId, runnerSequence)`, so a duplicate is
 *   recognisable — **provided the duplicate is actually identical.**
 *
 * That proviso is the whole of AC-17. The `FINAL` body is serialized **once**, before the first
 * send, and the same string is handed to the client on every attempt. Nothing is recomputed per
 * attempt, timestamps included: the AC-13 timestamps describe the run, not the delivery. The
 * per-delivery attempt counter that a human debugging this will want travels as a header, where
 * it cannot change the bytes the API de-duplicates on.
 *
 * **Redaction happens on the serialized string, after serialization and before sending.** A field
 * added to `ReportBody` next year is redacted automatically, because the redactor sees the
 * finished payload rather than a list of fields somebody remembered to enumerate (AC-20).
 *
 * A `409` from the API on **any** report — ownership lost, superseded attempt, execution already
 * finalized — stops reporting for that run immediately and never escalates. It is not a delivery
 * failure to retry; it is the API saying this runner no longer owns the attempt, and the correct
 * response to that is silence plus an audit line and a counter (AC-18).
 */
import type { HttpClient } from './httpClient.js';
import type { ReportBody } from './snapshot.js';
import type { ReportBounds } from './bounds.js';
import type { Logger } from '../server/logging.js';
import type { Redactor } from '../executor/redaction.js';
export declare const REPORT_COUNTERS: {
    readonly progressDropped: "runner.report.progress_dropped";
    readonly terminalDelivered: "runner.report.terminal_delivered";
    readonly terminalAbandoned: "runner.report.terminal_abandoned";
    readonly ownershipLost: "runner.report.ownership_lost";
};
export type DeliveryResult = {
    readonly kind: 'ACKNOWLEDGED';
    readonly attempts: number;
}
/** The API says this runner no longer owns the attempt. Reporting stops; nothing escalates. */
 | {
    readonly kind: 'OWNERSHIP_LOST';
    readonly attempts: number;
} | {
    readonly kind: 'DROPPED';
    readonly attempts: number;
} | {
    readonly kind: 'ABANDONED';
    readonly attempts: number;
};
export interface ReportClientOptions {
    readonly http: HttpClient;
    readonly baseUrl: string;
    readonly identityToken: string;
    readonly bounds: ReportBounds;
    readonly logger: Logger;
    readonly redactor: Redactor;
    readonly timeoutMs: number;
    readonly terminal: {
        readonly windowMs: number;
        readonly maxAttempts: number;
        readonly backoffMs: number;
    };
    /** Monotonic milliseconds, for the delivery window. */
    readonly now: () => number;
    readonly sleep: (ms: number) => Promise<void>;
    /** `[0, 1)` jitter source. Injected so the retry schedule is deterministic under test. */
    readonly random: () => number;
    /**
     * Called when a progress acknowledgement carries `cancelRequested: true` (ADR-002 §29). The API
     * answers the pod that holds the run, so this is one of the two pull paths a cancel reaches it
     * by; the other is the control read.
     */
    readonly onCancelRequested?: (() => void) | undefined;
}
/** True when an acknowledgement body says a cancel is recorded. Anything unreadable is false. */
export declare function ackRequestsCancel(body: string): boolean;
/** Secret-bearing executions fail closed on malformed or mismatched control authority. */
export declare function validSecretControl(body: string, executionId: string): boolean;
export interface ReportClient {
    /** Best-effort single attempt. A failure is dropped; the next snapshot repairs the gap. */
    deliverProgress(body: ReportBody): Promise<DeliveryResult>;
    /** Bounded idempotent retry of byte-identical `FINAL` bytes. */
    deliverTerminal(body: ReportBody): Promise<DeliveryResult>;
    /** True once a `409` has stopped reporting for this run (AC-18). */
    readonly stopped: boolean;
    /** Every byte sequence handed to the HTTP client, in order. Test seam for AC-17 and AC-20. */
    readonly sentBodies: readonly string[];
}
export declare function createReportClient(options: ReportClientOptions): ReportClient;
