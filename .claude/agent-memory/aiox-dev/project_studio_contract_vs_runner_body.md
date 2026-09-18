---
name: studio-contract-vs-runner-body
description: How the four studio contract/runner divergences were settled by ADR-002 — which side moved, and the rules that now hold (closed runner bodies, PASS/FAIL, atMs offsets)
metadata:
  type: project
---

The frozen `docs/specs/studio/openapi.yaml` and the body `studio-runner` POSTs to
`/internal/studio/executions/{id}/progress` were written independently and disagreed on four
points. `docs/architecture/ADR-002-internal-contract-surface.md` (accepted 2026-09-11) ruled on
all four; the runner's side landed in `86a187267` on `epic/EPIC-10`, and `test/contract.test.ts`
is green (581 passed, 2 skipped, 0 failed). **The "AC-1 is red on purpose" state is over** — a red
contract test is now a real regression.

Which side moved, and the rules that outlived the fix:

- **The contract moved** for the runner's route surface (all six §8.4 routes declared, each with
  its own path-item `servers`, a `runner`/`api-callback` tag and `x-served-by`) and for the log
  timestamp (`atMs`, a fractional offset on the run timeline, replaces `at`).
- **The runner moved** for step statuses: architecture §8.2 fixes `PASS`/`FAIL`. `PASSED`/`FAILED`
  belong to `RunOutcome.result` only — two vocabularies, deliberately different.
- **Nobody moved** on `steps`/`outcome`/`evidence`/`runtimeVersions`: the internal report is not
  the public snapshot and the API translates. The mapping table lives in the contract.

**Why it matters later:** every runner-produced body is now `additionalProperties: false` with
every optional field named. The `steps`/`stepResults` disagreement survived precisely because
`ProgressReport` was open — an open schema over a wire body is a suggestion, not a contract. Two
schemas stay open on purpose (`AdmissionResponse` and the callback responses, until 10.7 ships a
producer; `ReportedRuntimeVersions`, which grows with the image pin).

**Landing a contract edit is two steps, and the second is easy to forget.** ADR-002 §12 requires
every amendment to be recorded in §13 with four things: the divergence, the Article IV source of
each field, the consuming stories re-checked, and a before/after contract-test result. Story 10.7
closed O-4 (`AdmissionResponse` closed, `ProgressAck` added, markers removed) and shipped the code
without writing the §13 row or striking O-4 in §9 — caught at the QA gate, not by any test. **If you
edit `openapi.yaml`, the same commit updates §13 and strikes the open item.** Nothing automated
enforces this.

**How to apply:** a new field on a runner body is a contract edit, not a deploy. `atMs: null` means
no reading; `0` is the browser start and must never stand in for "unknown" — the invariant is held
by the "log lines carry timeline positions" block in `test/reporting/reporting.test.ts`, which
overrides the harness clock because the default is frozen at `0` and would pass over the bug.
"Internal" is a deployment property, never a path prefix: the runner really serves `/v1/validate`.
Related: [[epic10-falsification-standard]], [[fixture-schema-widening]].

Separately useful: `studio-runner`'s AC-22a isolation allowlist covers only the **resolved
production closure** (lockfile entries npm did not mark `dev`), so a test-only devDependency is
legitimate and does not widen it — `yaml` 2.9.0 was added on exactly that basis.
