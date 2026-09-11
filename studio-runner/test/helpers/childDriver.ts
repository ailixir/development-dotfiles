/**
 * A **real** launcher over a fake spawn seam, driven message by message (10.13).
 *
 * The kill path's interesting properties are compositional: the coordinator arms a deadline, the
 * launcher orders a stop, waits out a bounded grace, signals a group and then decides what to say
 * about the recording. A fake launcher would let the test assert its own arrangement back to
 * itself — so what is faked here is the **spawn**, and everything above it is the code that ships.
 *
 * The child is therefore a script the test writes: answer `ready` or do not, report a step and
 * hang, honour `stop` or ignore it, write to stdout, die. That is enough to reach every row of
 * AC-3's five-condition table without launching a browser, which is what keeps the unit tier
 * browser-free (AC-20). `test/fixtures-tier/deadline-cleanup.test.ts` drives the same code against
 * real Chromium and looks for the processes afterwards.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import type { ChildLauncherOptions } from '../../src/run/launcher.js';
import type { BrowserLauncher } from '../../src/server/adapters.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import type { RunnerEvidenceState } from '../../src/run/recording.js';
import { SCRATCH_SUBDIRECTORIES } from '../../src/run/scratchLayout.js';
import { createFakeSpawner } from './child.js';
import type { FakeChildProcess, FakeSpawner } from './child.js';

export interface ChildScript {
  /** Answers the launch handshake. Omit to drive the `BROWSER_LAUNCH_FAILED` row. */
  readonly ready?: boolean;
  /**
   * Holds the `ready` answer until {@link ChildDriver.releaseReady}.
   *
   * The gap between the admission CAS and the handshake **is** the queue time AC-1 is about, and a
   * fake clock does not advance on its own. Holding the handshake lets a test spend nine-tenths of
   * the queue budget and then watch the runtime budget start from the whole of itself.
   */
  readonly holdReady?: boolean | undefined;
  /** A result the child reports as soon as it is asked to execute — a run that simply finishes. */
  readonly result?:
    | {
        readonly ok: boolean;
        readonly failureKind: string | null;
        readonly failureMessage: string | null;
      }
    | undefined;
  /** Step indices the child reports as started and never finishes — the hang. */
  readonly hangOnStep?: number | undefined;
  /** What the child does when the parent orders a stop. */
  readonly onStop?: 'flush' | 'ignore' | 'ignore-and-survive-kill' | undefined;
  /** The recording the child reports when it flushes. */
  readonly recording?:
    | {
        readonly path: string | null;
        readonly bytes: number | null;
        readonly error: string | null;
        readonly state: RunnerEvidenceState;
        readonly partial: boolean;
      }
    | undefined;
  /** Lines the child writes to its captured streams before it hangs. */
  readonly writes?: readonly { readonly stream: 'stdout' | 'stderr'; readonly chunk: string }[];
  /**
   * A file left in the run's video directory, the way Chromium's incremental writer does.
   *
   * This is what makes AC-16 case (b) drivable without a browser: the recorder has already put a
   * readable prefix on disk when the tree is signalled, so the parent finds a **playable** file
   * belonging to a run whose ordered stop never completed.
   */
  readonly leavesVideo?: { readonly bytes: number; readonly header: boolean } | undefined;
}

export interface ChildDriver {
  readonly launcher: BrowserLauncher;
  readonly spawner: FakeSpawner;
  /** The spawned child, once `launch` has been called. */
  child(): FakeChildProcess;
  /** Writes to the child's captured output after the fact, e.g. after the kill (AC-8). */
  write(stream: 'stdout' | 'stderr', chunk: string): void;
  /** The per-run scratch directory the parent handed the child, once `launch` has been sent. */
  scratchPath(): string | null;
  /** Answers a handshake held by `holdReady`, after the test has spent some queue time. */
  releaseReady(): void;
}

const FLUSHED_RECORDING = {
  path: '/scratch/run-1/video/page.webm',
  bytes: 24_576,
  error: null,
  state: 'PENDING' as const,
  partial: false,
};

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

        /**
         * The child's reaction to a parent message, on the next turn of the loop.
         *
         * Asynchronous on purpose: a real child answers over a pipe, so a parent that only works
         * because its child replied synchronously inside `send` would be a parent that cannot
         * work. `queueMicrotask` is the smallest delay that still crosses a turn.
         */
        const answerReady = (): void => {
          child.emit({
            kind: 'ready',
            browserStartedAt: '2026-09-11T10:00:00.000Z',
            startedAtMs: 0,
          });
        };

        const react = (message: { kind: string; scratchPath?: string }): void => {
          const kind = message.kind;
          queueMicrotask(() => {
            if (kind === 'launch' && typeof message.scratchPath === 'string') {
              scratchPath = message.scratchPath;
            }
            if (kind === 'launch' && script.ready !== false) {
              if (script.holdReady === true) releaseReady = answerReady;
              else answerReady();
            }
            if (kind === 'execute') {
              for (const write of script.writes ?? []) child.write(write.stream, write.chunk);
              if (script.leavesVideo !== undefined && scratchPath !== null) {
                // The recorder is mid-file. Nothing has closed the context, so what is on disk is
                // a prefix — readable, incomplete, and exactly what a kill leaves behind.
                const directory = join(scratchPath, SCRATCH_SUBDIRECTORIES.video);
                mkdirSync(directory, { recursive: true });
                const buffer = Buffer.alloc(script.leavesVideo.bytes, 0x42);
                if (script.leavesVideo.header) Buffer.from(WEBM_MAGIC).copy(buffer, 0);
                writeFileSync(join(directory, 'page.webm'), buffer);
              }
              if (script.hangOnStep !== undefined) {
                child.emit({ kind: 'step-started', stepIndex: script.hangOnStep, startedAtMs: 12 });
              }
              if (script.result !== undefined) {
                child.emit({
                  kind: 'result',
                  ok: script.result.ok,
                  executorVersion: '1.0.0',
                  failureKind: script.result.failureKind,
                  failureMessage: script.result.failureMessage,
                  recording: script.recording ?? FLUSHED_RECORDING,
                  observedHosts: [],
                });
              }
              // …and then nothing more. The run hangs until the parent decides otherwise.
            }
            if (kind === 'stop' && script.onStop === 'flush') {
              // The child honoured the ordered stop: it closed and awaited the recording context,
              // reported what that left, and left. This is AC-16 case (a).
              child.emit({
                kind: 'result',
                ok: false,
                executorVersion: '',
                failureKind: 'run-fault',
                failureMessage: 'The parent ordered this run to stop before it finished.',
                recording: script.recording ?? FLUSHED_RECORDING,
                observedHosts: [],
              });
              child.end();
            }
            // Any other `onStop` is a child that ignores the stop: the grace expires and the
            // parent signals the group. That is AC-16 case (b) or (c).
          });
        };

        const send = child.send.bind(child);
        return Object.assign(child, {
          send(message: Parameters<typeof send>[0]): void {
            send(message);
            react(message as { kind: string; scratchPath?: string });
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
