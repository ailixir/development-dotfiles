---
name: studio-runner-node-pins
description: Why studio-runner's dev dependency pins are held back — Node 23 on this machine plus engine-strict=true makes newer transitive deps unresolvable
metadata:
  type: project
---

`studio-runner/` sets `engine-strict=true` in `.npmrc` (mandated by ADR-001 §4.1), which makes npm
enforce the `engines` field of **every transitive dependency**, not just the package's own. The
development machine runs Node **v23.10.0** — an odd-numbered, non-LTS release that a growing share
of the ecosystem excludes from its `engines` ranges.

Concrete consequences observed on 2026-09-10 while scaffolding the package:

- `vitest@4.x` requires `^20 || ^22 || >=24` → install fails. Pinned to `vitest`/`@vitest/coverage-v8` **3.2.7**.
- `typescript-eslint@8.60+` pulls `eslint-visitor-keys@5`, which requires `^20.19 || ^22.13 || >=24` → install fails. Pinned to **8.50.0** (last release on `eslint-visitor-keys@^4.2.1`).
- npm 11.3.0's arborist also crashes (`Cannot read properties of null (reading 'edgesOut')`) on vitest 4's circular optional-peer graph, independently of engines.
- Homebrew's `/opt/homebrew/opt/node@22/bin/node` is a trap: it reports **v23.10.0**. There is no real Node 22 on this machine.

`engines.node` in `studio-runner/package.json` is therefore a range (`>=22.11.0 <25.0.0`) rather than
ADR-001's literal `<major>.x`; `.nvmrc` still pins the image's Node major (22).

**Why:** so a developer can install and run the package locally without the runner's own engines
field rejecting their Node, while `engine-strict` still guards the real floor.

**How to apply:** before bumping any `studio-runner` dev dependency, check the new version's
`engines` (and its transitive ones) against Node 23, or the bump will fail at `npm install` with
`EBADENGINE` rather than at test time. If the machine ever gets a real Node 22 or 24 LTS, most of
these hold-backs can be lifted — re-verify rather than assuming they still apply.
