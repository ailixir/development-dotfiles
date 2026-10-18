---
name: ar-qa-sec001-test001
description: OBS-013 SEC-001 FIX (guided reuses replay startup-video delete; AR-1 R4 origin amended to after fresh app page) and TEST-001 AC-6 joined-oracle spec
metadata:
  type: project
---
2026-10-13 ruling (docs/qa/evidence/STUDIO-OBS-013/ar-qa-sec001-test001.json).
- SEC-001 = FIX (R13). Guided launch must do the replay sequence: probe, close page, delete startup video, newPage, THEN recording.ready(). This AMENDS AR-1 R4, which had put the origin "BEFORE verifyBrowserPreferences". A startup-file anomaly fails closed like replay. Offsets and the video head both shift by about 0.6 s, so seek stays aligned. No contract change.
- Oracle: decode at full resolution (not scale=1:1) over [0, first action startMs); every byte must be ≥245. Plus -250 ≤ first paint − a0 ≤ 500.
- TEST-001: AC-6 is hosted in GuidedPublicationReplayIT:3758 (secret-login), which uses the local store TEMP/objects and the ffmpeg PATH helper. The recorder fault is injected through the p3GuidedLaunchCounter wrapper writing recordVideo.dir. The isIn check at :16036 is made deterministic by reading the V20 row.
- 2026-10-14 amendment (ar-qa-sec001-oracle-revision.json): v1 oracle A WRONG — Playwright webm pts 0 = first composited frame, not ready(). A is now content/region based over [0,a0+1s]: frames must be content-free (≤6 row runs) or have 0 non-white px outside the app region. APPROVED with T1 (region area ≤10% of frame; finalBox is self-referential) and T2 (per-run chrome://version+prefs-internals positive control, outsideApp ≥10k). Measured Δ 208-341 ms, not 600: B's lower bound does NOT catch the half-fix mutant (retracted), and B passes on the reverted tree, so B is not SEC-001 evidence.
**Why:** the fix touches browser.ts, which is inside the frozen digest, so S4 must re-freeze.
**How to apply:** if anyone cites AR-1 R4 "before probe" as the origin rule, it is superseded. Related: [[ar1-obs013-recording-ruling]]
