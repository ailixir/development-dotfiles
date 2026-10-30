---
name: press-after-fill-combobox
description: Wikipedia "Press Enter" after filling the search box died as POLICY_DENIED/UNGROUNDED_TARGET because the box becomes role=combobox; two fixes (runner directValueOnly, backend same-element selection)
metadata:
  type: project
---

2026-10-29: press inheritance (GuidedPressInheritance.derive) IS implemented; it failed on Wikipedia because (1) the filled input gets a script-added role="combobox", so the runner's `directValueOnly` certificate (no role attribute allowed) did not apply and the fact got ownTextComplete=false (typed value counted as hidden own text); (2) derive compared role exactly (searchbox vs combobox). Fixes: perceptionInPage.ts/perceive.ts allow input type text|search with role combobox; backend + runner validator treat textbox/searchbox/combobox as one role for the same-element press.

Diagnosis: audit event GUIDED_ACTION_REFUSED in backend.log carries reasonCode (UNGROUNDED_TARGET/DESTRUCTIVE_VERB) and targetRole; model attempt row has rejection_gate NEXT_POLICY_CALL. Perception-tier parity.test.ts is already red (directValueOnly flag missing in the frozen baseline); new certified inputs add more of the same diff (c07/search.html).
