/**
 * In-process doubles for the browser child (10.12).
 *
 * They exist so the parent↔child protocol and the run's exit paths can be exercised in the **unit
 * tier**, which stays browser-free (AC-25). `test/fixtures-tier/` drives the same code against real
 * Chromium.
 *
 * Like `test/helpers/runner.ts`, these live under `test/` rather than `src/`: a fake browser has
 * no business shipping inside the image whose entire job is to be the only thing that launches a
 * real one, and keeping them out of `src/` keeps them out of the coverage gate.
 *
 * STUDIO-OBS-012A AC-3 deleted the recording fake page, fake locators and fake browser factory that
 * drove the artifact-1 Playwright operation adapter; what remains is the spawn seam.
 */
import type {
  ChildProcessHandle,
  ChildSpawnRequest,
  ChildSpawner,
} from '../../src/run/launcher.js';
import type { ParentMessage } from '../../src/run/protocol.js';

/**
 * A stand-in for `BrowserHandle.page`, which no run-path code drives any more (the handle keeps it
 * only as the fixtures tier's inspection seam).
 */
export function createFakePage(): Readonly<Record<string, never>> {
  return {};
}

// ── A spawner that spawns nothing ─────────────────────────────────────────────────────────────

export interface FakeChildProcess extends ChildProcessHandle {
  readonly sent: ParentMessage[];
  /** Delivers a message to the parent, as the real child would over IPC. */
  emit(value: unknown): void;
  /** Writes to the child's captured stdout/stderr, as Playwright or Chromium would (AC-8). */
  write(stream: 'stdout' | 'stderr', chunk: string): void;
  /** Ends the process, as an exit would. */
  end(code?: number): void;
  readonly killed: number;
  /**
   * Makes `kill` **not** end the process, the way a `SIGKILL` to the fork leaves Chromium running.
   *
   * There is no in-process way to orphan a browser, so this is the unit tier's stand-in for it:
   * the real observation is `test/fixtures-tier/deadline-cleanup.test.ts`, which enumerates pids.
   */
  survivesKill: boolean;
}

export interface FakeSpawner extends ChildSpawner {
  /** Narrowed, so a caller wrapping the child keeps the driving surface (10.13). */
  spawn(request: ChildSpawnRequest): FakeChildProcess;
  /** Every spawn request, exactly as it would have been handed to the operating system. */
  readonly requests: ChildSpawnRequest[];
  readonly children: FakeChildProcess[];
}

export function createFakeSpawner(): FakeSpawner {
  const requests: ChildSpawnRequest[] = [];
  const children: FakeChildProcess[] = [];
  return {
    requests,
    children,
    spawn(request: ChildSpawnRequest): FakeChildProcess {
      requests.push(request);
      const sent: ParentMessage[] = [];
      const messageListeners: ((value: unknown) => void)[] = [];
      const exitListeners: ((code: number | null, signal: string | null) => void)[] = [];
      const outputListeners: ((stream: 'stdout' | 'stderr', chunk: string) => void)[] = [];
      let killed = 0;
      let ended = false;
      const child: FakeChildProcess = {
        sent,
        pid: 4242,
        survivesKill: false,
        get killed(): number {
          return killed;
        },
        send(message: ParentMessage): void {
          sent.push(message);
        },
        onMessage(listener: (value: unknown) => void): void {
          messageListeners.push(listener);
        },
        onExit(listener: (code: number | null, signal: string | null) => void): void {
          exitListeners.push(listener);
        },
        onOutput(listener: (stream: 'stdout' | 'stderr', chunk: string) => void): void {
          outputListeners.push(listener);
        },
        kill(): void {
          killed += 1;
          if (!child.survivesKill) child.end();
        },
        emit(value: unknown): void {
          for (const listener of messageListeners) listener(value);
        },
        write(stream: 'stdout' | 'stderr', chunk: string): void {
          for (const listener of outputListeners) listener(stream, chunk);
        },
        end(code = 0): void {
          if (ended) return;
          ended = true;
          for (const listener of exitListeners) listener(code, null);
        },
      };
      children.push(child);
      return child;
    },
  };
}
