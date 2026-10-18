# R4 checkpoint commits: receipt

- **Author:** Gage (@devops), YOLO. **Date:** 2026-10-18. **Branch:** `brunobuger/ui-studio`. **Base:** `734ad704f`.
- **Authority:** user authorized LOCAL commits only (`w0/decisions.md`, "R4 checkpoint commit + 011 Docker"). **No push, no PR.** Nothing was pushed.
- **Method:** stage by explicit path only (`GIT_LITERAL_PATHSPECS=1 git add --pathspec-from-file`, NUL-separated). No `git add -A` or `.`. No stash, no history rewrite, no `--no-verify`.
- **Hooks:** no repository hooks exist (`.git/hooks` has samples only, `core.hooksPath` unset, no `.husky`). Nothing ran at commit time.
- **Legend:** every number below was read from the commands I ran today (`git show --no-renames --stat`, `git status`, a file walk of the untracked set).

## Commits

| # | SHA | Subject | Files |
|---|---|---|---|
| 1 | `f075dc085` | chore(framework): update agent memory and project rules | 138 |
| 2 | `3c781f84e` | feat(studio): backend for observed single-path authoring, TLS dispatch and replay governance | 575 |
| 3 | `b45ea4a69` | feat(studio): runner for observed authoring, guided browser and evaluation harness | 469 |
| 4 | `6c2138c60` | feat(studio): observed-authoring contracts, schemas and contract tooling | 145 |
| 5 | `26a12ee3e` | feat(chart): guided TLS network policy, observed-replay config and deployment tier | 19 |
| 6 | `61dfa9572` | feat(studio): single-path Studio UI, guided recording playback and pnpm migration | 188 |
| 7 | `4f9e451a0` | docs(studio): stories, gates, evidence, architecture and .ai records for the OBS-007..015 wave | 7818 |
| 8 | (this receipt) | docs(qa): R4 commits receipt | 1 |

File counts are `--no-renames` counts. With rename detection on, commits 2 and 3 show 557 and 468 entries.

## Placement notes

- `ReplayAccountAccess.java` (tracked deletion) and `backend/db/cutover/V19__studio_inference_candidate_identity.sql` (tracked deletion) are in commit 2.
- `helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml` is in commit 5, with `studio-runner/test/deployment/*` (6 modified, `dump-settings.test.ts` and `tls-client-cert.test.ts` new). Per the plan, the deployment tests go with the chart, not the runner.
- Commit 6 carries, by name, the 6 untracked files that `guidedNarratives.ts` `COPY_SOURCE_FILES` quotes and the copy-table test reads: `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md` and five `docs/qa/evidence/STUDIO-OBS-008/` files (`prep-20261016/t0-rulings/ruling.md`, `prep-20261016/implementation-plan.md`, `execution-20261015/ux-implementation-plan.json`, `execution-20261015/architect-rulings.json`, `execution-20261017/rulings/w5-unreadable-and-alias.md`). The other 9 sources it reads were already tracked or are in the same commit (`useGuidedSession.ts`). Also in commit 6: `frontend/pnpm-lock.yaml`, `frontend/.npmrc` (content: `node-linker=hoisted`), deletion of `frontend/package-lock.json`.
- Commit 1 also holds the 126 new `.claude/agent-memory/**` files, `.claude/rules/accessibility-scope.md` and `.cursor/rules/development.mdc`.
- Commit 7 holds `.ai/` (10 entries), 7 QA gates, 12 stories, `docs/qa/accessibility`, root docs, `dev.sh` (pnpm and gateway-provider default; it is a root script with no category of its own), `docs/presentations/checks-product-stakeholder-briefing.html`, and curated evidence (7760 files).
- Not staged anywhere: `.aiox-core/core/permissions/dispatch-governance.js` (still ` M`, as instructed).

## Secret scan (before any staging)

Walked 8897 candidate files (all modified/deleted tracked files plus the filtered untracked set) for private keys, certificates, GitHub/AWS/Slack/Google/OpenAI-style tokens, JWTs, bearer tokens, URL credentials, `password|secret|api_key|token = "<literal>"` assignments, and file names `.env*`, `*.pem`, `*.key`, `*.p12`, `*.jks`, `*.pfx`, `*.keystore`, `*.crt`, `*.npmrc`.

**Real secrets found: none.** No file was excluded for a secret. Every hit is test material:

| Hit | File | Verdict |
|---|---|---|
| `-----BEGIN PRIVATE KEY-----` | `backend/src/test/java/.../guided/translation/GuidedGatewayPrivacyTest.java` | Key is generated at test time (`KeyPairGenerator`); no static key |
| `-----BEGIN PRIVATE KEY-----` | `studio-runner/test/server/guidedMode.test.ts` | Canary string `CANARY-5f0c2d` written to a temp file to prove the runner refuses it |
| `-----BEGIN CERTIFICATE-----` | `studio-runner/test/server/tlsListener.test.ts` | Self-signed cert built in the test with `der()` helpers |
| `https://user:secret@example.test`, `https://svc:secret@api.internal.example` | `GuidedSourceReferenceValidatorTest.java`, `studio-runner/test/isolation.test.ts` | Fixture URLs on reserved test hosts |
| `Bearer aaaa...` | `studio-runner/test/server/routes.test.ts` | Placeholder token |
| `password = 'secret-login-planted-canary'`, `SECRET = 'Canary-...'`, `'planted-selftest-password-5521'`, `P3-EXPECTED-`, `B2B-SECRET-` | runner and backend tests, frontend `guided.test.tsx`, 007/009/015 evidence copies | Planted canaries for leak tests |

- **TLS fixtures:** no static key or certificate file is committed. The three TLS-related fixtures above are generated at runtime or are canaries.
- **Ignored, not committed (by `.gitignore`):** `.aiox/sdc/STUDIO-OBS-006/**/joined/{tls.key,tls.p12,trust.p12}` (9 files, under ignored `.aiox/`), `.env`, `*.key`, `*.log`, `*.tar.gz`, `node_modules`, `backend/build`, `backend/.gradle`. I did not read these. They stay out because of the existing ignore rules.

## Left out, and why

`git status --short` after commit 7 shows ` M .aiox-core/core/permissions/dispatch-governance.js` and untracked entries only. The untracked entries are deliberate exclusions:

| Left out | Count | Size | Reason |
|---|---|---|---|
| `docs/qa/evidence/**/execution/` collector directories (gradle `*-task-outputs`, JUnit XML, jacoco, html reports) | 80146 | ~4.1 GB | Build and collector output. Reproducible from the commands recorded in the committed receipts |
| `runner-final-fixtures0{1,5,6,7}-artifact-before` and `-after` (copies of fixture trees) | 13 036 | 408 MB | Copies of tracked fixtures |
| `reports/` (jacoco, checkstyle HTML) | 3929 | 56 MB | Build output |
| `frozen/` (compiled `.class` snapshots), other `.class` | 1347 | 12 MB | Binaries |
| `c8-jacoco`, `c8-test-results`, `c8t-test-results`, `*-xml`, `*-test-results` | ~1470 | 123 MB | Test and coverage output |
| `.java` source snapshots inside evidence | 1016 | 241 MB | Copies of backend sources and proof variants; the real sources are in commit 2 |
| JUnit `.xml` inside evidence | 806 | 57 MB | Test output |
| `.zip`, `.tgz`, `.gz`, `.webm`, `.html` and `.orig` inside evidence | 257 | 709 MB | Archives, media, HTML reports, merge leftovers |
| Evidence files over 5 MB that I would otherwise have added | 5 | 100 MB | See below |
| `backend/.claude/agent-memory/aiox-dev/*` (3), `studio-runner/.claude/agent-memory/aiox-qa/*` (2), `docs/specs/.../contracts/v3/.claude/agent-memory/aiox-architect/*` (2) | 7 | <0.1 MB | Tool metadata written under the wrong working directory; the root `.claude/agent-memory` is committed |
| `studio-runner/short.webm` | 1 | 4 B | Stray scratch file (devops co-sign D-5) |

Total left on disk, untracked: about 102 000 files, about 5.8 GB. Nothing was deleted. They can be added later by a narrower rule if a reviewer needs one.

### Files over 5 MB

Across the whole untracked tree there are 66 files over 5 MB. 61 sit in collector or build-output paths (jacoco `test.exec` up to 26 MB, `prior-backend-build-outputs-final01.tgz` 61 MB, `GuidedPublicationReplayIT` HTML and XML reports up to 34 MB) and were excluded with them. The other 5 are evidence snapshots of one spec file, excluded on size:

| MB | Path (all under `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/contracts/`) |
|---|---|
| 12.1 | `correction-02-03/before/docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` |
| 22.4 | `correction-05-packaged-reference-01/before/.../publication-fixtures.json` |
| 22.4 | `correction-05/after/.../publication-fixtures.json` |
| 21.0 | `correction-05/before/.../publication-fixtures.json` |
| 22.4 | `current-vector-preservation-implementation/before/.../publication-fixtures.json` |

Largest file that was added: 4.7 MB (`correction-01/before/.../publication-fixtures.json`). Commit 7 adds about 314 MB of text (3.99 M inserted lines). It compresses well, but it is still the heavy commit; that is a point for the push review.

## Open items for the next step

- **Push:** not done and not authorized. When it is, the pre-push gate must look at the size of commit 7 and decide whether the 314 MB of evidence belongs on the remote.
- **011 W1** can now start from `4f9e451a0` (plus this receipt commit). The mixed 009/011 hunk problem (co-sign X-10) is closed for the files above.
- **Not run:** no tests, build, lint or CodeRabbit (the brief forbids them at this step). The commits are a checkpoint of the working tree, not a verification of it.
- **Skill texts** attached to the dispatch (`synapse:*`, `coderabbit-review`, `checklist-runner`): [AUTO-DECISION] not run (reason: unrelated to a commit-only mission; CodeRabbit is a pre-push step and push is out of scope).
