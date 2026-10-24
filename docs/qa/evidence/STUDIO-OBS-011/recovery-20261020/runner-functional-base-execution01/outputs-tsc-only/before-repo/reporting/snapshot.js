import { boundSteps, createLogBuffer, redactLogEntry } from './bounds.js';
export function createRunSnapshot(options) {
    const { identity, bounds, runtimeVersions, wallClock, redactor } = options;
    const logs = createLogBuffer(bounds.maxLogEntries, bounds.maxLogEntryLength);
    const steps = new Map();
    const used = new Map();
    const validPass = (step) => step.status === 'PASS' && step.failure === null && step.startedAtMs !== null && step.finishedAtMs !== null && step.durationMs !== null && [step.startedAtMs, step.finishedAtMs, step.durationMs].every(n => Number.isFinite(n) && n >= 0) && step.finishedAtMs >= step.startedAtMs && Math.abs(step.durationMs - (step.finishedAtMs - step.startedAtMs)) < 0.001;
    let sequence = 0;
    let browserStartedAt = null;
    /**
     * Reads forwarded one by one. Not `{ ...logs }` and not `logs` itself: either would carry
     * `append` across and reopen the bypass this view exists to close.
     */
    const logView = {
        entries: () => logs.entries(),
        get truncated() {
            return logs.truncated;
        },
        get dropped() {
            return logs.dropped;
        },
    };
    const snapshot = {
        logs: logView,
        get browserStarted() {
            return browserStartedAt !== null;
        },
        get lastSequence() {
            return sequence;
        },
        markBrowserStarted(at) {
            browserStartedAt ??= at.toISOString();
        },
        stepStarted(stepIndex, startedAtMs) {
            steps.set(stepIndex, {
                stepIndex,
                status: 'RUNNING',
                startedAtMs,
                finishedAtMs: null,
                durationMs: null,
                failure: null,
            });
        },
        stepFinished(step) {
            if (browserStartedAt !== null && validPass(step))
                for (const name of options.observedSecretConsumers?.get(step.stepIndex) ?? []) {
                    const proofs = used.get(name) ?? new Set();
                    proofs.add(step.stepIndex);
                    used.set(name, proofs);
                }
            steps.set(step.stepIndex, { ...step });
        },
        appendLog(entry) {
            // Redact, then let the buffer bound. Every producer reachable from a run passes through
            // here, so a producer added later cannot skip it (AC-22) — and since ADR-002 O-16 the buffer
            // will not accept anything else: `append` takes a branded `RedactedLogEntry` that only
            // `redactLogEntry` mints, so the skip is a compile error rather than a watched risk.
            logs.append(redactLogEntry(entry, redactor));
        },
        build(kind, outcome = null, evidence = null) {
            sequence += 1;
            const ordered = [...steps.values()].sort((a, b) => a.stepIndex - b.stepIndex);
            // ADR-002 §11.2, restated as AC-11.4: **a report with `browserStartedAt: null` carries no
            // reading.** The runner enforces it here, as the producer, rather than trusting every call
            // site to have nothing to report — a reading taken before the origin existed would be on a
            // scale the wire has no way to name, and `minimum: 0` cannot tell a process-origin reading
            // from a legitimate late one (ADR-002 §11.6 item 3).
            const started = browserStartedAt !== null;
            const retained = started ? boundSteps(ordered, bounds.maxSteps) : options.allowUnstartedSkippedSteps ? boundSteps(ordered.filter(step => step.status === 'SKIPPED' && step.startedAtMs === null && step.finishedAtMs === null && step.durationMs === null && step.failure === null), bounds.maxSteps) : [];
            const support = new Set(retained.filter(validPass).map(step => step.stepIndex));
            const progressUse = Object.fromEntries([...used].filter(([, proofs]) => [...proofs].some(index => support.has(index))).map(([name]) => [name, 'USED']));
            return {
                ...identity,
                kind,
                runnerSequence: sequence,
                reportedAt: wallClock().toISOString(),
                browserStartedAt,
                steps: retained,
                logs: started ? logs.entries() : logs.entries().map(withoutReading),
                logsTruncated: logs.truncated,
                runtimeVersions,
                outcome: outcome ? { result: outcome.result, errorCode: outcome.errorCode, errorMessage: outcome.errorMessage, ...(outcome.detail ? { detail: outcome.detail } : {}) } : null,
                ...(kind === 'PROGRESS' && Object.keys(progressUse).length ? { secretUse: progressUse } : kind === 'FINAL' && outcome?.secretUse ? { secretUse: outcome.secretUse } : {}),
                evidence,
            };
        },
    };
    return snapshot;
}
/**
 * Serializes a report and, if the result exceeds the body bound, re-serializes a reduced form.
 *
 * The reduced form drops the logs first and the steps second: a terminal outcome the API can act
 * on is worth more than the diagnostics attached to it, and a report the API rejects for size is
 * a lost result the runner cannot replay.
 *
 * There is an **irreducible floor**: the identity fields, the runtime versions, the outcome and
 * the evidence state are the report. If `maxBodyBytes` is configured below that floor the minimal
 * form is emitted anyway, because a truncated identity is worse than a slightly oversized body —
 * the API could not attribute it to an attempt at all. Configure the bound above the floor; the
 * default (512 KiB) is three orders of magnitude above it.
 */
/** Strips a reading from a log entry, for the `browserStartedAt: null` invariant (AC-11.4). */
function withoutReading(entry) {
    return entry.atMs === null ? entry : { ...entry, atMs: null };
}
export function serializeBounded(body, bounds) {
    const full = JSON.stringify(body);
    if (Buffer.byteLength(full, 'utf8') <= bounds.maxBodyBytes)
        return full;
    const withoutLogs = { ...body, logs: [], logsTruncated: true, payloadReduced: true };
    const trimmed = JSON.stringify(withoutLogs);
    if (Buffer.byteLength(trimmed, 'utf8') <= bounds.maxBodyBytes)
        return trimmed;
    const minimal = { ...withoutLogs, steps: [] };
    // A progressive positive claim requires its PASS receipt in this same payload.
    if (minimal.kind === 'PROGRESS')
        delete minimal.secretUse;
    return JSON.stringify(minimal);
}
//# sourceMappingURL=snapshot.js.map