---
name: case431-pair-prep-w44
description: W44 (2026-10-22) QA pair-check tooling for case431 - location, the retargeted-anchor finding, harness refusing REPORT.md writes, W45 command shape
metadata:
  type: project
---

QA pair-check successor for case431 lives in `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-044/qa-pair-prep/` (READY.json = inputs, W45 command, outputs; check-matrix.json = 35 checks 25 unchanged / 10 re-parameterized; diff-table.json = 430->431 hashes). Source-only, never run against case431.

**Why it matters:** devops' retarget manifest (round-044/devops-prepare/retarget-manifest.json) retargets ConfigValidator.java (ed6d90f3 -> a46c6dcc), target helpers.mjs (c376adbe -> b18535eb) and the ECDC binder (ecdc424b -> eebe1fc5). A literal port of the R38 selector would have refused on real 431 A and burned the once-guard. They are now context pins chained to the 430 baseline via the manifest (`link_retarget`).

**How to apply:** in W45, run `context-from-interface.py` (public preflight) before the single `invoke-admitted-pair.py` run; re-check devops INTERFACE.json field names against READY.json (devops had not seen my schema). If devops changes any retargeted file again, the manifest/pins must be re-issued. Only 15 of 35 checks have dedicated synthetic negatives (rest AST-identical to R38).

**Harness quirk:** Write refused `REPORT.md` in a subagent ("return findings as text"), even though the parent asked for it. Deliver the report inline and say so; do not bypass via Bash.

**W45 outcome (2026-10-23 00:38Z):** single invocation exit 0, 35/35 checks true, receipt ACCEPT at `parallel-execution-20261022/round-045/qa-pair/receipt.json` (SHA a28c30d6...). Devops INTERFACE.json nests helper/binder pins under `sourceBinding` and lacks `retargetManifest{path,sha256}`, so `context-from-interface.py` needed an adapter (copy in round-045/qa-pair). `invoke-admitted-pair.py` regexes force context/admission to `round-NNN/final431-pair-context.json` and `round-NNN/root-pair-admission.json` (not a subdir), and it hardcodes outputs to round-044/qa-pair-prep (copy them afterwards; do not edit the reviewed tool, its SHA is what Root reviewed). Avoid `ls -la` on `actual-pair-selection/` (shows raw log size).

**W46 (A' reseal after protected-PID census ruling):** re-ran pair check on A' 3bfe4a26 -> ACCEPT 35/35, receipt `round-046/qa-pair/receipt.json` SHA be5aa385.... Unmodified W44 tools would O_EXCL-collide with W45 outputs in round-044/qa-pair-prep, so round-046 holds copies of selector/invoker/adapter differing only by output-dir constant (selector SHA 4c443459). Pattern for any further A reseal: new roundNNN/qa-pair copy with the output dir swapped, new source-stage-receipt, fresh context/admission at roundNNN/ root.

**W51 (case432 after runner fix):** pair check on A432 ca2535ba -> ACCEPT 35/35, receipt `round-051/qa-pair/receipt.json` SHA 3bbe184f.... Devops generated the 432 tools (round-050/qa-pair-tools432); I diffed them vs my round-046 copies, copied byte-identical to round-051/qa-pair. Selector's `runner_fix_extra_ok` only checks 2 RUNNER_FIX_OVERRIDE extras exist (not their from/to) - real scope limit is the hash-pinned binder's hardcoded one-file allow-list; check the binder + live dist hash (e39e2c28) yourself.

**W55 (case433 = 432 + call-seconds 140):** pair check on A433 7c433d56 -> ACCEPT 35/35, receipt `round-055/qa-pair/receipt.json`. Same procedure as W51 (copy devops-generated tools byte-identical to roundNNN/qa-pair, 43/43 exact-inverse check via port/case/pin reverse map with word-prefix-scoped case regex, preflight, root-level context/admission, single invoke).
