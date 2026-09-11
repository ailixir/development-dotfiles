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

interface Capture {
  readonly lines: { stream: OutputStream; line: string }[];
  readonly text: string;
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
