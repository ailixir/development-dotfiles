import type { Redactor } from '../executor/redaction.js';
export interface DiagnosticIdentity {
    sessionId: string;
    contextId: string;
    admissionId: string;
    stepId: string;
    ordinal: number;
}
export declare function redactFailure(error: unknown, knownValues: readonly string[] | Redactor): string;
/**
 * The start-up refusal the worker answers on the wire (`CONTEXT_LOST`), with everything that caused it
 * kept as `cause`. The wire code and message are unchanged; only the worker's own log reads the rest.
 * `phase` and `loss` come from closed vocabularies owned by the runtime (REL-001).
 */
export declare class GuidedStartFailure extends Error {
    readonly phase: string | null;
    readonly loss: string | null;
    constructor(phase: string | null, loss: string | null, cause: unknown);
}
export interface StartRefusalFacts {
    readonly operation: string;
    readonly sessionId: string;
    readonly elapsedMs: number;
}
/**
 * One value-free line for a refused `assign` or `context` (REL-001): the route, a hash prefix of the
 * session (the sidecar file name uses the full hash), the elapsed milliseconds and the cause chain as
 * closed codes, error class names, errno codes, the failed step and, for a browser process that
 * exited, its exit code and signal. No message text, path, URL or session id is ever written.
 */
export declare function describeStartFailure(error: unknown, facts: StartRefusalFacts): string;
/** Bounded, non-authoritative sidecar. Consumption/recovery never reads this file. */
export declare class GuidedDiagnostics {
    private readonly directory;
    private readonly maxRecords;
    private readonly maxBytes;
    private records;
    private bytes;
    readonly path: string;
    constructor(directory: string, sessionId: string, maxRecords?: number, maxBytes?: number);
    record(identity: DiagnosticIdentity, error: unknown, knownValues: readonly string[] | Redactor, stderr: (text: string) => void): Promise<string>;
}
