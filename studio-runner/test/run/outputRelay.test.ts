/**
 * AC-8, AC-9, AC-10 — the child's stdout and stderr stop being an unredacted, unbounded channel.
 *
 * Every assertion here is on **captured bytes**: what the sink received, not what the relay
 * intended. That is the distinction this epic has been burned by — `test/redaction.test.ts` proved
 * `createRedactor` works, which is not the same as proving the run's output is clean, and a log
 * assertion that grepped the *source* instead of capturing output stayed green against all three
 * leak mutants.
 */
import { describe, expect, it } from 'vitest';

import { createRedactor, REDACTION_PLACEHOLDER } from '../../src/executor/redaction.js';
import { createOutputRelay } from '../../src/run/outputRelay.js';
import type { OutputStream } from '../../src/run/outputRelay.js';

const CANARY = 'p@ss w0rd/+=';

/**
 * A recognisable piece of the value. A partial disclosure is a disclosure.
 *
 * Short on purpose: the fragment a cut actually leaves is whatever happened to fall on the near
 * side of it, and a longer needle would let the real leak through. The padding below is sized so
 * the cut lands **inside** the value — which, the first time these were written, it did not.
 */
const CANARY_FRAGMENT = 'p@ss';

interface Capture {
  readonly lines: { stream: OutputStream; line: string }[];
  readonly text: string;
  readonly contiguous: string;
}

function capture(): Capture & { readonly push: (stream: OutputStream, line: string) => void } {
  const lines: { stream: OutputStream; line: string }[] = [];
  return {
    lines,
    // An arrow property: this is handed to `createOutputRelay` as its `emit` value.
    push: (stream: OutputStream, line: string): void => {
      lines.push({ stream, line });
    },
    get text(): string {
      return lines.map((entry) => entry.line).join('\n');
    },
    /**
     * The emitted bytes with no separator between them.
     *
     * The overflow path cuts a long buffer into several bounded lines, so a placeholder can land
     * across two of them. Joining with `\n` would then hide it — which says nothing about
     * redaction and everything about where the cut fell.
     */
    get contiguous(): string {
      return lines.map((entry) => entry.line).join('');
    },
  };
}

function relayWith(
  sink: ReturnType<typeof capture>,
  overrides: { maxLineLength?: number; maxLines?: number; values?: readonly string[] } = {},
) {
  return createOutputRelay({
    redactor: createRedactor(overrides.values ?? [CANARY]),
    maxLineLength: overrides.maxLineLength ?? 400,
    maxLines: overrides.maxLines ?? 500,
    emit: sink.push,
  });
}

describe('AC-8 — the child’s output reaches the log through the run’s redactor', () => {
  it('scrubs a value the child wrote, on the bytes that were emitted', () => {
    const sink = capture();
    const relay = relayWith(sink);
    // A Playwright exception, produced by code this package does not own and never formatted by
    // `safeMessage`. This is the only redaction that reaches it.
    relay.write('stderr', `Error: locator.fill: value "${CANARY}" was rejected\n`);
    relay.close();

    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]?.stream).toBe('stderr');
    expect(sink.text).not.toContain(CANARY);
    expect(sink.text).toContain(REDACTION_PLACEHOLDER);
  });

  it('redacts **before** it truncates, so a cut cannot free half a value', () => {
    const sink = capture();
    // The cut point is placed **inside** the value, which is the only arrangement that tells the
    // two orders apart. Truncate-first cuts `p@ss w0rd/+=` in half; the surviving prefix matches
    // no variant the redactor scrubs, so it reaches the log verbatim. Redact-first replaces the
    // whole value and then shortens the placeholder, which leaks nothing.
    //
    // A cut placed *before* the value would pass under either order — the value would simply be
    // gone — which is exactly the shape of assertion this epic keeps finding.
    const prefix = 'x'.repeat(24);
    const relay = relayWith(sink, { maxLineLength: 30 });
    relay.write('stdout', `${prefix}${CANARY} tail\n`);
    relay.close();

    const line = sink.lines[0]?.line ?? '';
    expect(line.length).toBeLessThanOrEqual(30);
    expect(sink.text).not.toContain(CANARY);
    // The four characters that would have survived a truncate-first implementation.
    expect(sink.text).not.toContain(CANARY.slice(0, 4));
    expect(sink.text).toContain('[REDA');
  });

  it('keeps stdout and stderr apart, so a warning is not mistaken for a diagnostic', () => {
    const sink = capture();
    const relay = relayWith(sink);
    relay.write('stdout', 'ordinary chatter\n');
    relay.write('stderr', 'a Chromium warning\n');
    relay.close();
    expect(sink.lines.map((entry) => entry.stream)).toEqual(['stdout', 'stderr']);
  });

  it('assembles a line that arrived in pieces before it redacts it', () => {
    const sink = capture();
    const relay = relayWith(sink);
    // A pipe delivers bytes, not lines. A relay that redacted each chunk would miss a value split
    // across a chunk boundary, which is precisely how a secret escapes a naive implementation.
    relay.write('stderr', `prefix ${CANARY.slice(0, 5)}`);
    relay.write('stderr', `${CANARY.slice(5)} suffix\n`);
    relay.close();

    expect(sink.lines).toHaveLength(1);
    expect(sink.text).not.toContain(CANARY);
    expect(sink.text).toContain(REDACTION_PLACEHOLDER);
  });
});

describe('AC-8, AC-10 — line-bounded, volume-bounded, and the drop is visible', () => {
  it('bounds each line by the same cap a retained log entry gets', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLineLength: 50, values: [] });
    relay.write('stdout', `${'y'.repeat(5_000)}\n`);
    relay.close();
    for (const entry of sink.lines) expect(entry.line.length).toBeLessThanOrEqual(50);
  });

  it('stops relaying after the volume bound and reports how much it dropped', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLines: 10, values: [] });
    for (let index = 0; index < 100; index += 1) relay.write('stdout', `line ${String(index)}\n`);
    relay.close();

    expect(relay.emitted).toBe(10);
    expect(relay.dropped).toBe(90);
    // Visible, not silent: a drop nobody can see is indistinguishable from a quiet browser, and
    // the person reading the log is the one who needs to know the diagnostics are incomplete.
    const notice = sink.lines.at(-1);
    expect(notice?.stream).toBe('stderr');
    expect(notice?.line).toBe('[child output truncated: 90 line(s) dropped]');
  });

  /**
   * QA-1 — the relay's **other** cut, with a value across it.
   *
   * The guard above plants the canary across a cut and ends its line with `\n`, so it travels the
   * per-line path. The only test that reached the overflow path ran with `values: []` and asserted
   * line lengths. Two guards, half a property each, and the branch that needed both carried no
   * value — so the overflow path cut **raw** text and shipped. Coverage read 98.68 % over it.
   *
   * A child signalled mid-write leaves exactly this in the pipe: a run of output with no trailing
   * newline. The probe that proved it emitted `…pppCANARY-Zq7-p@ss` and ` w0rd/+= trailing`, whose
   * concatenation is the value.
   */
  it('scrubs a value that straddles the overflow cut, on a stream that never sends a newline', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLineLength: 400 });

    // No `\n` anywhere. 394 characters of padding puts the value across the 400-character cut —
    // sized deliberately, because padding that stops short of the cut leaves the value whole on
    // the near side and the test cannot tell the two orders apart. Long enough overall that the
    // relay is forced to emit rather than hold it all back.
    relay.write('stdout', `${'q'.repeat(394)}${CANARY}${'r'.repeat(900)}`);
    relay.close();

    expect(sink.lines.length, 'the overflow path must actually have emitted').toBeGreaterThan(0);
    expect(sink.text).not.toContain(CANARY);
    // The fragments a raw cut produces. Neither matches any variant the redactor scrubs, so
    // asserting only on the whole value is exactly what let this through.
    expect(sink.text).not.toContain(CANARY_FRAGMENT);
    expect(sink.text).not.toContain('w0rd/+=');
    // On the contiguous bytes: the placeholder itself straddles a cut here, which is fine — a
    // split placeholder is not a secret — but it means the per-line view would not show it.
    expect(sink.contiguous).toContain(REDACTION_PLACEHOLDER);
    for (const entry of sink.lines) expect(entry.line.length).toBeLessThanOrEqual(400);
  });

  it('reassembles a value split across two chunks before it cuts, when it can', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLineLength: 400 });
    // The value arrives in halves and there is still no newline. The first chunk alone is 406
    // characters — over the line bound — so a relay that cut to the last byte would emit the
    // incomplete first half, which matches nothing and therefore reaches the log verbatim. The
    // retained tail is what gives the second half a chance to arrive first.
    relay.write('stdout', `${'q'.repeat(395)}${CANARY.slice(0, 11)}`);
    relay.write('stdout', `${CANARY.slice(11)}${'r'.repeat(500)}`);
    relay.close();

    expect(sink.text).not.toContain(CANARY);
    expect(sink.text).not.toContain(CANARY_FRAGMENT);
    expect(sink.contiguous).toContain(REDACTION_PLACEHOLDER);
  });

  it('holds at most two lines’ worth per stream, so the retained tail is still bounded', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLineLength: 100, maxLines: 5_000, values: [] });
    relay.write('stdout', 'z'.repeat(100 * 1024));
    // Everything above the retained tail has been emitted; what is held back is bounded by
    // `2 × maxLineLength`, which is what keeps a chatty browser from being a parent-side leak.
    const emittedChars = sink.lines.reduce((total, entry) => total + entry.line.length, 0);
    expect(100 * 1024 - emittedChars).toBeLessThanOrEqual(200);
    relay.close();
  });

  it('bounds a stream that never writes a newline at all', () => {
    const sink = capture();
    const relay = relayWith(sink, { maxLineLength: 100, maxLines: 5_000, values: [] });
    // 200 KiB with no line break. A relay that buffered until a newline would hold all of it —
    // an unbounded pipe on a chatty browser is a parent-side memory leak.
    relay.write('stdout', 'z'.repeat(200 * 1024));
    relay.close();
    for (const entry of sink.lines) expect(entry.line.length).toBeLessThanOrEqual(100);
    expect(relay.emitted + relay.dropped).toBeGreaterThan(1);
  });

  it('handles CRLF without leaving a stray carriage return in the log', () => {
    const sink = capture();
    const relay = relayWith(sink, { values: [] });
    relay.write('stderr', 'windows style\r\n');
    relay.close();
    expect(sink.lines[0]?.line).toBe('windows style');
  });
});

describe('AC-8 — the relay cannot block, delay or break the run', () => {
  it('contains a sink that throws, the way step-event forwarding already does', () => {
    const thrown: string[] = [];
    const relay = createOutputRelay({
      redactor: createRedactor([CANARY]),
      maxLineLength: 400,
      maxLines: 10,
      emit: (_stream, line) => {
        thrown.push(line);
        throw new Error('the log destination is unavailable');
      },
    });

    // This runs on the parent's event loop — the one serving `/health`, `/ready` and
    // `/v1/validate`. A throw escaping here would be an uncaught exception in the *parent*, which
    // is considerably worse than a lost diagnostic.
    expect(() => {
      relay.write('stdout', 'first\n');
      relay.write('stdout', 'second\n');
      relay.close();
    }).not.toThrow();
    expect(thrown).toHaveLength(2);
  });

  it('delivers synchronously, so nothing on the kill path can be made to wait for it', () => {
    const sink = capture();
    const relay = relayWith(sink, { values: [] });
    relay.write('stdout', 'first\n');
    // No `await`, no tick. A relay that deferred delivery to a microtask or a promise would leave
    // this empty — and a relay that deferred is a relay the kill path could be made to wait for,
    // which is the property AC-8 rules out.
    expect(sink.lines).toHaveLength(1);
    relay.close();
    relay.release();
    expect(sink.lines).toHaveLength(1);
  });
});

describe('AC-9 — no resolved value is retained, and post-kill output is never flushed raw', () => {
  it('emits nothing at all once released, even for output that would have been redacted', () => {
    const sink = capture();
    const relay = relayWith(sink);
    relay.write('stderr', 'before the kill\n');
    relay.release();

    const before = sink.lines.length;
    // The tree was signalled; the child is still exhaling. There is no redactor any more, so raw
    // is the only thing the relay could produce — and raw is never an acceptable answer.
    relay.write('stderr', `after the kill, carrying ${CANARY}\n`);
    expect(sink.lines).toHaveLength(before);
    expect(sink.text).not.toContain(CANARY);
    expect(relay.released).toBe(true);
  });

  it('drops a long newline-less buffer wholesale once released, rather than cutting it', () => {
    const sink = capture();
    const relay = relayWith(sink);
    relay.release();

    // The overflow path is the one place the relay itself decides where to cut. With no redactor
    // there is no safe cut to make, so the buffer is discarded entire rather than fragmented —
    // and it is not retained either, because a released relay still holding a value is exactly
    // what AC-9 forbids.
    relay.write('stdout', `${'q'.repeat(900)}${CANARY}${'r'.repeat(900)}`);

    expect(sink.lines).toEqual([]);
    expect(relay.dropped).toBeGreaterThan(0);

    // A second, short write. If the first buffer had been *retained* rather than discarded, the
    // accumulated text would still be sitting in the relay and would surface on the next flush.
    relay.write('stdout', 'more\n');
    expect(sink.lines).toEqual([]);
    relay.close();
    expect(sink.text).not.toContain(CANARY);
    expect(sink.text).not.toContain(CANARY_FRAGMENT);
    expect(sink.text).not.toContain('qqq');
  });

  it('drops the redactor reference, which is what holds the values', () => {
    const sink = capture();
    const relay = relayWith(sink);
    expect(relay.released).toBe(false);
    relay.release();
    // The redactor's plain variant *is* the resolved value. Holding one after the run is exactly
    // "a closure that outlives the run" (AC-9), and this is the observable form of not doing it.
    expect(relay.released).toBe(true);
  });

  it('redacts output that arrives after the ordered stop but before release', () => {
    const sink = capture();
    const relay = relayWith(sink);
    // The window between the group signal and the run's exit path: still redacted, per AC-8's
    // "still redacted **or** dropped".
    relay.write('stderr', `dying gasp ${CANARY}\n`);
    relay.close();
    relay.release();
    expect(sink.text).not.toContain(CANARY);
    expect(sink.text).toContain(REDACTION_PLACEHOLDER);
  });

  it('keeps relaying — redacted — between close and release, because the dying gasp is the point', () => {
    const sink = capture();
    const relay = relayWith(sink);
    relay.close();
    // A child signalled a moment ago writes the lines that explain why it had to be killed. They
    // are still scrubbed, and they are still worth having; `release` is the hard stop, not `close`.
    relay.write('stderr', `stack trace mentioning ${CANARY}\n`);
    expect(sink.text).toContain(REDACTION_PLACEHOLDER);
    expect(sink.text).not.toContain(CANARY);

    relay.release();
    const after = sink.lines.length;
    relay.write('stderr', `later still, with ${CANARY}\n`);
    expect(sink.lines).toHaveLength(after);
  });
});

/**
 * Story 10.17 AC-21 (MED-2) — the chunk-boundary hole, closed at the bound the run already knows.
 *
 * 10.13's relay retained a fixed `maxLineLength × 2` before cutting an unterminated stream, and its
 * own comment claimed the general case could not be closed *"without an unbounded buffer, which is
 * the thing this relay exists to prevent."* @qa judged that reason false and @po upheld @qa: the
 * buffer needed is bounded by the longest thing the redactor could match, and the run computes
 * that set at admission. @po's correction to both — and it is the load-bearing part — is that the
 * bound is the longest **variant**, not the longest known value: base64 is roughly four-thirds of a
 * value, so a tail sized to the raw value closes the case the test was written for and misses the
 * case an attacker gets.
 *
 * **The fixture is the criterion.** A canary that fits inside one line, or that ends with `\n`,
 * travels the path that already worked and would give a false pass — which is the exact mistake the
 * merged relay's own comment records having made. The canary below is longer than `maxLineLength`
 * **and** arrives split across two `write()` calls at an offset inside it, with **no newline**.
 */
describe('AC-21 — a value that outgrows a line and straddles a chunk boundary is still scrubbed', () => {
  /**
   * Longer than the 400-character line cap, so the relay itself chooses where to cut.
   *
   * **Sized against the old behaviour, not against convenience.** The first version of this fixture
   * split the value 200 characters in, and the old `maxLineLength` retention reassembled it anyway
   * — its retained tail of up to `2 × maxLineLength` was larger than the buffered prefix, so the
   * value was whole by the time anything was cut and the mutation turned nothing red. That is the
   * wave-4 lesson exactly: a canary that does not straddle the cut proves nothing. The split below
   * is 900 characters in, which is past what the old retention could hold, so the old code emits a
   * raw head fragment and then fails to match the remainder.
   */
  const LONG_SECRET = `LONG-SECRET-HEAD-${'x'.repeat(1400)}-TAIL-END`;
  /** The two fragments a cut in the wrong place leaves, one on each side of it. */
  const LONG_HEAD = 'LONG-SECRET-HEAD-';
  const LONG_TAIL = '-TAIL-END';

  it('retains max(maxLineLength, redactor.longestVariantLength) and reads the bound rather than recomputing it', () => {
    const redactor = createRedactor([LONG_SECRET]);
    const sink = capture();
    const relay = createOutputRelay({
      redactor,
      maxLineLength: 400,
      maxLines: 500,
      emit: sink.push,
    });

    // The bound is the redactor's number, not a constant in this file and not a constant in the
    // relay. Base64 of a 517-character value is longer than the 400-character line cap, which is
    // precisely why the raw value would have been the wrong bound.
    expect(redactor.longestVariantLength).toBeGreaterThan(400);
    expect(relay.retentionBound).toBe(redactor.longestVariantLength);
  });

  it('emits nothing before the bound has been seen', () => {
    const sink = capture();
    const relay = createOutputRelay({
      redactor: createRedactor([LONG_SECRET]),
      maxLineLength: 400,
      maxLines: 500,
      emit: sink.push,
    });

    relay.write('stderr', 'a'.repeat(relay.retentionBound));
    expect(sink.lines, 'the relay emitted before it had retained the bound').toHaveLength(0);
  });

  it('scrubs a value delivered across two writes, split inside it, with no newline anywhere', () => {
    const redactor = createRedactor([LONG_SECRET]);
    const sink = capture();
    const relay = createOutputRelay({
      redactor,
      maxLineLength: 400,
      maxLines: 500,
      emit: sink.push,
    });

    // Enough ahead of the value to force emits, then the value **split inside itself**. The split
    // offset is deliberately past the line cap and inside the secret, which is the hazard: at the
    // moment the first chunk arrives the value is incomplete and matches no variant at all.
    const lead = 'L'.repeat(1200);
    const splitAt = 900;
    relay.write('stderr', lead + LONG_SECRET.slice(0, splitAt));
    relay.write('stderr', LONG_SECRET.slice(splitAt) + 'T'.repeat(2000));
    relay.close();

    expect(sink.lines.length, 'nothing was emitted, so nothing has been shown to be scrubbed').toBeGreaterThan(0);
    expect(sink.contiguous, 'the value survived the chunk boundary').not.toContain(LONG_SECRET);
    // The two fragments a cut in the wrong place leaves. A fragment matches no variant
    // `createRedactor` produces, so every `not.toContain(LONG_SECRET)` above would stay green over
    // a real partial disclosure — these are the assertions that actually discriminate.
    expect(sink.contiguous, 'the head of the value survived the chunk boundary').not.toContain(LONG_HEAD);
    expect(sink.contiguous, 'the tail of the value survived the chunk boundary').not.toContain(LONG_TAIL);
    // It travelled: the lead and the trailer are on the emitted bytes, so the absences above are
    // absences from a surface that was actually written to.
    expect(sink.contiguous).toContain('L'.repeat(100));
    expect(sink.contiguous).toContain(REDACTION_PLACEHOLDER);
  });

  it('holds peak retention to the declared bound plus one line, and no more', () => {
    const redactor = createRedactor([LONG_SECRET]);
    const sink = capture();
    const relay = createOutputRelay({
      redactor,
      maxLineLength: 400,
      maxLines: 500,
      emit: sink.push,
    });

    // A megabyte with no line break in it, in chunks, which is what a chatty browser looks like.
    for (let i = 0; i < 64; i += 1) relay.write('stdout', 'z'.repeat(16_384));

    // Asserted against the bound rather than against a number written here, which would be a third
    // derivation of it.
    expect(relay.peakRetained).toBeLessThanOrEqual(relay.retentionBound + 400);
    expect(relay.peakRetained, 'the buffer never filled, so the bound was never tested').toBeGreaterThan(
      relay.retentionBound,
    );
  });

  it('still drops rather than fragments when redaction is impossible', () => {
    // The released-redactor behaviour, re-asserted so that raising the bound did not reopen it.
    const sink = capture();
    const relay = createOutputRelay({
      redactor: createRedactor([LONG_SECRET]),
      maxLineLength: 400,
      maxLines: 500,
      emit: sink.push,
    });
    relay.release();
    relay.write('stderr', `${'m'.repeat(1200)}${LONG_SECRET}`);
    relay.close();

    expect(sink.lines, 'a released relay emitted something').toHaveLength(0);
    expect(relay.dropped).toBeGreaterThan(0);
  });
});
