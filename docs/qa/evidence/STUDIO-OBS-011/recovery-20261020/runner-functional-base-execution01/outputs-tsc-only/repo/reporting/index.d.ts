/**
 * Reporting surface (story 10.6): the observed admission CAS **client**, the progress/terminal
 * report client and the `StepReporter` implementation.
 *
 * The compare-and-set, the dispatch ledger, persistence, de-duplication, snapshot revisions,
 * restart recovery and the reapers are all on the other side of these HTTP calls and belong to
 * story 10.7. Nothing here persists anything: the runner has no database (architecture §9.2).
 */
export { admitObserved, newAdmissionIdentity } from './admissionClient.js';
export type { AdmissionClientOptions, AdmissionIdentity } from './admissionClient.js';
export { createFetchHttpClient } from './httpClient.js';
export type { HttpClient, HttpOutcome, HttpRequest } from './httpClient.js';
export type { JobConfiguration, JobDeadlines, JobEnvelope, JobIdentity, } from './envelope.js';
export { boundSteps, byteLength, DEFAULT_REPORT_BOUNDS } from './bounds.js';
export type { LogBuffer, LogEntry, RedactedLogEntry, ReportBounds } from './bounds.js';
export { createRunSnapshot, serializeBounded } from './snapshot.js';
export type { EvidenceState, ReportBody, ReportIdentity, ReportKind, RunOutcome, RunSnapshot, SnapshotStep, SnapshotStepStatus, } from './snapshot.js';
export { createReportClient, REPORT_COUNTERS } from './reportClient.js';
export type { DeliveryResult, ReportClient, ReportClientOptions } from './reportClient.js';
export { createRunReporter } from './reportingStepReporter.js';
export type { RunReporter, RunReporterOptions } from './reportingStepReporter.js';
