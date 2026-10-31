import { stepHashOf } from '../../src/executor/observedReplay.js';
import { TEST_DOMAINS } from './allowedDomains.js';
/**
 * A **real** launcher over a fake spawn seam, driven message by message (10.13).
 *
 * The kill path's interesting properties are compositional: the coordinator arms a deadline, the
 * launcher orders a stop, waits out a bounded grace, signals a group and then decides what to say
 * about the run. A fake launcher would let the test assert its own arrangement back to itself — so
 * what is faked here is the **spawn**, and everything above it is the code that ships.
 *
 * The child is a script the test writes, speaking the observed replay protocol (`Ready3`,
 * `StepStarted3`, `StepFinished3`, `Result3`) that the real launcher validates frame by frame:
 * answer `ready` or do not, report a step and hang, honour `stop` or ignore it, write to its
 * streams. STUDIO-OBS-012A AC-3 retargeted this driver from the deleted artifact-1 child protocol;
 * `test/fixtures-tier/observed-bootstrap-process-tree.test.ts` drives the observed launcher against
 * real Chromium and looks for the processes afterwards.
 */
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import type { ChildLauncherOptions } from '../../src/run/launcher.js';
import type { Execute3, Launch3 } from '../../src/executor/observedOperations.js';
import type { BrowserLauncher } from '../../src/server/adapters.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';
import { createFakeSpawner } from './child.js';
import type { FakeChildProcess, FakeSpawner } from './child.js';

export interface ChildScript {
  /** Answers the launch handshake. `false` drives the launch-failure row. */
  readonly ready?: boolean;
  /**
   * Holds the `ready` answer until {@link ChildDriver.releaseReady}.
   *
   * The gap between the admission CAS and the handshake **is** the queue time AC-1 is about, and a
   * fake clock does not advance on its own. Holding the handshake lets a test spend queue time and
   * then watch the runtime budget start from the whole of itself.
   */
  readonly holdReady?: boolean | undefined;
  /**
   * A run that simply finishes as soon as it is asked to execute: every step passes, or the step
   * at `failAt` fails with `errorCode` and the rest are skipped.
   */
  readonly result?:
    | { readonly ok: boolean; readonly errorCode: string | null; readonly failAt?: number | undefined }
    | undefined;
  /** The step the child reports as started and never finishes — the hang. Earlier steps pass. */
  readonly hangOnStep?: number | undefined;
  /** What the child does when the parent orders a stop. */
  readonly onStop?: 'flush' | 'ignore' | 'ignore-and-survive-kill' | undefined;
  /** Lines the child writes to its captured streams once it is asked to execute. */
  readonly writes?: readonly { readonly stream: 'stdout' | 'stderr'; readonly chunk: string }[];
}

export interface ChildDriver {
  readonly launcher: BrowserLauncher;
  readonly spawner: FakeSpawner;
  /** The spawned child, once `launch` has been called. */
  child(): FakeChildProcess;
  /** Writes to the child's captured output after the fact, e.g. after the kill. */
  write(stream: 'stdout' | 'stderr', chunk: string): void;
  /** The per-run scratch directory the parent handed the child, once `launch` has been sent. */
  scratchPath(): string | null;
  /** Answers a handshake held by `holdReady`, after the test has spent some queue time. */
  releaseReady(): void;
}

/** The step reading the scripted child reports for step `index` (its own run clock). */
export function scriptedStartMs(index: number): number {
  return 12 + 10 * index;
}

export function createChildDriver(
  script: ChildScript = {},
  overrides: Partial<ChildLauncherOptions> = {},
): ChildDriver {
  const spawner = createFakeSpawner();
  let spawned: FakeChildProcess | null = null;
  let scratchPath: string | null = null;
  let releaseReady: (() => void) | null = null;

  const launcher = createChildBrowserLauncher({
    recording: { width: 1280, height: 720 },
    seekOriginCalibrationMs: 0, allowedDomains: TEST_DOMAINS,
    stepTimeoutMs: 30_000,
    launchTimeoutMs: 60,
    maxFailureMessageLength: 400,
    // Short enough that a test can wait it out for real, long enough that an ordered stop the
    // child *does* honour lands inside it.
    stopTimeoutMs: 30,
    spawner: {
      spawn(request): FakeChildProcess {
        const child: FakeChildProcess = spawner.spawn(request);
        spawned = child;
        child.survivesKill = script.onStop === 'ignore-and-survive-kill';

        let launch: Launch3 | null = null;
        let execute: Execute3 | null = null;
        const started = new Set<number>();
        const finished = new Set<number>();
        let resultSent = false;

        const base = (): { protocolVersion: 3; mode: 'observed'; runId: string; attemptId: string } => {
          if (launch === null) throw new Error('no launch frame yet');
          return { protocolVersion: 3, mode: 'observed', runId: launch.runId, attemptId: launch.attemptId };
        };
        const stepStarted = (index: number): void => {
          const step = execute?.steps[index];
          if (step === undefined) return;
          started.add(index);
          child.emit({ ...base(), kind: 'step-started', stepIndex: index, stepId: step.stepId, startedAtMs: scriptedStartMs(index) });
        };
        const stepFinished = (index: number, status: 'PASS' | 'FAIL' | 'SKIPPED', errorCode: string | null): void => {
          const step = execute?.steps[index];
          if (step === undefined || finished.has(index)) return;
          finished.add(index);
          const startedAtMs = status === 'SKIPPED' ? null : scriptedStartMs(index);
          const finishedAtMs = startedAtMs === null ? null : startedAtMs + 5;
          const crossed = status === 'PASS' || errorCode === 'OUTCOME_UNKNOWN';
          child.emit({ ...base(), kind: 'step-finished', stepIndex: index, stepId: step.stepId, status, startedAtMs, finishedAtMs, durationMs: startedAtMs === null ? null : 5, receipt: { closedCode: errorCode, stepHash: stepHashOf(step.operations), fenceCrossed: crossed, effects: crossed ? [{ method: 'click', completed: errorCode === null }] : [], effectsTruncated: false, offscreen: false } });
        };
        const result = (ok: boolean, errorCode: string | null): void => {
          if (launch === null || resultSent) return;
          resultSent = true;
          child.emit({
            ...base(),
            kind: 'result',
            admissionId: launch.admission.admissionId,
            profileHash: hashObserved(launch.profile),
            build: launch.build,
            ok,
            errorCode,
            secretUse: {},
            recording: { path: null, bytes: null, errorCode: null, state: 'UNAVAILABLE', partial: false },
          });
        };

        const answerReady = (): void => {
          if (launch === null) return;
          child.emit({
            ...base(),
            kind: 'ready',
            profileHash: hashObserved(launch.profile),
            build: launch.build,
            admissionId: launch.admission.admissionId,
            browserStartedAt: '2026-09-11T10:00:00.000Z',
            startedAtMs: 0,
            calibrationOffsetMs: 0,
          });
        };

        /**
         * The child's reaction to a parent frame, on the next turn of the loop.
         *
         * Asynchronous on purpose: a real child answers over a pipe, so a parent that only works
         * because its child replied synchronously inside `send` would be a parent that cannot work.
         */
        const react = (message: { kind: string }): void => {
          queueMicrotask(() => {
            if (message.kind === 'launch') {
              launch = message as Launch3;
              scratchPath = launch.scratchPath;
              if (script.ready !== false) {
                if (script.holdReady === true) releaseReady = answerReady;
                else answerReady();
              }
            }
            if (message.kind === 'execute') {
              execute = message as Execute3;
              for (const write of script.writes ?? []) child.write(write.stream, write.chunk);
              if (script.hangOnStep !== undefined) {
                for (let index = 0; index < script.hangOnStep; index += 1) {
                  stepStarted(index);
                  stepFinished(index, 'PASS', null);
                }
                stepStarted(script.hangOnStep);
              } else if (script.result !== undefined) {
                const { failAt, errorCode, ok } = script.result;
                for (const step of execute.steps) {
                  const index = step.stepIndex;
                  if (failAt !== undefined && index > failAt) {
                    stepFinished(index, 'SKIPPED', null);
                    continue;
                  }
                  stepStarted(index);
                  stepFinished(index, failAt === index ? 'FAIL' : 'PASS', failAt === index ? (errorCode ?? 'ASSERTION_FAILED') : null);
                }
                result(ok, ok ? null : (errorCode ?? 'ASSERTION_FAILED'));
              }
              // …and then nothing more. The run hangs until the parent decides otherwise.
            }
            if (message.kind === 'stop' && script.onStop === 'flush') {
              // The child honoured the ordered stop: the step in flight fails for the stop's reason,
              // the steps never reached are skipped, the result says CANCELLED, and it leaves.
              for (const step of execute?.steps ?? []) {
                const index = step.stepIndex;
                stepFinished(index, started.has(index) ? 'FAIL' : 'SKIPPED', started.has(index) ? 'CANCELLED' : null);
              }
              result(false, 'CANCELLED');
              child.end();
            }
            // Any other `onStop` is a child that ignores the stop: the grace expires and the
            // parent signals the group.
          });
        };

        const send = child.send.bind(child);
        return Object.assign(child, {
          send(message: Parameters<typeof send>[0]): void {
            send(message);
            react(message as { kind: string });
          },
        });
      },
    },
    childModulePath: '/dist/run/child.js',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/pwuser' },
    ...overrides,
  });

  return {
    launcher,
    spawner,
    child(): FakeChildProcess {
      if (spawned === null) throw new Error('nothing has been spawned yet');
      return spawned;
    },
    write(stream: 'stdout' | 'stderr', chunk: string): void {
      spawned?.write(stream, chunk);
    },
    scratchPath(): string | null {
      return scratchPath;
    },
    releaseReady(): void {
      const answer = releaseReady;
      releaseReady = null;
      answer?.();
    },
  };
}
