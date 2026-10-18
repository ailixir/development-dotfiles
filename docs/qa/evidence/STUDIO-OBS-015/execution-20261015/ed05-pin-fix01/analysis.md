# ED-05 Node pin fix: analysis

Gage (@devops) did this read-only on 2026-10-16. Root saved it because the harness blocks subagents from writing report files. Patch: `fix.patch`, sha256 `bf9176ff3abe646461ac9f1a071d39c774674cb5b666243f9585bcdfb1229e21`. `git apply --check` passes. The patch has not been applied.

User decision: fix the pin inside 015 rather than accept it as external.

## Recommendation: (a) move the pins to Node 24
- ADR-001 §3:67 says `.nvmrc` is the "Node major shipped by the pinned Playwright image".
- The image `mcr.microsoft.com/playwright:v1.63.0-noble` ships Node v24.20.0. Evidence: `final-gates01/image-final01-runtime-versions.json`.
- The Dockerfile has no Node install step, so the deployed runtime does not change.
- No dependency requires Node 22.
- (b), a Node 22 image, is declined. It would need a custom base that Platform/SRE maintains, and it would change the runtime the gate already validated.

## Patch: 9 files
- `studio-runner/.nvmrc`: 22 becomes 24.
- `package.json` and `package-lock.json` `engines.node`: `>=22.11.0 <25.0.0` becomes `>=24.11.0 <25.0.0`. No dependency changes and no install.
- Tests:
  - `confinement.test.ts`: the AC-23 guard is updated.
  - `pins.test.ts`: the in-image cases are inverted and extended.
  - `runtime-versions.test.ts`: v22.13.0 becomes v24.20.0.
- `README.md` and `ci/stages.md`: the conflict is marked RESOLVED.
- ADR-001 §4.2: an amendment saying `.nvmrc` follows the image.
- Unchanged: Dockerfile, `check-pins.mjs`, `write-runtime-versions.mjs`, helm, backend, frontend and tools.
- `@types/node` 22.20.2 is a separate follow-up, because changing it would rewrite the lockfile.

## Risks
- The host default Node is 23.10.0 (Homebrew). Every runner host gate must now run on fnm Node 24.20.0: `N24=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin`, with `PATH=$N24:$PATH`.
- Host results from runs on 23.10 cannot be carried forward.
- The external pipeline's Node version must also be set to 24, by @devops outside the repo.

## Re-verification order (not yet run)
1. `node scripts/write-runtime-versions.mjs`. Diff the other dist files against the frozen dist.
2. `node scripts/check-pins.mjs`, expected exit 0.
3. vitest on pins, runtime-versions and confinement.
4. tsc and eslint.
5. The full runner unit and fixtures tiers on N24, runbook steps s03c and s04c.
6. Image build with a new tag (s05a).
7. In-image `check-pins --require-image` (s05c): exit 0, v24.20.0, pin "24".
8. Dist parity (s05b).
9. Deployment tier (s05d).
10. Backend lanes that read the dist, then the full check under the gate rule.

## Still open after the fix
ED-05 as a whole stays open: the internal image, non-root user, seccomp and CA bundle belong to Platform/SRE. Only the O-2a Node-pin part is resolved.

Docs that still state the old conflict, for @po and @qa to update afterwards:
- `UI-STUDIO-GA-PLAN.md:83`
- `EPIC-10-RUN-LOG.md:165`
- `staging-acceptance-register.md:135,190`
- `SPK-04/README.md:45,76`
