# Bridge ruling disclosures and F-1 placement

Recorded by Pax (@po) on 2026-10-16. The machine record is `decision.json` in this folder. It holds the source hashes and the before/after story hashes.

**Source:** @architect (Aria) ruling `../backend/w2-window01/aria-bridge-ruling01/ruling.md`, sha256 `353d896f…`, together with `ruling.json` (`0c431939…`). Both hashes match the ruling's `manifest.json`.

**What I ran:** read-only greps, `shasum`, and one `python3 -I` name cross-check. I did not run Gradle or any test. Nothing was committed. No Status changed.

## Verified by @po

- **Test names.** `GuidedBridgeIntegrationTest.java` at sha256 `d48d4f0d…` (the hash the ruling cites) has 38 `@Test` methods.
  - Their names equal `ruling.json` `disclosure` exactly: retainedUnchanged 9, moved 16, retired 13.
  - `ruling.json` cases split as MIGRATE 16, RETIRE 12, RETIRE-OBSOLETE 1.
- **F-1 anchors**, in `GuidedSessionService.java` at sha256 `d10ec5cb…`:
  - `translation != null && translation.exists(id)` appears at `:353`, `:799`, `:832`, `:1375` and `:1923`.
  - The session bean in `GuidedSessionConfiguration` calls `installTranslation` with no property condition. The `translation.enabled` flag gates only `GuidedTranslationService`, `GuidedTranslationCoordinator` and `GuidedPlanningController`.
  - `start` initialises translation state (`:691-696`) when access is `GuidedProductionSessionAccess`. That class is the only main `GuidedSessionAccess` (`@ConditionalOnMissingBean`).
  - Result: the translation-absent branches are unreachable in the production composition.
- **Bridge class.** `GuidedBridgeIntegrationTest` has 0 references to `GuidedTranslationService`, so its existing OBS-014 AC-4 exclusion still holds.

## Corrections to the ruling (they do not change the outcome)

1. The ruling says GuidedSessionIT and TransportFaultIT "never call `installTranslation`". That is not exact at the hash it cites. `GuidedServiceTransportFaultIT.translationTeardownService` (`:4018-4025`) installs translation for the H8 teardown cases.
   - I did not verify whether those cases admit through the branch. OBS-011 F-1 a carries this as a T0 re-check.
2. GuidedSessionIT has 44 `@Test` at this tree, not 43. TransportFaultIT has 20 `@Test` plus 1 `@ParameterizedTest`; the ruling's "28" counts executions.

## Placements

| Item | Destination | Form |
|---|---|---|
| 38 → 9 + 16 + 13 disclosure, name lists, ADR-SC-005:57 exception, password-echo residual, F-1 citation limit | STUDIO-OBS-015 | PO paragraph appended to the Dev Agent Record (ruling §5 assigns it to @po); Change Log 0.1.7 |
| Port-proof reconciliation 37 + H8 = 38 | STUDIO-OBS-012A (Done) | Post-closure dated note before the Change Log; Change Log 0.2.7 |
| `GuidedBridgePlannedIT` added as an AC-4 named exclusion (0 click/press/check) | STUDIO-OBS-014 (Done) | Post-closure disclosure section at the end of the file; Change Log 0.1.19 |
| `GuidedBridgePlannedIT` added to the AC-12 i dist-digest list | STUDIO-OBS-009 (Ready) | AC-12 i addendum after j; Change Log 0.3.12 |
| F-1 removal (plus ruling §4.1 orphaned helpers and F-3 fixture duplication) | STUDIO-OBS-011 (Ready) | AC-2 obligation F-1 a–g (CLN-F1, class C); T1 sub-item; File List; Change Log 0.2.5 |

All edits are appended or inserted. No existing line was rewritten, apart from my own line-number fix inside the new 011 block. AC text, tasks and Status are unchanged everywhere.

## Why F-1 goes to 011 and not 015

ADR-SC-005 does not require it in 015:
- The OBS-015 row of the placement map covers D-D only (incremental re-learn).
- The ADR's "v1 service branches" removal belonged to 012A, which is Done.
- F-1 is the translation-absent composition left over from the OBS-004 bridge. It is not a v1 branch and is not named anywhere in the ADR. [I] That origin is my inference from the code shape and the ruling, not from git history.

The removal is behaviour-neutral in production because the branch is unreachable. That makes it the "thin final sweep" kind of work. OBS-011 AC-1 explicitly takes in new dead branches created by 007…015.

Putting it in 015 would add the migration of roughly 65 test methods (44 + 21) to a story that is InProgress under a frozen evidence ledger. No D-D AC needs that work, and the ruling itself offers 011 as an option.

The 015 risk is contained by the citation limit: these classes count as post-admission evidence only.

011 already requires the `GuidedSessionService` split to start from the final shape with a single owner. F-1 is sequenced in T1, before that split, so the split's "unchanged" baseline is the migrated classes.

**Release impact:** none. The branch is unreachable and the security rating is LOW. If 011 does not do it, it is carried forward and never dropped.

## Auto-decisions

- [AUTO-DECISION] 015 or 011 for F-1? → 011 AC-2 obligation (reason above).
- [AUTO-DECISION] Inventory class for F-1? → C. Tests still reference the branch, so they must migrate first; the decision is recorded. The ruling also says "class C".
- [AUTO-DECISION] Remove all five sites, or only `:1375`? → all five. The exact refusal per site and whether the `:691-695` `instanceof` goes are left to @architect at 011 T0. @po does not pick.
- [AUTO-DECISION] Place the ruling's §4.1 helper cleanup and F-3 fixture duplication? → yes, as F-1 f in 011. The ruling assigns both to OBS-011, and leaving them unplaced would drop them silently.
- [AUTO-DECISION] Record in 012A/014 even though both are Done? → yes, as dated post-closure notes plus Change Log rows. This follows the Epic 10 dated-note convention. Status and QA Results are untouched.

## Flags for the lead

1. **Closure receipts.** Two receipts bind story bytes that no longer match the story files:
   - `.ai/STUDIO-OBS-014-close.json` `storySha256After` (`58a789ff…`);
   - `.ai/STUDIO-OBS-012A-close.json` `artifactHashes.storyAfter` (`b0b79c13…`).
   - The protected content (AC, tasks, QA Results, Status, File List) is unchanged.
   - Root may want to rebind or annotate those receipts. I did not edit `.ai/`.
2. **For Dex.** The ruling §2 comment edit at `GuidedBridgeIntegrationTest.java:2759` and the 015 File List entry for `GuidedBridgePlannedIT` belong to @dev. Neither is done here.
3. **[I] Not placed: AC-11 k.** OBS-009 AC-11 k ("IT teardown reaps descendants") names the guided ITs that spawn browsers. `GuidedBridgePlannedIT` probably falls under it as well. I placed only what the ruling asked for (AC-12 i).
