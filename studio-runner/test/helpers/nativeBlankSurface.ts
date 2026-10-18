/** Test-only exact full-resolution oracle, Aria bootstrap-padding-ruling 2026-10-14.
 * No pixel is cropped/ignored: WHITE application rectangle and the complete known gray pad. */
export type BlankSurface =
  | { accepted: true; kind: 'WHITE' | 'WHITE_WITH_NATIVE_PAD'; rectangle: readonly [number, number, number, number]; padPixels: number; padMin: number | null; padMax: number | null }
  | { accepted: false; kind: 'INVALID_FRAME' | 'NONBLANK'; rejectedPixel: number | null };
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
export function classifyNativeBlank(rgb: Uint8Array, width: number, height: number): BlankSurface {
  const bytes = width * height * 3;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(bytes) || bytes > MAX_FRAME_BYTES || rgb.length !== bytes) return { accepted: false, kind: 'INVALID_FRAME', rejectedPixel: null };
  const white = (pixel: number): boolean => {
    const i = pixel * 3; return (rgb[i] ?? 0) >= 245 && (rgb[i + 1] ?? 0) >= 245 && (rgb[i + 2] ?? 0) >= 245;
  };
  if (!white(0)) return { accepted: false, kind: 'NONBLANK', rejectedPixel: 0 };
  let w = 0, h = 0;
  while (w < width && white(w)) w++;
  while (h < height && white(h * width)) h++;
  let padPixels = 0, padMin = 255, padMax = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    if (x < w && y < h) {
      if (!white(pixel)) return { accepted: false, kind: 'NONBLANK', rejectedPixel: pixel };
    } else {
      const i = pixel * 3, r = rgb[i] ?? 0, g = rgb[i + 1] ?? 0, b = rgb[i + 2] ?? 0;
      const min = Math.min(r, g, b), max = Math.max(r, g, b);
      if (min < 126 || max > 129 || max - min > 1) return { accepted: false, kind: 'NONBLANK', rejectedPixel: pixel };
      padPixels++; padMin = Math.min(padMin, min); padMax = Math.max(padMax, max);
    }
  }
  return { accepted: true, kind: padPixels === 0 ? 'WHITE' : 'WHITE_WITH_NATIVE_PAD', rectangle: [0, 0, w, h], padPixels, padMin: padPixels ? padMin : null, padMax: padPixels ? padMax : null };
}

/** Control-only discriminator copied exactly from original013 maxRowRuns: tolerance12.
 * NEVER used to accept a blank frame; it proves an actually rejected probe contains detail. */
export function nativeControlMaxRowRuns(frame: Uint8Array, width: number): number {
  let most = 0;
  for (let row = 0; row * width * 3 < frame.length; row++) {
    let runs = 1, base = row * width * 3;
    for (let x = 1; x < width; x++) { const o = (row * width + x) * 3; if (Math.abs((frame[o] ?? 0) - (frame[base] ?? 0)) > 12 || Math.abs((frame[o + 1] ?? 0) - (frame[base + 1] ?? 0)) > 12 || Math.abs((frame[o + 2] ?? 0) - (frame[base + 2] ?? 0)) > 12) { runs++; base = o; } }
    most = Math.max(most, runs);
  }
  return most;
}
