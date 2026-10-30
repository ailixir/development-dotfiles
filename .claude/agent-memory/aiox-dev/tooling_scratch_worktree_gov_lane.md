---
name: tooling-scratch-worktree-gov-lane
description: Git-worktree scratch lane recipes (STUDIO-GOV-001.2): frontend has no node_modules/.bin, vitest pool flags, Gradle toolchain JDK, relative mkdir lands inside the worktree
metadata:
  type: project
---

From STUDIO-GOV-001.2 (2026-10-24), working in `scratchpad/wt-sched` (a git worktree of the dirty main tree):

- `frontend/node_modules` there has no `.bin`, so `pnpm exec tsc|vitest|eslint` fails ("not found"). Run `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <files>`. `@put/core-components` type errors are pre-existing (package absent).
- Vitest: `--maxWorkers=3` crashes ("minThreads and maxThreads must not conflict"); use `--poolOptions.threads.maxThreads=3 --poolOptions.threads.minThreads=1`. The six-file affected set took about 2.5 min, the full suite longer.
- zsh does not word-split `$FILES`; feed eslint with `xargs` from a file list.
- Backend: system `java` is 11 but Gradle's toolchain picks JDK 21 by itself; `./gradlew --offline test --tests 'FQCN' -x verifyRunnerDist -q` works in the worktree. Embedded-Postgres (`local` profile, Zonky) ITs need no Docker; `SharedSchedulingIT` needs Docker (it was available).
- `@ActiveProfiles("local")` ITs need `@TestPropertySource(properties="checks.local-dev-auth.enabled=false")` to test authorization (otherwise LocalDevAuthFilter injects an admin), and a fresh `put_session` cookie per caller (the identity is cached per cookie).
- ShedLock `cronDispatcher` has `lockAtLeastFor=10s`: a second dispatcher pass in one test needs `UPDATE shedlock SET lock_until=now()-interval '1 second'` first.
- The worktree baseline contained uncommitted STUDIO-UNIFY-001.6 openapi work (`readLatestGuidedAttempts`) that was NOT yet pinned (StudioContractTest 44, BASE_SHA256 at the committed digest). Any contract edit there has to fold that op into the pins or the contract tests are red for a reason that is not yours.
- A relative `mkdir -p ../x` from `backend/` created `wt-sched/x` INSIDE the repo worktree (untracked noise in the diff). Use absolute scratchpad paths.
- Hibernate `ddl-auto: validate`: adding an entity column breaks every test that migrates Flyway only to an older `target("N")`; bump all head-pinned `.target("23")` / `max(version)==23` assertions together with a new migration.

**How to apply:** any scratch-worktree lane touching Flyway, openapi pins or the frontend toolchain. Related: [[tooling-scratch-gradle-stale-dist-and-cold-cap]], [[tooling-fe-full-suite-under-load]].
