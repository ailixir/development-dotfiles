import { serializeBounded } from './snapshot.js';
export const REPORT_COUNTERS = {
    progressDropped: 'runner.report.progress_dropped',
    terminalDelivered: 'runner.report.terminal_delivered',
    terminalAbandoned: 'runner.report.terminal_abandoned',
    ownershipLost: 'runner.report.ownership_lost',
};
/** True when an acknowledgement body says a cancel is recorded. Anything unreadable is false. */
export function ackRequestsCancel(body) {
    try {
        const parsed = JSON.parse(body);
        return (typeof parsed === 'object' &&
            parsed !== null &&
            (parsed.cancelRequested === true || parsed.revoked === true));
    }
    catch {
        return false;
    }
}
/** Secret-bearing executions fail closed on malformed or mismatched control authority. */
export function validSecretControl(body, executionId) {
    try {
        const value = JSON.parse(body);
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return false;
        const control = value;
        return Object.keys(control).sort().join(',') === 'cancelRequested,executionId,revoked' && control.executionId === executionId && typeof control.cancelRequested === 'boolean' && typeof control.revoked === 'boolean';
    }
    catch {
        return false;
    }
}
function progressUrl(baseUrl, executionId) {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${base}/internal/studio/executions/${encodeURIComponent(executionId)}/progress`;
}
/** Whether an outcome means "try again with the same bytes" rather than "stop". */
function isRetryable(outcome) {
    if (outcome.kind === 'timeout' || outcome.kind === 'transport')
        return true;
    return outcome.status >= 500;
}
export function createReportClient(options) {
    const { http, baseUrl, identityToken, bounds, logger, redactor, timeoutMs, terminal } = options;
    const sentBodies = [];
    let stopped = false;
    const identityFieldsOf = (body) => ({
        executionId: body.executionId,
        attemptId: body.attemptId,
        admissionId: body.admissionId,
        runnerSequence: body.runnerSequence,
    });
    /**
     * Serializes, bounds and redacts **once**. The returned string is the payload: callers that
     * retry send this exact value again rather than rebuilding it.
     */
    const freezeBytes = (body) => redactor.redact(serializeBounded(body, bounds));
    const send = (body, bytes, attempt) => {
        sentBodies.push(bytes);
        return http.send({
            url: progressUrl(baseUrl, body.executionId),
            method: 'POST',
            headers: {
                authorization: `Bearer ${identityToken}`,
                'content-type': 'application/json',
                // Per-delivery metadata lives in headers so the body stays byte-identical (AC-17).
                'x-runner-delivery-attempt': String(attempt),
            },
            body: bytes,
            timeoutMs,
        });
    };
    const noteOwnershipLost = (body) => {
        stopped = true;
        logger.record('warn', 'report.ownership_lost', REPORT_COUNTERS.ownershipLost, {
            ...identityFieldsOf(body),
            kind: body.kind,
        });
    };
    return {
        sentBodies,
        get stopped() {
            return stopped;
        },
        async deliverProgress(body) {
            if (stopped)
                return { kind: 'DROPPED', attempts: 0 };
            const outcome = await send(body, freezeBytes(body), 1);
            if (outcome.kind === 'response' && outcome.status === 409) {
                noteOwnershipLost(body);
                return { kind: 'OWNERSHIP_LOST', attempts: 1 };
            }
            if (outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300) {
                if (ackRequestsCancel(outcome.body))
                    options.onCancelRequested?.();
                return { kind: 'ACKNOWLEDGED', attempts: 1 };
            }
            // Dropped on purpose. The next cumulative snapshot carries the state this one was
            // carrying, so there is nothing to re-run and nothing to replay (AC-16).
            logger.record('warn', 'report.progress_dropped', REPORT_COUNTERS.progressDropped, {
                ...identityFieldsOf(body),
                kind: body.kind,
                ...(outcome.kind === 'response' ? { status: outcome.status } : { reason: outcome.kind }),
            });
            return { kind: 'DROPPED', attempts: 1 };
        },
        async deliverTerminal(body) {
            if (stopped)
                return { kind: 'DROPPED', attempts: 0 };
            // Frozen once, here. Every attempt below re-sends this exact string.
            const bytes = freezeBytes(body);
            const deadline = options.now() + terminal.windowMs;
            let issued = 0;
            for (let attempt = 1; attempt <= terminal.maxAttempts; attempt += 1) {
                issued = attempt;
                const outcome = await send(body, bytes, attempt);
                if (outcome.kind === 'response' && outcome.status === 409) {
                    noteOwnershipLost(body);
                    return { kind: 'OWNERSHIP_LOST', attempts: attempt };
                }
                if (outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300) {
                    logger.record('info', 'report.terminal_delivered', REPORT_COUNTERS.terminalDelivered, {
                        ...identityFieldsOf(body),
                        attempts: attempt,
                    });
                    return { kind: 'ACKNOWLEDGED', attempts: attempt };
                }
                if (!isRetryable(outcome)) {
                    logger.record('error', 'report.terminal_rejected', REPORT_COUNTERS.terminalAbandoned, {
                        ...identityFieldsOf(body),
                        ...(outcome.kind === 'response' ? { status: outcome.status } : { reason: outcome.kind }),
                        attempts: attempt,
                    });
                    return { kind: 'ABANDONED', attempts: attempt };
                }
                if (attempt === terminal.maxAttempts)
                    break;
                // Jitter spreads a fleet of runners retrying against one API replica set.
                const backoff = terminal.backoffMs * attempt * (0.5 + options.random() * 0.5);
                const wait = Math.min(backoff, Math.max(0, deadline - options.now()));
                if (options.now() + wait >= deadline)
                    break;
                await options.sleep(wait);
                if (options.now() >= deadline)
                    break;
            }
            logger.record('error', 'report.terminal_abandoned', REPORT_COUNTERS.terminalAbandoned, {
                ...identityFieldsOf(body),
                attempts: issued,
            });
            return { kind: 'ABANDONED', attempts: issued };
        },
    };
}
//# sourceMappingURL=reportClient.js.map