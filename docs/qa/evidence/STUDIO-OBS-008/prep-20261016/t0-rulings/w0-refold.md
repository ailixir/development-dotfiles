# STUDIO-OBS-008 W0 refold — summary (2026-10-17)

- **Author:** Aria (@architect). **Full record:** the `implementation-plan.md` section "W0 refold 2026-10-17" and `lanes.json` → `w0Refold20261017`. Both are append-only; no history was deleted.
- **Also edited:** `obligations.json` gates G-1…G-5 gained an appended `amended20261017` field (npm → pnpm), plus one `amendments` entry. `storySha256` is untouched.
- **Governing inputs:**
  - story 0.3.13 (`be87eaac…`) with its "PO scope decision — 2026-10-17 (user)" block;
  - ruling A1.7;
  - root's W0 facts: 015 Done (CONCERNS), head V21 → V22, and all seven contract hashes match. I re-hashed all seven and they match.
  - the second user scope change on accessibility, relayed by root. Pax recorded it during the refold as ADR-SC-006, story `73c09cb2…`.
- **No source edited.** No build, test, install, database or git write.

## Waves

| Wave | Lanes (owner) |
|---|---|
| W1 | **U2** pnpm migration (aiox-dev) ∥ **L0** C-int: P1–P3, A1 OpenAPI, pins, ADR-002 §13, F4/R4 note (aiox-dev) ∥ **DE** V22 plus six head-pin tests (aiox-data-engineer) ∥ **L1-A** A1 derivation (aiox-dev) |
| W2 | **L2a** v2 authoring + A1 types/MSW and **L3H** harness + U2 docs, both from U2 exit. **L2b** W2.0 drop, from U2 + L0 exit; then L2b body ∥ **L4** ∥ **L5a** (aiox-ux). **L1-P** P1–P3 backend |
| F1 | root: handler composition, allowlist to zero, C-int-2 fixtures, backend union gate, batons |
| W3 | **L5b** page integrator (aiox-ux) ∥ **L6-author** (E2E spec authoring only) |
| W4 | **L6**: `studio-guided.spec.ts` (MSW), the D5 real-backend smoke (local bootRun), and the jsdom audit as a regression guard only |
| W5 | Root's serialized pnpm, backend and runner gates; then Dex, Uma (UX/copy only) and Quinn |

The write-overlap check found **0** overlaps in every concurrency group (W1, W2, F1, W3, W4).

## Scope changes folded in

- **IN:**
  - D5 (it was optional before).
  - The F4 note, assigned to L0.
  - A1, without the optional `SnapshotFailed` null example.
  - A3, without the CANCELLED wording variant.
- **Removed:**
  - PLAYBACK-COST, which deletes the GuidedPlaybackLoadIT lane and its W4 window.
  - PLAYBACK-COPY.
  - All non-must-have accessibility work: the live region, focus-on-entry and keyboard handling beyond MUI, `aria-current`, reduced motion, the surface 4/5 rewrite, the contrast and target-size rules, the accessibility spec, FE-A11Y, Uma's accessibility review, and the WCAG target.
- **Accessibility kept:**
  - focus to step N;
  - expiry warnings as text;
  - seek labels;
  - untrusted PAGE styling;
  - the narrow layout;
  - the jsdom audit, as a regression guard only.

## Root decisions needed

- **R1** Collector runs hash `frontend/` too. My recommendation: focused runs taken during active editing are non-evidentiary, and lane-exit and gate runs happen inside hold windows.
- **R2** The receipts land in 015's evidence directory. My recommendation: copy both collectors with an 008 output path.
- **R3** Approve running `bootRun` outside the collector for D5.
- **R4** Checkpoint the uncommitted 015 tree before W1.
- **R5** Resolved during the refold. Pax recorded the accessibility change (ADR-SC-006, story `73c09cb2…`, `obligations.json` `amended20261017b`), and it matches this refold.
