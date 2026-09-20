---
name: error-code-three-way-pin
description: ExecutionErrorCode is pinned three ways (TS carrier, openapi.yaml enum, Java enum); a frontend-only change cannot add a code without reddening one side
metadata:
  type: project
---

`EXECUTION_ERROR_CODES` (frontend `studioTypes.ts`) is compared against
`components.schemas.ExecutionErrorCode.enum` in `docs/specs/studio/openapi.yaml` by
`studioContract.test.ts`, and the same yaml enum is compared against the Java enum by backend
`ErrorCodeVocabularyTest`. `executionErrorNarrative()` **throws** on any code outside the carrier.

**Why:** found on Studio v1 WP5 (2026-09-18). The backend cancel work (parallel worktree) owned the
contract amendment adding `CANCELLED`. Adding it to the TS carrier reddens the frontend contract test;
adding it to the yaml reddens the backend test. The frontend worktree could touch neither.

**How to apply:** when the frontend must render a code the contract has not declared yet, keep it
outside the carrier (WP5 used `CANCELLED_ERROR_CODE` and checked it before the narrative lookup). When
the yaml amendment merges, the frontend contract test goes red on purpose until the code moves into
the carrier with a narrative. Tell the lead that this red is the merge signal, not a regression.

Related: [[epic10-falsification-standard]], [[studio-contract-vs-runner-body]].

**Update 2026-09-18 (WP4, commit `62ea249ce` on `feat/studio-v1-cancel`):** the fold is done —
`CANCELLED` is in the yaml enum, the Java enum, the V20 CHECK (ErrorCodeVocabularyTest now reads
V20, not V17) and the TS carrier with a narrative. `CANCELLED_ERROR_CODE` survives as an alias.

