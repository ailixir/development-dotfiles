# SPK-06 — Measured video step-seek accuracy vs the 500 ms target

**Status:** OPEN. This is the record hook created by story 10.19 (AC-16), mirroring `SPK-01/README.md`.
**Phase A ran** (story 10.12, on a developer machine); **phase B — the staging measurement, which is
what gates the release claim — has not.** No phase-B evidence is recorded below and this file closes
no spike.

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-06
**Epic dependency:** no `ED-*` id. Phase B needs the deployed pipeline, i.e. `ED-03`/`ED-05`/`ED-06`
in practice, but the register lists no `ED` against this spike and this file does not invent one.
**Accountable owner:** @architect (Aria), as register owner
**Executes:** Runner dev (phase A — done); **@qa (phase B — outstanding)**
**Gates (staging acceptance):** 10.16 (release claim), 10.19
**Shapes earlier:** 10.12 timing-origin calibration method

---

## Why it cannot be established locally

Architecture §6.4: seek within 500 ms of the visible step start on the controlled fixture is a V1
target that must be validated in staging before it is claimed for real applications; the runner clock
origin must be calibrated against the pinned recorder's first frames.

---

## The two phases

**Phase A (developer machine, before 10.12 was built) — RAN.** Throwaway measurement, not production
code: with the pinned Playwright version, record a controlled fixture page that displays a monotonic
timestamp, log step start times from a monotonic clock, and compare against the frame at which each
step's visible effect appears in the webm.

**Phase B (staging, after 10.12/10.16) — OUTSTANDING.** The same measurement through the real
pipeline: dispatch → runner → Sonic → API `/video` → MFE seek, on the controlled fixture, including
initial navigation and an assertion-failure case.

## Questions this spike must answer

*(Verbatim from the register.)*

1. What is the offset between recording start and the first encoded frame with the pinned recorder,
   and is it stable across runs and resolutions?
2. Using `offsetMs` per §6.4 (start on the recording timeline, monotonic clock, calibrated origin),
   is the seek error within 500 ms for every attempted step on the fixture, including step 0
   (navigation) and the failing step?
3. Does the chosen recording resolution keep evidence text readable while staying within upload size
   expectations (SPK-03 question 6)?
4. Does a wait/assertion step seek to its start rather than to the instant its condition became true
   (§6.4)?

---

## Evidence that closes it

Committed under `docs/qa/spikes/SPK-06/`:

- phase A table (run × step: logged start, observed frame time, error) with the recorder version and
  the calibration method chosen;
- phase B table from staging through the MFE with the same columns;
- the fixture page source;
- a note on resolution/size.

## Findings

_Fill in during the spike. Leave a row empty rather than plausible._

| Question | Phase | Finding | Evidence file | Date | By |
|---|---|---|---|---|---|
| 1. Recording-start to first-frame offset, stability | A / B | | | | |
| 2. Seek error vs 500 ms for every step, incl. step 0 and the failing step | B | | | | |
| 3. Resolution: readability vs upload size | B | | | | |
| 4. Wait/assertion step seeks to its start | B | | | | |

## Applying story 10.32's calibration setting

Story 10.32 shipped `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` (default `0`; no real value is set
anywhere). ADR-002 §26.3 item 4: a measured staging gap is folded into that setting **only if it is
systematic** — the same sign on every step, and the median larger than the run-to-run spread.
`ESC-3` is open against this: a non-zero calibration is currently unreconciled with the setting's
declared `minimum: 0` and with the `browserStartedAt` pairing. **Do not set a non-zero value from
this spike's result until `ESC-3` is resolved by @architect.**

## Fallback if negative

Report the measured tolerance instead of 500 ms in the UI and BRD, and record the calibration limit;
the step-seek feature remains, with the honest tolerance disclosed. **No synthetic index-based
mapping is reintroduced.** ADR-002 §26 (F-5) rules that no bound moves.

**Owner sign-off:** _(@architect, date — required by the register's closure rule before `Result`
moves off `OPEN` in `studio-staging-spikes.md`. @qa runs phase B; @architect signs the record.)_
