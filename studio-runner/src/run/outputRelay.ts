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
 * ## Redact, then cut — in that order, on **every** path that cuts
 *
 * Cutting first would split a known value in half, and half a value matches no variant the
 * redactor scrubs, so both halves reach the log and concatenating them reconstructs the value.
 * Redacting the assembled text and bounding the result afterwards is the only order that holds.
 *
 * There are **two** places this relay cuts, and the rule applies to both: the per-line bound in
 * `deliver`, and the overflow bound in `write` for a stream that never sends a newline. The second
 * one had the order backwards and shipped that way — QA-1 — because the two guards each covered
 * half the property and the branch that needed both never carried a value. Whenever a cut is added
 * here, the question to ask is *what is this cutting, and has it been redacted yet*.
 *
 * ## What this still cannot do, stated rather than implied
 *
 * A value the relay never sees **whole** cannot be matched, because it matches no variant until it
 * is complete. Two cases:
 *
 * - the child writes a value with a **newline** through the middle of it — two lines, by the
 *   child's own choice, and neither half matches;
 * - the child writes a value with a **newline** through the middle of it — two lines, by the
 *   child's own choice, and neither half matches.
 *
 * The second case this comment used to name — a value longer than `maxLineLength` that also spans a
 * chunk boundary — **is closed**, and the sentence claiming it could not be closed *"without an
 * unbounded buffer"* was wrong. The buffer required was never unbounded: it is bounded by the
 * longest thing the redactor could possibly match, and the run computes that set at admission.
 * `createRedactor` already sorts its variants longest-first, so the number exists; it is published
 * as `Redactor.longestVariantLength` and **read** here rather than recomputed, because two
 * derivations of one bound in two modules is this codebase's most-repeated defect.
 *
 * The bound is the longest **variant**, not the longest known value, and that distinction is
 * load-bearing: base64 of a value is roughly four-thirds of it and double URL-encoding can be
 * longer still, so a tail sized to the raw value would close the case the test was written for and
 * miss the case an attacker gets.
 *
 * **Peak retention per stream is `retentionBound + maxLineLength`**, measured after the trimming
 * loop and asserted against the bound rather than against a number copied into a test. Nothing is
 * emitted from the overflow path until at least `retentionBound` has been seen or the stream has
 * ended, and what is retained afterwards is never less than `retentionBound` — which is the whole
 * property: a value cannot be cut until enough of it is in hand to recognise it.
 *
 * It is a scrubber for known values it can assemble, exactly as `createRedactor` is, and it is not
 * described as more.
 */

/** Just enough of a redactor for this module; `src/executor/redaction.ts` supplies the real one. */
export interface RelayRedactor {
  redact(text: string): string;
  /**
   * The retention bound, read rather than recomputed (AC-21).
   *
   * Optional only so that a caller with a trivial stub need not supply it; absent is treated as 0,
   * which degrades to the previous `maxLineLength` behaviour rather than to an unbounded buffer.
   */
  readonly longestVariantLength?: number;
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
  /**
   * The per-stream retention bound this relay is holding to (AC-21).
   *
   * Published so a test can assert peak retention *against the bound* rather than against a number
   * copied into the test, which would be a third derivation of it.
   */
  readonly retentionBound: number;
  /** Flushes any trailing partial line and emits the drop notice if there was one. */
  close(): void;
  /** Drops the redactor. After this the relay emits nothing at all (AC-9). */
  release(): void;
  /** Largest amount ever held in a single stream's partial buffer. Bounded by `2 x retentionBound`. */
  readonly peakRetained: number;
  readonly emitted: number;
  readonly dropped: number;
  readonly released: boolean;
}

export function createOutputRelay(options: OutputRelayOptions): OutputRelay {
  const { maxLineLength, maxLines, emit } = options;
  // Read from the redactor, never recomputed. A value can only be matched once it is whole, so the
  // tail that must be held back before any cut is the longest variant the redactor could match.
  const retentionBound = Math.max(maxLineLength, options.redactor.longestVariantLength ?? 0);
  let peakRetained = 0;
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
    retentionBound,
    get peakRetained(): number {
      return peakRetained;
    },
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

      // ── The overflow path: a stream with no newline in it (QA-1). ─────────────────────────
      //
      // A browser that writes megabytes without a line break must not grow this buffer without
      // limit, so the relay cuts it itself. **That cut is made on redacted text, never on raw
      // text**, which is the same rule `deliver` follows and for the same reason: a known value
      // straddling a raw cut becomes two fragments, and a fragment matches no variant
      // `createRedactor` produces, so *both halves* reach the log — and concatenating them
      // reconstructs the value exactly.
      //
      // This branch got the order wrong and no test could see it: the guard that plants a value
      // across the cut ended its line with `\n`, so it travelled the newline path above, and the
      // only test that reached this branch ran with no values to redact. The newline path never
      // had the problem because the *child* chose where the line ended. Here the **relay** chooses,
      // so the relay owns the consequence.
      if (buffer.length > retentionBound) {
        const active = redactor;
        if (active === null) {
          // Released. There is no redactor, so no cut of this buffer can be made safely and the
          // whole of it is dropped rather than fragmented. Unchanged by AC-21 and re-asserted so
          // the change does not reopen it.
          dropped += 1;
          buffer = '';
        } else {
          buffer = active.redact(buffer);
          // Hold `retentionBound` back rather than cutting to the last byte. A value that spans a
          // *chunk* boundary is incomplete at the moment it arrives and therefore matches nothing;
          // retaining a tail at least as long as the longest variant gives the rest of it a chance
          // to arrive and be scrubbed before anything is emitted. Retaining only `maxLineLength`
          // closed this for values shorter than a line and left it open for everything else, which
          // is the general case this bound closes. Memory stays bounded — at most
          // `2 × retentionBound` per stream, which is declared and asserted.
          // Two different numbers doing two different jobs, and conflating them loses output.
          // `retentionBound` is how much must be **held back** before any cut is safe;
          // `maxLineLength` is how much may be **emitted** at a time. Cutting in `retentionBound`
          // pieces would hand `deliver` a slice longer than the line cap, which it would then
          // truncate — discarding the difference silently, on every overflow, forever.
          while (buffer.length > retentionBound + maxLineLength) {
            deliver(stream, buffer.slice(0, maxLineLength));
            buffer = buffer.slice(maxLineLength);
          }
        }
      }
      partial[stream] = buffer;
      peakRetained = Math.max(peakRetained, buffer.length);
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
