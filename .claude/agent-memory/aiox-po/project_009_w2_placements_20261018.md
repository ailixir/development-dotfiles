---
name: 009-w2-placements-20261018
description: 2026-10-18 STUDIO-OBS-009 W2 / pre-F-merge placements — C-OBS009-1..4 in 011, F09 alert, KL-009-REVOKE-UNLEARNED, U23 token issuer
metadata:
  type: project
---

2026-10-18 placements from Aria's pre-F-merge rulings and the W2 lane receipts (`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`).

- 011 inbound rows C-OBS009-1 (teardown shed visibility, narrow AC-7 exception), -2 (one runner-TLS validate point), -3 (runner README artifact-1 sections + runbook §§1-3,5-13 re-audit), -4 (prepareScheduled shared builder). 011 0.2.13.
- README backlog STUDIO-OBS-F09: alert on the post-15-min re-drive WARN line, owner Platform/SRE, GA backlog.
- 009 0.3.23 section "PO notes — W2 findings and pre-F-merge rulings": KL-009-REVOKE-UNLEARNED disclosure; U23 guided token issuer (Q6 suggested U21 but U21 was taken); DE F1 grant scope for U14; D2 F4 UAT Secrets + pin.
- Register: new key `w2Batch20261018` (next batch should use a new dated key; next free id U24).

**Why:** rulings asked @po to place carries; Aria's "add to cleanup inventory" overridden by lead's "011 inbound table".
**How to apply:** when ruling-suggested U-ids collide, take the next free id and note it; JSON files here have mixed hand indentation, so append by text insertion and verify additivity by stripping and re-hashing. Related: [[project_009_t0_outcomes_20261017]], [[project_011_inbound_carried_items]].
