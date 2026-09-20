package com.citi.put.checks.studio.compile;

/**
 * Compilation states of a Studio draft (Architecture §4.2).
 *
 * <p>Mirrors the {@code ck_ui_tests_compile_status} CHECK constraint added in V12.
 */
public enum CompileState {
  /** No valid candidate for the current source/configuration revisions. */
  STALE,
  /** A compile request has been persisted and asynchronous work may be in flight. */
  COMPILING,
  /** A validated candidate revision exists and is waiting for the author's confirmation. */
  AWAITING_CONFIRMATION,
  /** The current candidate has been confirmed; the draft is runnable subject to §4.6. */
  READY,
  /** Compilation produced an unrunnable result; per-step diagnostics are recorded. */
  NEEDS_REVISION
}
