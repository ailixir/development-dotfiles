/**
 * The two seams `POST /v1/runs` needs beyond the ones 10.2 already provides (AC-6, AC-12, AC-21).
 *
 * Both are deliberately tiny and both are faked in this story. The real `BrowserLauncher` is
 * story 10.12's (child process, native video, deadline killing); the real object-store client is
 * story 10.14's. Keeping them behind interfaces is what lets AC-6 be asserted at all: "no browser
 * and no scratch directory exists before the CAS returns success" is only checkable if launching
 * and scratch creation are observable calls rather than inline statements.
 *
 * `ScratchStore` is the only durable thing the runner touches, and it is per-run, ephemeral and
 * cleared on every exit path. It is **not** a store for job values: resolved variables and
 * secrets are never written here (AC-21, architecture §9.2).
 */
import type { BrowserAdapter } from '../executor/adapters/BrowserAdapter.js';

export interface BrowserSession {
  readonly adapter: BrowserAdapter;
  close(): Promise<void>;
}

export interface LaunchOptions {
  readonly browser: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Total browser runtime cap; 10.13 enforces it, this story only passes it on. */
  readonly totalRuntimeMs: number;
  /** Directory the session may write to. Cleared when the run ends. */
  readonly scratchPath: string;
}

export interface BrowserLauncher {
  /**
   * Starts a browser. `STARTED` is reported only once this resolves — not when admission
   * succeeds and not when this call begins (AC-14a).
   */
  launch(options: LaunchOptions): Promise<BrowserSession>;
}

export interface RunScratch {
  readonly path: string;
  /** Idempotent: safe to call on an error path where nothing was created. */
  clear(): Promise<void>;
}

export interface ScratchStore {
  /** Creates the per-run directory. Never called before admission succeeds (AC-6). */
  create(runId: string): Promise<RunScratch>;
  /** Clears every run directory. Called at startup and on the drain path (AC-12). */
  clearAll(): Promise<void>;
  /** Names currently present, so a test can assert the directory is empty (AC-21). */
  list(): Promise<readonly string[]>;
}
