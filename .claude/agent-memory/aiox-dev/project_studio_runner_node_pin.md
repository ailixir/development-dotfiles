---
name: studio-runner-node-pin-conflict
description: studio-runner pins Node via .nvmrc (22) but the pinned Playwright base image ships Node 24 — check:pins fails stage 6a on purpose until ED-05
metadata:
  type: project
---

`studio-runner/.nvmrc` (22) is the authoritative copy for the Node major the runtime image must
ship. `engines.node` (`>=22.11.0 <25.0.0`) is deliberately wider — story 10.2 chose the range so
the package still installs on a newer developer machine under `engine-strict=true` — so it is NOT
the image contract. `check:pins` asserts the recorded `node` against `engines.node` everywhere and
against the `.nvmrc` major only when the record came from inside the image.

`mcr.microsoft.com/playwright:v1.63.0-noble` ships Node v24.20.0, so CI stage 6a
(`check:pins -- --require-image`) fails today **by design**.

**Why:** ADR-001 §4.2 requires the image's Node to match `.nvmrc`; the base image is outside the
repo's control. Tracked as `ci/stages.md` open item O-2a (ED-05, Platform/SRE + @architect).

**How to apply:** do not "fix" a red stage 6a by widening `.nvmrc` or relaxing the assertion — that
deletes the only copy pinning Node. The fix is the internal base image or an ADR amendment.
