import { validateObserved, parseObservedBytes, equalObserved, demand, ObservedRefusal } from '../validator/observedReferencePolicy.js';
/**
 * Observed admission CAS **client** (AC-7, AC-8, AC-9, architecture §5.1.4).
 *
 * The compare-and-set itself is the API's. This file is the runner's half: it issues **exactly
 * one** `POST /internal/studio/executions/{id}/observed-admission` per run and accepts only a
 * closed receipt that echoes the request byte-for-byte. Anything else — a refusal, a timeout, a
 * transport loss, a redirect, a malformed or mismatched receipt — throws, and the coordinator
 * stops before any scratch directory or browser exists and answers `503`.
 *
 * **There is no retry here, at any level**, and the runner never generates a second
 * `admissionId` for the same `attemptId`: an ambiguous admission may already have been granted on
 * the API side, and a second request risks two runners owning one attempt (AC-7, AC-9).
 *
 * The artifact-1 admission client (`createAdmissionClient`, its `ADMITTED | REFUSED | AMBIGUOUS`
 * verdicts and counters) was deleted with the artifact-1 run route (STUDIO-OBS-012A AC-3).
 */
import { randomUUID } from 'node:crypto';
/** The execution's admission resource; the observed CAS posts to its `observed-admission` sibling. */
function admissionUrl(baseUrl, executionId) {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${base}/internal/studio/executions/${encodeURIComponent(executionId)}/admission`;
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
export function newAdmissionIdentity(runnerInstanceId) {
    return {
        runnerInstanceId,
        admissionId: randomUUID(),
    };
}
/** Observed CAS remains one send, with a closed receipt checked before any browser authority. */
export async function admitObserved(options, request) {
    validateObserved('replay-job#/definitions/AdmissionRequest', request, 65536);
    const response = await options.http.send({ url: admissionUrl(options.baseUrl, request.executionId).replace(/\/admission$/u, '/observed-admission'), method: 'POST', headers: { authorization: `Bearer ${options.identityToken}`, 'content-type': 'application/json' }, body: JSON.stringify(request), timeoutMs: options.timeoutMs, maxResponseBytes: 65536 });
    if (response.kind !== 'response' || response.status !== 200)
        throw new ObservedRefusal('AUTHORIZATION_EXPIRED');
    const receipt = validateObserved('replay-job#/definitions/AdmissionReceipt', parseObservedBytes(Buffer.from(response.body), 65536), 65536);
    demand(receipt.admissionId === request.admissionId && equalObserved(receipt.request, request), 'EVIDENCE_MISMATCH');
    demand(Date.parse(receipt.admittedAt) <= Date.now() && Date.parse(receipt.startDeadlineAt) > Date.now() && Date.parse(receipt.runDeadlineAt) >= Date.parse(receipt.startDeadlineAt), 'AUTHORIZATION_EXPIRED');
    return receipt;
}
//# sourceMappingURL=admissionClient.js.map