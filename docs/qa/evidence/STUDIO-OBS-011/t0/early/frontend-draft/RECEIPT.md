# 11-FE draft receipt

Prepared by Dex, 2026-10-19T01:43:35.918892+00:00. **Unapplied draft only.** No QA/lifecycle/exit-success verdict. All writes are under this frontend-draft directory; actual frontend source, dist, quoted docs and axe output remain unchanged. Budget declared USD500; actual spend unavailable.

The complete package has **11 full repo-shaped files: 10 existing-file edits and one new test-only registry**. `copy-back-manifest.json` is the exact candidate copy list, with original/draft/patch hashes. `frontend-draft.patch` combines all11 files; individual patches are under `patches/`. `required-barrel-companion.patch` is a duplicate convenience view of the root-approved index patch, not an extra copy target. v4 governs all original scope; v5 SHA256 `5a6984fe988ef75392dfe152be8a8b1509ea3a6ef782e69c8edf17e268149cc2` permits exactly four removed metadata re-export lines in index.ts. The new file name is `guidedCopySources.test-support.ts`.

Changes: delete CLN-07 dead interface/comment; correct C-OBS008-5 secretId-only mirror matching/comment and add a name-only negative plus real-secretId positive control; split runtime templates from test-only citation metadata; delete the approved R-11 pair/two pins and unused fixture import; delete CLN-50 README bullet; apply exactly the approved R-CO label and single assertion. The audit deletion reason is **duplicate pair, unlearned state no longer scanned, accepted under ADR-SC-006**. Existing focus, visible labels, responsive layout and other audit surfaces remain untouched.

Static evidence:

- TypeScript5 parser, syntax-only: zero parse diagnostics. No createProgram, semantic type-check, emit or product execution. `ast-static-evidence.json` compares every template token and metadata property expression independently through parsed object literals.
- **78 ordered keys and every template literal token byte unchanged.** All basis/source/note/facts property token bytes unchanged in the registry; runtime entries have only template. `templates-before.json` and `templates-after.json` are byte-identical, SHA256 `7c2b3a13b46e1997a44ce0bc867353c786868f9771802fd186419ad0b9b5a92c`.
- **182 generated source-table rows unchanged by name, plus the three original static checks =185 original copy-table cases.** One registry/runtime key-set check is added (expected group186). The AST name audit and test-drop-addition-map record two named audit drops and three named additions overall, expected frontend total delta+1 if no other changes. B7 per-name runtime reconciliation remains owed; no actual Vitest totals are claimed.
- Individual and combined `patch --dry-run` applicability succeeded without applying a patch. All ten existing target hashes equal S_011. The new registry is absent from actual frontend. **All319 frontend files recorded in start-capture.json still equal their S_011 hashes.** The approved index patch removes exactly four lines and retains every runtime export. `final-static-verification.json` records input and source hashes.
- The overlaid source scan finds exactly one direct registry importer: guided.test.tsx. Runtime guidedNarratives has no evidence paths. This is source evidence only; built bundle exclusion remains unverified.

Copy-back is gated. Before applying to a sandbox, root must reconcile original B1, finish fresh B7, sign tree-open, seed a repo-shaped sandbox using the bound T0-DEV copy list, and secure independent draft review and a quiet runtime window. Recheck original hashes; apply only manifest entries. Run validation-plan.json commands from the sandbox frontend with host Node/pnpm, preserve logs/JSON/hash/exit evidence, compare named tests with B7, and inspect the actual production bundle for all source-path literals. Root owns actual MERGE and real axe regeneration. Never copy back node_modules, dist or generated sandbox output. The existing frontend collector requires capture support outside the current sandbox list; validation-plan.json explicitly records this portability constraint instead of silently running against live source.

Remaining constraints: semantic type-check, lint, all tests, build/bundle proof, sandbox exit and actual merge remain **UNVERIFIED**. C-OBS008-5 optional authoring refusal part e is carried with @dev; authoringHandlers.ts is unchanged. U13 and AE-01 remain open. authoredLiteralTargetNotFound is retained at runtime and in metadata until the separate AE-01 owner removes both together. useGuidedSession.ts, package/lock files, entry points, contracts/pins and axe output have no draft changes. No git mutation, formatter, package install, Gradle, Docker, provider call or process signal was performed.

`DESIGN.md` predates draft generation. Reproducible static tooling: generate_drafts.py (text transforms and patch dry-runs), parse-drafts.cjs (TypeScript parse only), verify-static.py (hashes, imported-source scan and combined patch dry-run). Runtime validation must not be inferred from these scripts.

| Path | Draft SHA256 |
|---|---|
| `frontend/src/components/studio/guided/guidedCopySources.test-support.ts` | `33c8ca8101eaab3f35b72a448c86d510f1d6dae51621f2afc7f56b2c423aa9ab` |
| `frontend/src/components/studio/guided/guidedNarratives.ts` | `185c8dbe75ee7c3ab3116eb8577d105b8ef0cfadd4ae819f589fe21a3b4d70ff` |
| `frontend/src/components/studio/guided/guided.test.tsx` | `77e20569d6f8ca6de975d0facea5928af841f8e6f85bb5879a5cc6196c6be54d` |
| `frontend/src/components/studio/evidence/pinnedVideoEvidenceFacts.ts` | `a84d582bf96493541c8af966deb8e23acce6acc7957832fb309b7ed06c29d356` |
| `frontend/src/services/mocks/studio/handlers.ts` | `bac98cf15ad693010c80aeed31e9d169c7ed366e1444db07b280ecabce941192` |
| `frontend/src/services/mocks/studio/studioHandlers.test.ts` | `c152b97463de92b0d1239a35255b60946a7bcce1f8887e0137cabb30d231ad5d` |
| `frontend/src/test/a11y/studioWcagAudit.test.tsx` | `c0a79b37d84cec9a84bab9c54b4034a2a1805b81dbd199c85d556b7174898345` |
| `frontend/README.md` | `f861b9c2be33fb35c44c0c7058f51ed32bd8e21dc427838ee48e2218283336c8` |
| `frontend/src/components/studio/runs/RunDetailsDrawer.tsx` | `932d40e0a32a9bad7a10509e5fb621b84998295937a9a47b2c8f3a6c4cc2b456` |
| `frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx` | `b058c43309e5e3007e2e8b8159e4ed95e3bc91f92b4f9aee7410813681fec135` |
| `frontend/src/components/studio/guided/index.ts` | `e59d1199b522181b8fcd71d08a9485f4ea740a650a9e2c7988557a3c9d34988a` |

Combined patch SHA256: `ae8acae1ae377ab6196572a3a6d4a6cefdb45885c8a16b63da97f4cc5af675e0`.
