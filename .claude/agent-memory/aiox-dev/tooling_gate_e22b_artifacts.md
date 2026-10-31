---
name: tooling-gate-e22b-artifacts
description: where SC008 gate rehearsal data lives and what is NOT persisted (model replies, smoke DB), plus probe tricks for RCA
metadata:
  type: reference
---

SC008 gate rehearsals: `/Users/brunobuger/.aiox-lean/put-checks-ui-studio/SC008/gate-e22b/`.
- Generated step code lives only in `out/<run>/scan-attempts/initial-*/sources/db/studio_guided_model_attempts.jsonl` (`safe_result.code`) and `studio_guided_actions.jsonl` (use the latest `initial-` dir). Smoke runs (dry-...-2) are not scanned: no DB, no model replies; recorder keeps request bodies (`gateway/NNNN.req.json`, prompt context + outline) and finish metadata only.
- Map request to step: `requestId` in req.json user text equals `request_id` in model_attempts; step text in `context.sourceSteps`.
- Session timing without a DB: `stack/backend.log` (GUIDED_ACTION_ADMITTED event + last GET poll of the session id) shows fast failure vs the 12 s dispatch window.
- Local probes: `require` playwright-core and @playwright/test from `frontend/node_modules` (1.63.0) in a scratchpad .cjs; `setContent` pages need no network.
- `ASSERTION_FAILED` in the runner = any error with `matcherResult` (stepCode.ts), which includes strict-mode violations inside `expect`; prepare treats it as a result (no repair).
