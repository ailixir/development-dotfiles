---
name: openapi-internal-tag-partition
description: The Studio contract's public/internal split is the `internal` tag, never the path prefix — four runner ops are internal on non-/internal paths; and a partition needs a totality assertion
metadata:
  type: project
---

`docs/specs/studio/openapi.yaml` has 18 operations. The public/internal split is defined by
`info.description` on the **tags**, not by the path: *"Routes tagged `internal` are not exposed
through public ingress … each declares … exactly one of `runner` or `api-callback` next to
`internal`."*

- 12 untagged-`internal` public operations (8 `tests`, 4 `executions`)
- 2 `internal`+`api-callback`: `claimAdmission`, `reportProgress` (under `/internal/studio/...`)
- 4 `internal`+`runner`: `runnerValidateArtifact` (`/v1/validate`), `runnerAdmitRun` (`/v1/runs`),
  `runnerHealth` (`/health`), `runnerReadiness` (`/ready`) — **none** under `/internal/`

**Why:** a path-prefix rule counts 16 "public" operations and is false against the correct document.
@po caught this at 10.31's validation before it was written.

**How to apply:** partition on tags. And assert **totality** — that the three buckets' union equals
every operation matching the predicate — or an operation tagged `internal` and nothing else silently
escapes all three rules. That bypass was falsified (`runnerHealth` retagged `[internal]`) and is the
only thing that catches it.
