---
name: 011-inbound-carried-items
description: 2026-10-17 placements of the STUDIO-OBS-008 carried items C-OBS008-1…5 (011 inbound table, 009 "Carried items (inbound from 008)" for lane C9, README F08 post-GA copy pass + R5 pending user decision); inbound table kept separate from the T5 "Carried forward" table
metadata:
  type: project
---

STUDIO-OBS-008 carried items and where @po placed them (all 2026-10-17, append-only, Status unchanged):
- **011 "Carried items (inbound)" table** (section before Dev Agent Record), owner @dev:
  - C-OBS008-1: fold the `/result` builders. This is a behaviour change, with a dated AC-7 exception (0.2.11).
  - C-OBS008-2: the `MAX_VALUE_LENGTH` Javadoc, optional (0.2.11).
  - C-OBS008-3: the `guidedNarratives.ts` citation metadata moves to a test-only registry; templates byte-identical. Placed under T2 (0.2.12).
  - C-OBS008-5: the `handlers.ts:177` `secretId ?? name` fallback. Placed under T1, with Quinn's authoring-mirror check as optional part e (0.2.12).
- **009 "Carried items (inbound from 008)"** (before Dev Agent Record), lane C9 plus @architect:
  - C-OBS008-4: the start 422 `AUTHORING_REFERENCE_AMBIGUOUS` is undeclared in the contract. Either declare it and re-anchor the pins, recommended in the same C9 unit as P2, or change the backend status. Then mirror the four refusals in `guidedHandlers.ts` (0.3.22; po-delta-validation.json amendments entry 5).
- **README backlog:** the STUDIO-OBS-F08 (POST-GA-COPY) row holds the 9 Lows, the partial carries UX-09/UX-13, the UX-02 cue and the UX-22 record. A "Pending user decision R5 / OBS-1" line ("Someone pressed Stop") sits in the appended "F08 items…" subsection.
- **Not placed (not dispatched):** Quinn gate-draft §5 items 9 and 10, the Dex W5-7…W5-13 leftovers and the tech-gate leftovers F-L5a-4 and F-L5b-7 M6.
- **Inventory rows:** CLN-50 and CLN-51 went into inventory §5, so §1–§4 stay byte-identical.

**Why:** in AC-2/T5, "Carried forward" means "not finished here". Filing inbound work there would invert its meaning. 009's "Not owned here" line needed a narrow exception for the contract and mirror files.

**How to apply:** append later inbound items to the same tables and add matching T sub-items and File List lines. Check the target's "only/one exception" and "Not owned here" wording, and extend it at the end of the line, never by rewording. Before editing, copy the originals to a unique scratch folder so the append-only diff can be proven.

See [[studio-observed-wave-po-conventions]].
