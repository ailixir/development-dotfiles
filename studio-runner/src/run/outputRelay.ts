/**
 * The child's stdout and stderr, captured, redacted and bounded (AC-8, AC-9, AC-10).
 *
 * ## The channel this closes
 *
 * Until this story the child was forked `stdio: ['ignore', 'inherit', 'inherit', 'ipc']`, so
 * everything Playwright, Chromium or an uncaught stack trace in the child wrote went straight to
 * the pod log with **nothing in front of it**: unbounded, and with no redactor on the path.
 * Architecture §9.2 requires the runner to scrub *"every outbound diagnostic before persistence"*,
 * and a pod log is persistence. 10.12's comment — "the contract is not a debugging channel" — was
 * accurate about the *wire*; it said nothing about the log.
 *
 * It is also the only redaction that reaches output the runner did not format. A Playwright
 * exception or a Chromium warning is produced by code this package does not own, so no amount of
 * `safeMessage` discipline at the call sites reaches it; capturing the stream is what makes that
 * canary shape assertable at all.
 *
 * ## Four properties, each of which is a way this could have gone wrong
 *
 * 1. **Bounded twice.** Per line, by the same `maxLogEntryLength` 10.6 already applies to a log
 *    entry; and in total, by a line count, because a chatty browser writing megabytes is both a
 *    flooded log and a parent-side memory leak. A partial line is capped too — output with no
 *    newline in it must not be able to grow the buffer without limit.
 * 2. **Drops are visible.** A silent drop is indistinguishable from a quiet browser, so the count
 *    is emitted once at {@link OutputRelay.close}. Losing diagnostics is acceptable; losing them
 *    invisibly is not.
 * 3. **It cannot block or delay anything.** Every method is synchronous and total: no `await`, no
 *    promise, and the sink is called inside a `try`. The relay runs on the parent's event loop —
 *    the one serving `/health`, `/ready` and `/v1/validate` for every other request — and a relay
 *    that awaited a slow sink would be a new way to hang the process this story exists to keep
 *    responsive. It is the same containment 10.12 already applies to step-event forwarding.
 * 4. **It holds no resolved value once the run is over.** {@link OutputRelay.release} drops the
 *    redactor, and a released relay **drops** subsequent output rather than passing it through
 *    unredacted — the child may still be exhaling after the tree was signalled, and raw is never
 *    an acceptable answer (AC-9).
 *
 * `close` and `release` are two different events and the gap between them is deliberate.
 * {@link OutputRelay.close} flushes the trailing partial line and publishes the drop count; output
 * that arrives after it is still **redacted and relayed**, because a child that was signalled a
 * moment ago writes its most useful lines on the way out. {@link OutputRelay.release} is the hard
 * stop: after it the redactor is gone and everything is dropped.
 *
 * ## Redact, then truncate — in that order
 *
 * Truncating first would cut a known value in half, and half a value does not match any variant
 * the redactor scrubs, so the surviving half would reach the log. Redacting the assembled line and
 * bounding the result afterwards is the only order that holds.
 *
 * The honest limit: a value split across a **newline** is two lines, and neither half matches. The
 * relay bounds and scrubs what it can assemble; it is a scrubber for known values, exactly as
 * `createRedactor` is, and it is not described as more.
 */

/** Just enough of a redactor for this module; `src/executor/redaction.ts` supplies the real one. */
export interface RelayRedactor {
  redact(text: string): string;
}

export interface OutputRelayOptions {
  readonly redactor: RelayRedactor;
  /** Per-line cap. 10.6's `ReportBounds.maxLogEntryLength`, used as it is (AC-10). */
  readonly maxLineLength: number;
  /** Total lines this run may relay before the rest are dropped and counted. */
  readonly maxLines: number;
  /** Where a finished, redacted, bounded line goes. Called synchronously, inside a `try`. */
  readonly emit: (stream: OutputStream, line: string) => void;
}

export type OutputStream = 'stdout' | 'stderr';

export interface OutputRelay {
  /** Feeds a raw chunk. Never throws, never blocks, never returns a promise. */
  write(stream: OutputStream, chunk: string): void;
  /** Flushes any trailing partial line and emits the drop notice if there was one. */
  close(): void;
  /** Drops the redactor. After this the relay emits nothing at all (AC-9). */
  release(): void;
  readonly emitted: number;
  readonly dropped: number;
  readonly released: boolean;
}

export function createOutputRelay(options: OutputRelayOptions): OutputRelay {
  const { maxLineLength, maxLines, emit } = options;
  let redactor: RelayRedactor | null = options.redactor;
  const partial: Record<OutputStream, string> = { stdout: '', stderr: '' };
  let emitted = 0;
  let dropped = 0;
  let closed = false;

  /** Redact, bound, hand over — and swallow whatever the sink does with it. */
  function deliver(stream: OutputStream, raw: string): void {
    if (raw === '') return;
    const active = redactor;
    // Released: the run is over and the redactor is gone. Dropping is the only safe answer —
    // "still redacted or dropped, never flushed raw" (AC-8).
    if (active === null) {
      dropped += 1;
      return;
    }
    if (emitted >= maxLines) {
      dropped += 1;
      return;
    }
    // Redact first. Truncating first would split a known value and let the remainder through.
    const scrubbed = active.redact(raw);
    // Nothing left to say. A blank line carries no diagnostic, and it is also how a run with no
    // configured diagnostics sink discards the child's output while still draining the pipe — an
    // undrained pipe eventually blocks the writer, which is a hang, which is this story's subject.
    if (scrubbed === '') return;
    const bounded =
      scrubbed.length <= maxLineLength
        ? scrubbed
        : `${scrubbed.slice(0, Math.max(0, maxLineLength - 1))}…`;
    emitted += 1;
    try {
      emit(stream, bounded);
    } catch {
      // The sink's problem, not the run's. A throwing log destination must not become a failed
      // run, an unkilled child or a stalled control endpoint.
    }
  }

  return {
    get emitted(): number {
      return emitted;
    },
    get dropped(): number {
      return dropped;
    },
    get released(): boolean {
      return redactor === null;
    },

    write(stream: OutputStream, chunk: string): void {
      // Deliberately **not** gated on `closed`. A child signalled a moment ago is still exhaling,
      // and those are the most interesting lines it will ever write — the ones explaining why it
      // had to be killed. They stay on the redacted path. {@link OutputRelay.release} is the hard
      // stop, and it is the one that matters: after it there is no redactor, so there is nothing
      // safe left to emit.
      let buffer = partial[stream] + chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        deliver(stream, buffer.slice(0, index).replace(/\r$/u, ''));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
      // A stream with no newline in it must not be able to grow this buffer without limit: cut it
      // at the line bound and deliver, so the memory held is bounded by `maxLineLength` per stream.
      while (buffer.length > maxLineLength) {
        deliver(stream, buffer.slice(0, maxLineLength));
        buffer = buffer.slice(maxLineLength);
      }
      partial[stream] = buffer;
    },

    close(): void {
      if (closed) return;
      closed = true;
      for (const stream of ['stdout', 'stderr'] as const) {
        const trailing = partial[stream];
        partial[stream] = '';
        deliver(stream, trailing);
      }
      if (dropped > 0 && redactor !== null) {
        // Visible, once, and not itself droppable: a drop nobody can see is the same as no bound.
        try {
          emit('stderr', `[child output truncated: ${String(dropped)} line(s) dropped]`);
        } catch {
          // Same containment as every other delivery.
        }
      }
    },

    release(): void {
      // The redactor's variants are built from the resolved values; the plain variant *is* the
      // value. Dropping the reference is what AC-9 asks for, and it is checkable.
      redactor = null;
      partial.stdout = '';
      partial.stderr = '';
    },
  };
}
