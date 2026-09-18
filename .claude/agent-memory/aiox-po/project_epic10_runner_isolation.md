---
name: epic10-runner-isolation
description: Epic 10's studio-runner must hold no DB/vault/CSI/LLM credential — a security property that fixes the 10.6/10.7 story boundary
metadata:
  type: project
---

The `studio-runner` component in Epic 10 (Checks Studio Execution) must never hold a
database, vault, CSI or LLM credential. Architecture §9.2 and the retired epic's §10.6
scope line ("No DB/vault/CSI/LLM access") are normative. Story **10.6 is the runner
service only**; story **10.7 owns every API-side persistence decision** — admission CAS,
progress/terminal persistence, snapshot revisions, restart recovery, reapers, ambiguity
resolution.

**Why:** the runner is the process that opens untrusted web pages. A DB connection there
is not a layering smell, it is a browser rendering hostile content while holding a
credential to the execution history. This is a security property, not a preference — so
it is not negotiable when a story feels awkward to split along that line.

**How to apply:** when validating or drafting any Epic 10 runner story (10.6, 10.12,
10.13, 10.14, 10.17), reject any criterion implying runner-side persistence or credential
access, directly or by implication. Isolation gates must be **fail-closed allowlists**
over the resolved production dependency closure — a denylist only fails for a driver
someone predicted. Pair that with an outbound-destination allowlist, since a dependency
gate cannot stop a reach-around over plain HTTP.

Related: [[epic10-concurrency-proof-standard]]
