/**
 * AC-12 — seek accuracy: the halves that are blocked, recorded as live skips.
 *
 * AC-12a measured, on a developer machine, the reported `startedAtMs` of every step against the
 * frame at which its effect appears in a real recording. It drove the artifact-1 run path
 * (`runReal` over the Playwright operation adapter), which STUDIO-OBS-012A AC-3 deleted, and its
 * case was deleted with it; observed replay recording and its seek evidence are OBS-013's. The
 * staging halves below were never this tier's to pass and stay recorded as skipped.
 */
import { describe, expect, it } from 'vitest';

/**
 * AC-12b — the same measurement **through the real pipeline**, against the 500 ms target.
 *
 * Dispatch → runner → Sonic → API `/video` → MFE seek, in staging. Owned by **SPK-06 phase B**,
 * consumed by 10.16 ("staging validates the target before release claims") and 10.19. Recorded as
 * skipped, never passed, until that evidence exists — the measurement above is a developer
 * machine and half the pipeline.
 */
describe('AC-12b — seek accuracy through the pipeline, against the 500 ms target', () => {
  it.skip('measures dispatch → runner → Sonic → API → MFE seek in staging — SPK-06 phase B', () => {
    expect.unreachable('SPK-06 phase B owns this measurement; 10.16 and 10.19 consume it.');
  });
});

/**
 * AC-12c — the readiness-to-first-frame gap, measured **in staging**.
 *
 * ADR-002 §11.6 item 3 records that recording-context readiness is a *proxy* for the recorder's
 * first frames and not the same instant, and assigns measuring that gap to this story on the
 * controlled fixture in staging. If it proves a material fraction of the 500 ms budget, a measured
 * constant is folded into the origin `src/run/timeline.ts` takes — runner-side, needing no contract
 * change, which is the second reason the calibration lives in one component.
 *
 * The measurement above does **not** claim it: its systematic component contains that gap, but a
 * laptop cannot separate the gap from its own scheduling noise, and this story must not report a
 * number for it from one. Recorded as skipped, never passed, until staging evidence exists.
 */
describe('AC-12c — the readiness-to-first-frame gap', () => {
  it.skip('measures the gap on the controlled fixture in staging — evidenced by SPK-06 phase B', () => {
    expect.unreachable('Staging owns this number; 10.16 and 10.19 consume it.');
  });
});
