/**
 * Reporting surface (story 10.6): the observed admission CAS **client**, the progress/terminal
 * report client and the `StepReporter` implementation.
 *
 * The compare-and-set, the dispatch ledger, persistence, de-duplication, snapshot revisions,
 * restart recovery and the reapers are all on the other side of these HTTP calls and belong to
 * story 10.7. Nothing here persists anything: the runner has no database (architecture §9.2).
 */
export { admitObserved, newAdmissionIdentity } from './admissionClient.js';
export { createFetchHttpClient } from './httpClient.js';
// `createLogBuffer` is **deliberately absent from this surface** (ADR-002 O-16, story 10.18a).
// The factory hands out a truncating buffer, and what made its truncate-before-redact ordering
// worth closing rather than documenting was that it sat here, on the package's own module surface,
// one import away from a second producer. `append` now takes a branded already-redacted entry as
// well, so the deep import is closed too; this line is the surface half of the same closure.
// `test/server/surface.test.ts` holds it.
export { boundSteps, byteLength, DEFAULT_REPORT_BOUNDS } from './bounds.js';
export { createRunSnapshot, serializeBounded } from './snapshot.js';
export { createReportClient, REPORT_COUNTERS } from './reportClient.js';
export { createRunReporter } from './reportingStepReporter.js';
//# sourceMappingURL=index.js.map