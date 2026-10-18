# STUDIO-OBS-008 F1 closure (root, 2026-10-17 19:45 EDT)

**F1 CLOSED: GREEN.** W3 (L5b and L6-author) is released.

## Backend union gate `obs008-f1-be01`

- **Command:** `with-gradle-lock.py python3 run-backend-tasked.py obs008-f1-be01 --test-tasks test,guidedIncrementalTest -- test <34 --tests from lanes/f1-backend-selectors.json> guidedIncrementalTest --no-daemon`. N24 was on PATH.
- **Result:**
  - exit 0;
  - **656/656 PASS**, with 0 failed, 0 errors and 0 skipped;
  - `taskCollectionComplete: true`.
- **Stability:**
  - `sourceStable` true;
  - `distStable` true;
  - `testInputStable` true.
  - Source digest `a14eeb780573feb38676b5cb40e2c6f1b1150278c9276f33abcd4a9bfe14b5b5` (1696 files) was identical before and after.
- **Elapsed:** 4594 s. GuidedPublicationReplayIT `confirm-expire` waits out the real 600 s session lifetime by design.
- **Class coverage:** all 34 selector classes appear in `execution/obs008-f1-be01-results.json`. Among them:
  - StudioContractTest 14;
  - ExecutionSnapshotMapperTest 14;
  - StudioCapabilitiesIT 7;
  - GuidedSessionVideoIT 9;
  - ObservationPolicyIT 11;
  - GuidedCsiBudgetIT 5;
  - GuidedPublicPresentationIT 13;
  - GuidedPublicationReplayIT 108;
  - ExecutionReplayFailureMigrationIT 9.
- Receipts sit next to this folder in `execution/obs008-f1-be01*`.

## Frontend F1 (earlier, same hold discipline)

- type-check exit 0.
- lint: 0 errors / 308 warnings.
- vitest: 64 files / 1200 tests, excluding `src/test/a11y` (L6 is its sole writer). See `f1-*.log`.

## Expected-red ledger W1→F1: EMPTY (evidentiary)

| Row | Closure |
|---|---|
| R1 ExecutionSnapshot parity | StudioContractTest and ExecutionSnapshotMapperTest green in the stable run |
| R2 capability route parity | StudioCapabilitiesIT and StudioContractTest green |
| R3 INVALID_CONTRACT in the guided ITs | Aria w1-confirmations §3: four projector sites, exact names, and a stable closing run with GuidedSessionVideoIT, ObservationPolicyIT, GuidedCsiBudgetIT and the fixture callers. All three conditions are met by this run |
| R4 frontend capability handler | Closed in the frontend F1 vitest run |

## Batons

Batons are in `batons.json` (recorded 22:28Z). They are unchanged by this gate, since no source changed during the hold.
