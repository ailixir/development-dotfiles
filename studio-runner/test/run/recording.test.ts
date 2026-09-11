/**
 * AC-7, AC-9 — the recording, and the three words this story may use.
 *
 * `PENDING` when a playable recording exists and has not been stored — storage is 10.14, so it is
 * the honest state. `FAILED` when a recording was attempted and could not be produced or flushed.
 * `UNAVAILABLE` when no usable recording exists at all.
 *
 * **`STORED` is not this story's word**, and the type cannot express it, which is a stronger
 * guarantee than a review comment saying not to emit it.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_PLAYABLE_RECORDING_BYTES,
  WEBM_MAGIC,
  evidenceFor,
  hasWebmHeader,
} from '../../src/run/recording.js';
import type { RecordingObservation } from '../../src/run/recording.js';

function observed(overrides: Partial<RecordingObservation> = {}): RecordingObservation {
  return {
    attempted: true,
    path: '/scratch/run-1/video/page.webm',
    bytes: 24_576,
    header: true,
    error: null,
    ...overrides,
  };
}

describe('evidence state', () => {
  it('is PENDING for a playable file that nobody has stored', () => {
    const outcome = evidenceFor(observed());
    expect(outcome.state).toBe('PENDING');
    expect(outcome.bytes).toBe(24_576);
    expect(outcome.error).toBeNull();
  });

  it('is UNAVAILABLE when recording was never attempted', () => {
    const outcome = evidenceFor(observed({ attempted: false }));
    expect(outcome.state).toBe('UNAVAILABLE');
    expect(outcome.path).toBeNull();
    expect(outcome.bytes).toBeNull();
  });

  it('is FAILED when the flush produced no file', () => {
    const outcome = evidenceFor(observed({ path: null, bytes: null, header: false }));
    expect(outcome.state).toBe('FAILED');
    expect(outcome.error).toMatch(/produced no file/u);
  });

  it('is FAILED for a file too small to be a recording', () => {
    const outcome = evidenceFor(observed({ bytes: MIN_PLAYABLE_RECORDING_BYTES - 1 }));
    expect(outcome.state).toBe('FAILED');
    expect(outcome.error).toMatch(/not playable/u);
  });

  it('is FAILED for a file with no readable webm header', () => {
    // A non-trivial size is not enough: a truncated or half-written file reported as `PENDING`
    // would tell the API an upload is coming for something that cannot be played.
    const outcome = evidenceFor(observed({ header: false }));
    expect(outcome.state).toBe('FAILED');
    expect(outcome.error).toMatch(/header absent/u);
  });

  it('is FAILED and keeps the diagnostic when the close itself threw', () => {
    const outcome = evidenceFor(observed({ error: 'TargetClosedError', bytes: null, header: false }));
    expect(outcome.state).toBe('FAILED');
    expect(outcome.error).toBe('TargetClosedError');
  });

  it('never says STORED', () => {
    const states = [
      evidenceFor(observed()),
      evidenceFor(observed({ attempted: false })),
      evidenceFor(observed({ header: false })),
    ].map((outcome) => outcome.state);
    expect(states).not.toContain('STORED');
  });
});

describe('the webm header check', () => {
  it('accepts the EBML magic', () => {
    expect(hasWebmHeader(WEBM_MAGIC)).toBe(true);
    expect(hasWebmHeader(Uint8Array.from([...WEBM_MAGIC, 0x42, 0x86]))).toBe(true);
  });

  it('rejects anything else, including a short read', () => {
    expect(hasWebmHeader(Uint8Array.from([0x1a, 0x45]))).toBe(false);
    expect(hasWebmHeader(Uint8Array.from([0x00, 0x00, 0x00, 0x00]))).toBe(false);
    expect(hasWebmHeader(Uint8Array.from([]))).toBe(false);
  });
});
