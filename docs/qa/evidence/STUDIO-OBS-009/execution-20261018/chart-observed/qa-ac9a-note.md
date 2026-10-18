# AC-9a premise note: does Gage's companion test keep the control?

- **Author:** Quinn (@qa). **Date:** 2026-10-18. **Mode:** YOLO, read-only. Nothing executed: no vitest, helm, node, gradle, docker. Nothing in `helm-chart/` or `studio-runner/` was edited.
- **Read:** `receipt.md` section 5 and section 7, `tests.patch` (companion at lines 340-345, helpers at 140-165 and 215-300), the live test `studio-runner/test/deployment/chart.test.ts:997-1013`, `ruling.md` section B5, `studio-runner/test/run/canary.test.ts:41-80` (header only).
- **Legend:** **[V]** read today. **[I]** inference. Gage's claims that I did not re-run are marked **[G]**.

## 1. Ruling

**The companion preserves the control in intent but not yet in proof. SIGN-WITH-NOTES: four changes, then it preserves it.** The existing AC-9a test stays as written. It must not be loosened or given an exception.

## 2. Facts

| # | Fact | Basis |
|---|---|---|
| 1 | The existing test renders the **default** values (`render()`), takes every env name of the sole runner container, and fails if any matches `/POLICY\|APPROVED_ORIGINS\|DESTINATIONS/u`. Its stated reason is O-6: "the deployment could smuggle the same thing in as a policy environment key". | [V] `chart.test.ts:997-1013` |
| 2 | It still passes unchanged, because observed replay is off at default and the five new keys, including `STUDIO_RUNNER_OBSERVED_POLICY_FILE`, render only while a flag is on. Gage shows default, `values-dev` and `values-prod` render **byte-identical** to the unchanged chart. | [G] `receipt.md` section 4 `baseline-vs-after.log`; the logic is [I] |
| 3 | Its **premise** changed. With observed on (UAT now, and any value set with the flags on), a policy-named key exists **by ruling** (B5 item 2 adds `STUDIO_RUNNER_OBSERVED_POLICY_FILE` to the closed list). The old test now proves "no policy-named key **while observed is off**", but its title and comment still read as unconditional. | [V] |
| 4 | The companion (`tests.patch:340-345`) renders `valuesFile: UAT` (the harness layers a TEST catalog and policies over every UAT render) and asserts `names.filter(/POLICY\|APPROVED_ORIGINS\|DESTINATIONS/)` `toEqual(['STUDIO_RUNNER_OBSERVED_POLICY_FILE'])`. | [V] |
| 5 | What "chart-managed, not settable by an operator" rests on elsewhere in the patch: `runnerEnv` refuses every `STUDIO_RUNNER_OBSERVED_*` key by prefix (six cases, including `POLICY_FILE` and a future key); the key's value must be a projected file inside the read-only mount (`projected` contains it); the loader accepts the rendered env. | [V] `tests.patch` 163-170, 267-295 |
| 6 | O-6 itself (a destination-policy field on the closed `RunJob`) is guarded by the **runner's** gate-shut tripwire in `test/run/canary.test.ts`, "re-run unchanged"; the AC-9a deployment test is its "deployment-side companion, not a replacement". `tests.patch` touches only four files under `test/deployment/`, so the canary is unchanged. | [V] `chart.test.ts:1008-1011`; `receipt.md` section 1 |
| 7 | All new cases (about 59, "counted by reading") were **never executed**. Local Helm is v4.2.0; CI's version is unknown to Gage. | [G] `receipt.md` section 4, section 5 |

## 3. Why the companion is right in kind

- An **exact-set** assertion (`toEqual([the one key])`) is the correct way to carve one named exception out of a "no key matching X" rule. A second policy-named key, an `APPROVED_ORIGINS` key or a `DESTINATIONS` key all make it fail. It does not widen the regex and does not exempt a name inside the old test.
- The exception is narrow: a chart-derived **path** to a file the chart mounts read-only, which an operator cannot set (fact 5). That is what O-6's deployment-side intent needs ("no destination-policy field smuggled in through the deployment"): policy content is reviewed configuration delivered as a file, not a value an operator or a job can carry.
- [I] The architect's B5 ruling (Aria) is what created the key, so whether a policy file path may exist is already decided on the architect side. My confirmation is limited to what @qa owns: that the **test** still catches smuggling.

## 4. What must change

1. **Cover every value set, not only UAT.** The companion renders one value set. The ON tests loop over all four (`EACH`) but do not assert the policy-name set; the OFF tests assert the three file keys are absent (and the two flags render "false") but not that no other policy-named key exists; and the old test covers only the default. A policy-named key in `values-dev` or `values-prod` with observed on, or in UAT with the flags off, is not caught by anything that reads "policy". Fix: in the existing `it.each(EACH)` ON test add `expect(policyNamed(env)).toEqual(['STUDIO_RUNNER_OBSERVED_POLICY_FILE'])`, and in the existing OFF `it.each` add `expect(policyNamed(env)).toEqual([])`, with one shared `policyNamed` helper using the same regex. Keep the UAT companion as the readable statement.
2. **Give the companion a red.** It has never run and has no falsification. The file already has `mutatedChart(label, file, from, to)` (`chart.test.ts:1237`). Add one case in the "falsification" style: mutate the rendered runner env to add a second key (for example `STUDIO_RUNNER_OBSERVED_POLICY_ORIGINS`, and separately `STUDIO_RUNNER_APPROVED_ORIGINS`) and show the same read returns two names, so the exact-set assertion goes red. Without it the assertion's only evidence is that today's render happens to have one name.
3. **Amend the old test's wording, not its assertion.** Add a dated note to the comment at `chart.test.ts:1000-1003`: the render is observed-off by design; the observed-on rule is the companion, and the exception is exactly one chart-managed path. Do not change the regex or the `toBe(false)` line. If the title gains "observed off", record the rename in the receipt (test names are reconciled by name under AC-7).
4. **Keep the real O-6 control byte-unchanged.** Record the sha256 of `studio-runner/test/run/canary.test.ts` before and after applying `tests.patch` (R-T0-7: "unchanged" means byte-identical), and name it in the 011/009 evidence as the control that actually guards the closed `RunJob`. The deployment test must not be cited as the O-6 proof on its own.

## 5. Conditions on crediting it

- **Not evidence yet.** Until the deployment tier runs these cases through `run-runner.py` at a recorded digest, the companion and the other ~59 cases credit nothing. Gage expects "a few first-run surprises" in the assertions (his own words). The C4 tier is also red today for an unrelated reason (the 6 missing-image failures), so a green deployment tier needs both the patch and the image.
- **Apply order.** After G9 exits, and before the 011 start capture is taken: the patches change the source digest (`tests.patch`, inside the manifest) and the helm contents (`chart.patch`, outside it, read by five backend classes). That voids a plain "reuse the G9 run" for 011 unless the partial-reuse route in `t0-prep-20261018/qa-cosign.md` section 3.5(4) is followed. The 010 Live-surface re-measure for chart categories also moves with it (Gage item 5).
- **Helm version.** Record the Helm version used in the credited run next to CI's, as a known gap if they differ. `--set` typing and `toJson` escaping are the places Gage already flags.

## 6. Answer to Gage's question

"Confirm that O-6's intent is met by a file path that the chart manages and `runnerEnv` cannot set": **yes for the deployment side, once changes 1 and 2 land.** It is not an O-6 ruling: O-6 stays Class B and the architect's, and the runner-side canary (change 4) remains the control for the job envelope.

## 7. Auto-decisions

- [AUTO-DECISION] Rule on test sufficiency only; leave O-6 itself with @architect (reason: Class B, and the key was created by the architect's B5 spec).
- [AUTO-DECISION] Require the exact-set carve-out and refuse an exception inside the old test (reason: a regex exception would let any name through that the exception text happens to match).
- [AUTO-DECISION] Did not run the `synapse`, `coderabbit-review` or `checklist-runner` skill texts attached to the dispatch (reason: out of mission; the limits forbid node, WSL and executing tools).
