/**
 * STUDIO-OBS-009 AC-11 d (lane R1, R8.2 deferral): the runner counter an operational alert is built on.
 *
 * 012A's R8 incident was a terminal report the API refused (`400 INVALID_REPORT` on a pre-Ready FINAL) and the runner
 * dropped: the run was settled only by the API's reaper, and nothing on the runner side said so. The architect assigned the
 * alert to this story (R8.2 `decision.deferred`): "operational alert on the runner counter `terminalAbandoned` /
 * `report.terminal_rejected`". The alert itself is a platform artefact (AC-5/AC-4 chart and SIEM routing, owner Platform/SRE);
 * what the runner owes it is a counter and a log line that mean one thing, every time, and nothing else.
 *
 * This file pins that contract, with no harness and no browser, over the report client alone:
 *
 * - one counter, `runner.report.terminal_abandoned`, which every way a terminal report ends undelivered increments exactly once
 *   (a refusal the API will not change, retries that ran out, a delivery window that ran out);
 * - the two events that name which of those it was (`report.terminal_rejected`, `report.terminal_abandoned`), error level, with
 *   the report's identity, the attempt count and the HTTP status or transport kind, and no body text, no message, no value;
 * - a delivery, an ownership loss (`409`) and a dropped progress report never increment it.
 *
 * The end-to-end case (a refused pre-Ready FINAL on a real run, then the reaper) is `observedReplayAdmission.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_REPORT_BOUNDS } from '../../src/reporting/bounds.js';
import type { HttpOutcome } from '../../src/reporting/httpClient.js';
import { createReportClient, REPORT_COUNTERS } from '../../src/reporting/reportClient.js';
import type { ReportBody } from '../../src/reporting/snapshot.js';
import { NULL_REDACTOR } from '../../src/executor/redaction.js';
import { createLogger, createRecordingLogSink } from '../../src/server/logging.js';

/** The exact strings an alert rule is written against. Changing one is a change to that rule, so it is pinned. */
const COUNTER = 'runner.report.terminal_abandoned';
const CANARY = 'terminal-abandoned-body-canary-3f1c';

const body = (kind: 'FINAL' | 'PROGRESS' = 'FINAL'): ReportBody => ({
  executionId: 'exec-1', attemptId: 'attempt-1', admissionId: 'adm-1', runnerInstanceId: 'runner-a', kind, runnerSequence: 1,
  reportedAt: '2026-10-18T10:00:00.000Z', browserStartedAt: null, steps: [], logs: [], logsTruncated: false, runtimeVersions: { playwright: '1.63.0' },
  outcome: kind === 'FINAL' ? { result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' } : null,
  evidence: { videoKey: null, manifestKey: null, state: 'UNAVAILABLE', partial: false },
}) as unknown as ReportBody;

function rig(answers: (attempt: number) => HttpOutcome, terminal: { windowMs: number; maxAttempts: number; backoffMs: number } = { windowMs: 10_000, maxAttempts: 3, backoffMs: 10 }) {
  const sink = createRecordingLogSink();
  const logger = createLogger({ sink, clock: () => 'T' });
  let sends = 0, clock = 0;
  const client = createReportClient({
    http: { send(): Promise<HttpOutcome> { sends += 1; return Promise.resolve(answers(sends)); } },
    baseUrl: 'https://api.internal.example', identityToken: 'outbound-identity', bounds: DEFAULT_REPORT_BOUNDS, logger, redactor: NULL_REDACTOR,
    timeoutMs: 1000, terminal, now: () => clock, sleep: (ms: number) => { clock += ms; return Promise.resolve(); }, random: () => 0.5,
  });
  const lines = (event: string): Record<string, unknown>[] => sink.lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === event);
  return { client, logger, sink, lines, sends: () => sends, count: (): number => logger.counters.snapshot()[COUNTER] ?? 0 };
}

describe('AC-11 d (R8.2): the terminalAbandoned counter an alert is built on', () => {
  it('is named exactly runner.report.terminal_abandoned, and the other counters are distinct', () => {
    expect(REPORT_COUNTERS.terminalAbandoned).toBe(COUNTER);
    expect(new Set(Object.values(REPORT_COUNTERS)).size).toBe(Object.values(REPORT_COUNTERS).length);
  });

  it('a refusal the API will not change (400 INVALID_REPORT, the R8 incident) counts once, with one error line, and is not retried', async () => {
    const run = rig(() => ({ kind: 'response', status: 400, body: JSON.stringify({ error: 'INVALID_REPORT', message: `Invalid observed pre-Ready terminal report ${CANARY}` }) }));
    const result = await run.client.deliverTerminal(body());
    expect(result).toEqual({ kind: 'ABANDONED', attempts: 1 });
    expect(run.sends()).toBe(1);
    expect(run.count()).toBe(1);
    const rejected = run.lines('report.terminal_rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ level: 'error', executionId: 'exec-1', attemptId: 'attempt-1', admissionId: 'adm-1', runnerSequence: 1, status: 400, attempts: 1 });
    // Closed key set, and nothing of the API's answer: a body, a message and a value never reach the line the alert reads.
    expect(Object.keys(rejected[0] ?? {}).sort()).toEqual(['admissionId', 'attemptId', 'attempts', 'event', 'executionId', 'level', 'runnerSequence', 'status', 'ts']);
    expect(run.sink.lines.join('\n')).not.toContain(CANARY);
    expect(run.lines('report.terminal_abandoned')).toEqual([]);
    expect(run.lines('report.terminal_delivered')).toEqual([]);
  });

  it('retries that ran out count once, not once per attempt, and say how many were made', async () => {
    const run = rig(() => ({ kind: 'response', status: 503, body: '' }));
    const result = await run.client.deliverTerminal(body());
    expect(result).toEqual({ kind: 'ABANDONED', attempts: 3 });
    expect(run.sends()).toBe(3);
    expect(run.count()).toBe(1);
    expect(run.lines('report.terminal_abandoned')).toMatchObject([{ level: 'error', executionId: 'exec-1', attempts: 3 }]);
    expect(run.lines('report.terminal_rejected')).toEqual([]);
  });

  it('a transport failure that never recovers is counted the same way, with the transport kind and not a status', async () => {
    const run = rig(() => ({ kind: 'transport' } as HttpOutcome), { windowMs: 10_000, maxAttempts: 2, backoffMs: 10 });
    expect(await run.client.deliverTerminal(body())).toEqual({ kind: 'ABANDONED', attempts: 2 });
    expect(run.count()).toBe(1);
    expect(run.lines('report.terminal_abandoned')).toHaveLength(1);
  });

  it('a delivery window that runs out before the attempts do counts once', async () => {
    const run = rig(() => ({ kind: 'timeout' }), { windowMs: 900, maxAttempts: 10, backoffMs: 1000 });
    const result = await run.client.deliverTerminal(body());
    expect(result.kind).toBe('ABANDONED');
    expect(run.sends()).toBeLessThan(10);
    expect(run.count()).toBe(1);
    expect(run.lines('report.terminal_abandoned')).toHaveLength(1);
  });

  it('a non-retryable refusal after a retryable failure is still one count, with the attempt it ended on', async () => {
    const run = rig((attempt) => (attempt === 1 ? { kind: 'response', status: 502, body: '' } : { kind: 'response', status: 400, body: '{}' }));
    expect(await run.client.deliverTerminal(body())).toEqual({ kind: 'ABANDONED', attempts: 2 });
    expect(run.count()).toBe(1);
    expect(run.lines('report.terminal_rejected')).toMatchObject([{ status: 400, attempts: 2 }]);
  });

  it('every abandoned report adds one: two runs, two counts', async () => {
    const first = rig(() => ({ kind: 'response', status: 400, body: '{}' }));
    await first.client.deliverTerminal(body());
    await first.client.deliverTerminal({ ...body(), attemptId: 'attempt-2' } as ReportBody);
    expect(first.count()).toBe(2);
  });

  it('a delivery does not count, and is recorded as delivered', async () => {
    const run = rig(() => ({ kind: 'response', status: 200, body: '{}' }));
    expect(await run.client.deliverTerminal(body())).toEqual({ kind: 'ACKNOWLEDGED', attempts: 1 });
    expect(run.count()).toBe(0);
    expect(run.logger.counters.snapshot()['runner.report.terminal_delivered']).toBe(1);
    expect(run.lines('report.terminal_rejected')).toEqual([]);
    expect(run.lines('report.terminal_abandoned')).toEqual([]);
  });

  it('an ownership loss (409) is the API saying the runner no longer owns the attempt: its own counter, never this one, and silence after', async () => {
    const run = rig(() => ({ kind: 'response', status: 409, body: '{"code":"OWNERSHIP_LOST"}' }));
    expect(await run.client.deliverTerminal(body())).toEqual({ kind: 'OWNERSHIP_LOST', attempts: 1 });
    expect(run.count()).toBe(0);
    expect(run.logger.counters.snapshot()['runner.report.ownership_lost']).toBe(1);
    // Reporting has stopped for the run: a second terminal is dropped without a send and without a count.
    expect(await run.client.deliverTerminal(body())).toEqual({ kind: 'DROPPED', attempts: 0 });
    expect(run.sends()).toBe(1);
    expect(run.count()).toBe(0);
  });

  it('a progress report that is refused is dropped under its own counter and never reaches this one', async () => {
    const run = rig(() => ({ kind: 'response', status: 400, body: '{}' }));
    expect(await run.client.deliverProgress(body('PROGRESS'))).toEqual({ kind: 'DROPPED', attempts: 1 });
    expect(run.count()).toBe(0);
    expect(run.logger.counters.snapshot()['runner.report.progress_dropped']).toBe(1);
  });
});
