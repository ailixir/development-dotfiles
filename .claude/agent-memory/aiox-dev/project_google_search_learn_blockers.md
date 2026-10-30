---
name: project-google-search-learn-blockers
description: 2026-10-26 "Open google.com / Search for X" learn failure - four stacked blockers (collector aria-owns rule, press targetIntent, post-fill stale observation, JS-submit navigation race) plus Google's reCAPTCHA wall; what was fixed and why the obligation pin forbids a backend refresh fix
metadata:
  type: project
---

Learning `Open https://google.com` + `Search for "Top 3 banks"` failed BUDGET_EXCEEDED, then UNSUPPORTED_SURFACE, then FAILED with no errorCode. Fixed in four places, proven live on the :5181 stack (fixture + Google both learn SUCCEEDED and replay PASSED):

- **Collector** (`observationCollector.ts`): `aria-describedby` no longer ambiguous; `aria-owns` ambiguous only when not named by aria-label/aria-labelledby/label. A visible `<input type=submit>` is STILL withheld when a `display:none` duplicate with the same value exists (the hidden one is inventoried as a private value, `nativeAction` exemption needs `eligible`). Left alone: the test presses on the combobox instead.
- **Prompt** (`guided-output-contract.md`): the plan said press `targetIntent:"Enter"`. For press, targetIntent is the control that receives the key; the key is chosen in NEXT_ACTION. `acquisitionAvailable` can never find a node named "Enter".
- **Observation settle** (`browser.ts` observe + collector `settle`, 400 ms quiet / 2.5 s cap): typeahead mutates the DOM after the fill, `matches()` fails on any mutation since collect (revision), prepare is refused TARGET_CHANGED.
- **Enter navigation grace** (`browser.ts` invoke): Google's textarea keydown is default-prevented then navigates by script; `navigationExpected` is false for a textarea, so the next observe hit STALE_OBSERVATION and stopped the session CONTEXT_LOST (FAILED, no errorCode).

**Do not "refresh and re-propose" in the backend after a prepare refusal**: `store.reserveObligation` pins an obligation to its first proposal digest, a re-proposal on a new observation is rejected APPLY_OTHER x N then BUDGET_EXCEEDED (tried and reverted). The design repeats the same proposal; fix staleness on the runner side.

**Google itself**: any automated submit from this network lands on `google.com/sorry` (reCAPTCHA "unusual traffic"), even with `channel:'chromium'`. The learn and replay "pass" but never show results. Use a local fixture for proof (see [[tooling-live-stack-devtools-db-wipe]]). IP-literal URLs are refused by `AllowedDomains.hostOf`; use `localhost`.
