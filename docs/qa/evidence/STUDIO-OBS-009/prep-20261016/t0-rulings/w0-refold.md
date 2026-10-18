# STUDIO-OBS-009 W0 refold — summary (2026-10-17)

- **Author:** Aria (@architect). **Full record:** `../implementation-plan.md` section "W0 refold 2026-10-17" and `../lanes.json` → `w0Refold20261017` (both append-only; prefixes re-hashed equal to the pre-append sha256 in `manifest.json`). Rulings: `ruling.md`.
- **Assumption:** every 009 source lane starts after 008 Done. Only docs lanes run beside 008 W3–W5.
- **No source edited.** No build, test, install, database, Docker or git write.

## Baseline that changed since 2026-10-16

- Head V22 → 009 migrations V23+ (none planned by default). OpenAPI `b5ecdcad…`, 44 ops; pins at `StudioContractTest.java:89-91` and `confinement.test.ts:293-294` (root's anchors were stale).
- Frontend on pnpm; runner still npm-locked (pnpm with `--config.package-manager-strict=false`, no installs); N24 everywhere for runner and backend; `dist` `897182d5…` unchanged since the 015 close.
- 015 already landed REL-001 diagnostics and the D4 12 s start bound → dropped from lanes O and R2.

## Waves

| Wave | Lanes |
|---|---|
| NOW | T0-AR (this), T0-QA, T0-PO, T2-SK (optional); root sends the U13 request |
| W0 | root re-baseline + collector copies; QA approved-skips |
| W1 | C9 ∥ D1.0 ∥ D3.0 ∥ I.0 ∥ PR-RT (D5 probe) ∥ PR-BE (R1, ADJ-1 probes) |
| W1.5 | Aria: D5, C1, R1 go/no-go |
| W2 | D1, D2, D3, P2, R1, R2, O-FM, S, B, BL, DE, I (12, file-disjoint) |
| F-merge | one `dist` rebuild; D1+I+D3, P2+B, R1+B atomic; ReplayIT I→S |
| W3 | S-W3, B-W3, F, O-FM-W3, EP (opt.), O-AE + C9-AE (after U13), FE9 (after O-AE) |
| W5 | G9 gates → QA local-validation record |
| then | 010 T2 → 011 T0 |

Write-overlap check: **0** in every group (NOW 0, W0 0, W1 0, W1.5 0, W2 0, F-merge 0, W3 0, W5 0); NOW vs live 008 W3–W5 sets **0**. The self-test flags 2 overlaps when O-AE is moved into W2.

## New finding that needs root

- **A2.6 owner routing.** The backend addresses one runner origin and one worker id (`worker-1`), sessions live in one process's memory, and the runner Deployment has 2 static replicas. 009 rule: guided-enabled ⇒ exactly one replica (chart guard); scale-out goes to GA G-4. Root decision R1.

## Triggers

- **010 T2:** G9 exit (QA local-validation record over AC-1–6, AC-11 incl. R1/D5/LR, AC-12 f–j).
- **011 start:** G9 exit plus the dated Live surface list. TF-3, FM-01, AE-01, EDGE, PID-1 and the two classification rules do not count.

## Root decisions (ruling.md §6)

R1 single-replica guided topology · R2 `execute-009` collector copies (pnpm build, vitest detection) · R3 source-hold policy · R4 checkpoint 008-Done tree · R6 send U13 now · R7 cap W2 agents. User batch: ruling.md §5.
