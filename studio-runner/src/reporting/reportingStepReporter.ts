/**
 * The `StepReporter` implementation story 10.2 left as a seam (AC-14a, AC-15, AC-16).
 *
 * 10.2 shipped `StepReporter` as an interface with a comment naming this story as its supplier.
 * This is that supplier — it is wired into the **existing** seam rather than running alongside a
 * parallel reporting path, so the executor's per-step outcomes (`PASSED | FAILED | SKIPPED`, null
 * timings for skipped steps) reach the wire exactly as the executor produced them.
 *
 * **Reporting is asynchronous to execution.** `stepStarted` and `stepFinished` return `void` and
 * return immediately: they update the in-memory snapshot synchronously and hand the delivery to a
 * detached promise. A slow or failing callback therefore cannot block a step, delay a step or
 * change a step's recorded timings — which is the property AC-15 is actually about. The detached
 * promises are tracked so the drain path can wait for them rather than losing them (AC-12), and
 * so nothing ever surfaces as an unhandled rejection.
 *
 * **`STARTED` is sent from `markBrowserStarted`, not from admission and not from a call
 * beginning.** A run whose launcher never reports a launch sends no `STARTED` at all, and because
 * sequence numbers are assigned synchronously at build time, `STARTED` always carries a lower
 * `runnerSequence` than any step report (AC-14a).
 */
import type {
  StepFinishedEvent,
  StepReporter,
  StepStartedEvent,
} from '../executor/adapters/StepReporter.js';
import type { ReportClient } from './reportClient.js';
import type { EvidenceState, ReportBody, RunOutcome, RunSnapshot } from './snapshot.js';

export interface RunReporter extends StepReporter {
  /**
   * Records the browser start and sends `STARTED`. Call this only once the browser has actually
   * started — not when admission succeeds, and not when an HTTP call begins.
   */
  browserStarted(): void;
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

export function createRunReporter(options: RunReporterOptions): RunReporter {
  const { snapshot, client } = options;
  const built: ReportBody[] = [];
  const pending = new Set<Promise<void>>();

  /**
   * Fire-and-forget delivery. The promise is retained so `settled()` can wait for it; the
   * `catch` exists because a rejection here must never become an unhandled rejection that takes
   * the process down mid-run.
   */
  const dispatch = (body: ReportBody): void => {
    built.push(body);
    const task = client
      .deliverProgress(body)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        pending.delete(task);
      });
    pending.add(task);
  };

  return {
    built,

    browserStarted(): void {
      if (snapshot.browserStarted) return;
      snapshot.markBrowserStarted();
      dispatch(snapshot.build('STARTED'));
    },

    stepStarted(event: StepStartedEvent): void {
      snapshot.stepStarted(event.stepIndex, event.startedAtMs);
      dispatch(snapshot.build('PROGRESS'));
    },

    stepFinished(event: StepFinishedEvent): void {
      // The executor's outcome reaches the wire unchanged, null timings included (AC-15).
      snapshot.stepFinished({
        stepIndex: event.stepIndex,
        status: event.status,
        startedAtMs: event.startedAtMs,
        finishedAtMs: event.finishedAtMs,
        durationMs: event.durationMs,
        failure: event.failure,
      });
      dispatch(snapshot.build('PROGRESS'));
    },

    async sendFinal(outcome: RunOutcome, evidence: EvidenceState): Promise<void> {
      const body = snapshot.build('FINAL', outcome, evidence);
      built.push(body);
      await client.deliverTerminal(body);
    },

    async settled(): Promise<void> {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
  };
}
