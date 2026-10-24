import type { AdmissionRequest, AdmissionReceipt } from '../executor/observedOperations.js';
import type { HttpClient } from './httpClient.js';
import type { Logger } from '../server/logging.js';
export interface AdmissionIdentity {
    /** Stable for the life of the process (AC-7). */
    readonly runnerInstanceId: string;
    /** Fresh per run, never reused, never regenerated for a retry that does not happen (AC-7). */
    readonly admissionId: string;
}
export interface AdmissionClientOptions {
    readonly http: HttpClient;
    readonly baseUrl: string;
    readonly identityToken: string;
    readonly timeoutMs: number;
    readonly logger: Logger;
}
/**
 * Fresh admission identity for one run.
 *
 * Called **once** per `POST /v2/runs`. There is deliberately no "regenerate" helper: a second
 * `admissionId` for the same `attemptId` is the failure mode AC-7 names, and the cheapest way to
 * prevent it is to give nobody a function that produces one.
 *
 * The v3 contract declares `admissionId` as a lowercase UUID (`replay-job#/definitions/AdmissionRequest`,
 * answered by `AdmissionReceipt`) and the ledger column is `UUID`, so the observed-admission route
 * refuses anything else before the CAS runs.
 */
export declare function newAdmissionIdentity(runnerInstanceId: string): AdmissionIdentity;
/** Observed CAS remains one send, with a closed receipt checked before any browser authority. */
export declare function admitObserved(options: AdmissionClientOptions, request: AdmissionRequest): Promise<AdmissionReceipt>;
