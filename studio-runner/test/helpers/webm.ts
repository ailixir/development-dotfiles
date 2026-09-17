/**
 * A minimal WebM (Matroska/EBML) reader: frame timestamps and frame sizes, no decoding.
 *
 * It exists for the SPK-06 phase-A seek measurement (AC-12a), which has to answer "at which frame
 * does this step's visible effect appear?" — and answering it needs the *timing* of the frames,
 * not their pixels. Matroska stores exactly that in plain sight: each `Cluster` carries a
 * `Timestamp`, each `SimpleBlock` inside it a relative timecode and its own encoded length.
 *
 * Reading the container rather than decoding the video is what keeps this in-process. A decoder
 * would mean spawning `ffmpeg`, and `child_process` is confined to `src/run/**` (ADR-001 §6) — so
 * a measurement that needed one would have to be written outside the tests that consume it, which
 * is how a measurement stops being run.
 *
 * **What a frame's size tells you.** A VP8 inter-frame that encodes an unchanged scene is tiny —
 * tens of bytes. One that encodes a scene which has completely changed is orders of magnitude
 * larger. The fixture page for this measurement repaints the whole viewport with pseudo-random
 * noise on every step precisely so that the encoder cannot compress the change away, which makes
 * "the frame where the step's effect appears" a spike rather than a judgement call.
 */
import { readFileSync } from 'node:fs';

export interface WebmFrame {
  /** Milliseconds from the start of the recording. */
  readonly atMs: number;
  /** Encoded length of the frame, in bytes. */
  readonly bytes: number;
}

interface Vint {
  readonly value: number;
  readonly length: number;
}

/**
 * Reads an EBML variable-length integer.
 *
 * @param keepMarker element **ids** keep their length marker (that is what makes an id an id);
 * sizes drop it.
 */
function readVint(buffer: Buffer, offset: number, keepMarker: boolean): Vint {
  const first = buffer[offset] ?? 0;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  let value = keepMarker ? first : first & (mask - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + (buffer[offset + index] ?? 0);
  }
  return { value, length };
}

/** Master elements this reader descends into; everything else is skipped by size. */
const MASTER_ELEMENTS = new Set([
  '18538067', // Segment
  '1f43b675', // Cluster
  '1549a966', // Info
  '1654ae6b', // Tracks
  'ae', // TrackEntry
]);

const CLUSTER_TIMESTAMP = 'e7';
const SIMPLE_BLOCK = 'a3';

/** Every frame in the file, in order. */
export function readWebmFrames(path: string): readonly WebmFrame[] {
  const buffer = readFileSync(path);
  const frames: WebmFrame[] = [];
  let clusterTimestamp = 0;

  const walk = (start: number, end: number): void => {
    let offset = start;
    while (offset < end) {
      const id = readVint(buffer, offset, true);
      offset += id.length;
      const size = readVint(buffer, offset, false);
      offset += size.length;
      const contentEnd = offset + size.value;
      if (contentEnd > end) return;

      const idHex = id.value.toString(16);
      if (MASTER_ELEMENTS.has(idHex)) {
        walk(offset, contentEnd);
      } else if (idHex === CLUSTER_TIMESTAMP) {
        let value = 0;
        for (let index = offset; index < contentEnd; index += 1) value = value * 256 + (buffer[index] ?? 0);
        clusterTimestamp = value;
      } else if (idHex === SIMPLE_BLOCK) {
        const trackNumber = readVint(buffer, offset, false);
        const timecodeAt = offset + trackNumber.length;
        // Signed 16-bit, relative to the cluster's own timestamp.
        const relative =
          ((((buffer[timecodeAt] ?? 0) << 8) | (buffer[timecodeAt + 1] ?? 0)) << 16) >> 16;
        frames.push({ atMs: clusterTimestamp + relative, bytes: size.value });
      }
      offset = contentEnd;
    }
  };

  walk(0, buffer.length);
  return frames;
}

/**
 * The frames at which the scene changed, in order.
 *
 * ## Why the threshold is relative to the largest frame, not to the median
 *
 * The intuitive rule — "far above the median" — does not work here, and the way it fails is
 * instructive. A recorded page produces three populations of frame: a floor of ~100 bytes where
 * nothing moved, a long tail of a few kilobytes to a few tens of kilobytes where the encoder is
 * refreshing or re-keying on its own, and the repaints themselves at 80–150 kB. A multiple of the
 * median sits inside the middle population, so the detector reports a dozen "changes" that belong
 * to no step, and matching then goes wrong in the one direction that matters — a spurious change
 * between a step and its real effect is matched instead of the effect.
 *
 * Scaling the threshold to the **largest** frame in the file separates the populations properly:
 * a full-viewport repaint is within a small factor of the biggest thing in the recording, and the
 * encoder's own churn is not. The median floor stays as a second condition so a recording in which
 * *nothing* changed cannot report its loudest piece of noise as a change.
 *
 * **Bursts are collapsed by time, not by adjacency.** A repaint does not always reach the encoder
 * in one frame; it can spill across two, sometimes with a small frame in between. The grouping
 * window is deliberately narrow — two frame intervals, not ten. A wide one looks safer and is not:
 * it would swallow a real repaint that followed something else closely, and the step would then be
 * matched to the *next* change, hundreds of milliseconds later. A missed change produces a wrong
 * number; an extra one only produces a conservative one.
 *
 * @param peakFraction fraction of the file's largest frame a frame must reach to count.
 * @param minimumRatio floor, as a multiple of the median, so a still recording reports nothing.
 * @param groupWithinMs frames this close together are one change.
 */
export function sceneChanges(
  frames: readonly WebmFrame[],
  peakFraction = 0.12,
  minimumRatio = 100,
  groupWithinMs = 80,
): readonly WebmFrame[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].map((frame) => frame.bytes).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const peak = sorted.at(-1) ?? 1;
  const threshold = Math.max(peak * peakFraction, median * minimumRatio, 1_024);

  const changes: WebmFrame[] = [];
  let previousChangeAtMs = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    if (frame.bytes < threshold) continue;
    if (frame.atMs - previousChangeAtMs <= groupWithinMs) {
      previousChangeAtMs = frame.atMs;
      continue;
    }
    changes.push(frame);
    previousChangeAtMs = frame.atMs;
  }
  return changes;
}

/**
 * The first scene change at or after a step's reported offset.
 *
 * This is the measurement's matching rule, and it is worth stating plainly because a different
 * rule would make the result mean something different. A step's visible effect can only appear
 * **after** the step starts — the step is what causes it — so the answer is the first change from
 * the reported offset onward, with slack for a repaint whose frame is *stamped* earlier than the
 * step's reported start.
 *
 * Matching by *position* instead (the n-th change for the n-th step) would be wrong whenever the
 * encoder emits a periodic keyframe, which it does: one spurious change would shift every later
 * step and turn a correct runner into a failing measurement.
 *
 * ## Why the slack is 100 ms, not one frame interval (story 10.16b)
 *
 * On the recording's timeline a repaint is stamped **before** the step's reported start, not
 * after it: ten fixtures-tier runs (90 steps) put the nearest change at 0.8–85.3 ms before the
 * reported offset. That lead is the readiness-to-first-frame gap AC-12c leaves to staging, plus
 * the 40 ms frame quantum, plus a burst being stamped at its first frame. The slack used to be
 * 60 ms. Every step whose lead exceeded it — 14 of 90, leads 60.0–85.3 ms — was matched to the
 * **next** change instead, hundreds of milliseconds later. Two of those ten runs failed the
 * median tolerance that way. Nothing was wrong with the detector: every repaint was found.
 *
 * 100 ms makes the matching window equal to the tolerance the measurement asserts
 * (`MEDIAN_TOLERANCE_MS`). A step whose effect lies within tolerance before its reported start is
 * attributed to that effect. A step beyond it is out of tolerance whichever change it is matched
 * to. So the helper can no longer turn an in-tolerance step into an out-of-tolerance number.
 *
 * **Do not widen it past the next spurious change.** The encoder emits changes that belong to no
 * step, and one recording in `webm.test.ts` has such a change 320.7 ms before a step's reported
 * start. A slack that reaches it matches a correct step *backwards*.
 *
 * @returns the frame, or `null` when no change follows the step at all.
 */
export function firstChangeAtOrAfter(
  changes: readonly WebmFrame[],
  offsetMs: number,
  slackMs = 100,
): WebmFrame | null {
  return changes.find((change) => change.atMs >= offsetMs - slackMs) ?? null;
}
