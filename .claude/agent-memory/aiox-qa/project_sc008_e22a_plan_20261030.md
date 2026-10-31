---
name: sc008-e22a-plan-20261030
description: SC008 E22a (gate harness) Phase A findings - gate tests red at import, learning receipt has no persistence, dead SC-007 oracles, gate ports
metadata:
  type: project
---

SC008-E22 Phase A written 2026-10-30 in `/Users/brunobuger/.aiox-lean/put-checks-ui-studio/SC008/work/SC008-E22/` (contract, binding, plan, stage0-and-gate.md).

- **All 9+ realsite-gate node tests fail at import** once E5's action.schema.json edit is in the tree: `status.ts` loads OPERATION_KINDS from `contracts/v3/action.schema.json` (`properties.operation.oneOf`). Removing it is step 1 of E22a.
- **Learning-attempt receipt is persisted nowhere** (ledger.schema has no receipt; E3/E4/E6 plans keep only derived state/outcomeCode). N1/N3 on effects cannot be proven until a WI stores it; proposed nullable `studio_guided_actions.receipt` jsonb (no contract change). Re-check whether this was ruled before assuming it exists.
- **Dead SC-007 oracles block PASS**: `regionFindings` forces "UNKNOWN independent Q4 region coverage"; `diagnostic-oracles.ts` reads old operation/recipe shape. Plan deletes them (wrong-region becomes a G8 line).
- X-5 fifth smoke flow identified (INFERRED) as the one-step probe `Go to the page "https://www.iana.org/"` in the edit-relearn spec.
- Gate stack ports must be 18000-18999 (`stack/ports.mjs`); on 2026-10-30 18080/81/90/92/88/200 were already listening (not ours). Proposed set 18480/81/90/92, vault 18400, app 18477, recorder 18488.

**Why:** these shape what the E22a review and the counted gate can honestly claim. **How to apply:** when reviewing E22a or E22b, verify each of the four against the candidate before accepting.
