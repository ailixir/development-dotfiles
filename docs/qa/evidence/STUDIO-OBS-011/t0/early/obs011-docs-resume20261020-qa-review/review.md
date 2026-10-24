# Independent QA review — OBS011 docs resumption

Decision: **BOUNDED_DOCS_ONLY_APPROVAL**. Mandatory findings: **none**. This is a documentation preparation review, not a story QA gate or lifecycle action.

Subject: `docs/qa/evidence/STUDIO-OBS-011/t0/early/obs011-docs-resume20261020`.
Subject manifest SHA-256: `ae80be1a412ecf1cb8d9a67a66c9d393445fc386087503a0008b7b1e6652746b`.
Subject combined patch SHA-256: `68ad0d10271138d3f295356c56f285d0cf66a75e3331f6d2cd286fe3e92b2e4e`.
Reviewed by Quinn under the aiox-qa skill; no delegation. Review time UTC: 2026-10-20T03:00:32.671652+00:00.

## Verification

Independently read the receipt, manifest, disposition, exact-path patches/previews and named public inputs. All16 manifest entries match SHA-256 and size. All25 listed source inputs match their sealed SHA-256 and size at this review. Used a separate strict unified-diff parser, without invoking prepare.py, to reconstruct all six previews in memory from current read-only exact base bytes. Hunk context/counts and target headers match; reconstruction equals each preview and its output hash. Combined patch equals the six per-target patches in disposition order. No shared target was written.

| Exact target | Base SHA-256 | Preview SHA-256 |
|---|---|---|
| `frontend/README.md` | `8fe7c5df748f855189d5feb065bd6f96e3c400f7595fe51eb3e15f7911faccb4` | `f861b9c2be33fb35c44c0c7058f51ed32bd8e21dc427838ee48e2218283336c8` |
| `CLAUDE.md` | `2c2bd08ad1b9ee4833b440a92d7479991069708870e90ab9e5a54a33258c23d1` | `46bca929926641ba1115900ee3bc002d82caaab6e199bd4a8ff5526682af23af` |
| `AGENTS.md` | `848e102c199e0497ce006528b25c71396c34ed7490f0b822569b000b9bf17d43` | `0e138e668bba36afd37dfdfd120ed7c35bdad42252899f9d0ef7e9bfa956f31c` |
| `ARCH.md` | `79a053edfc4dd9167baeea01358fda2ecde85c1abb042e366e3d2576f30d5c44` | `2224dc478cb4d3f848a90476c58f7b86a7f7f2635240615b56d60b9fb794ae99` |
| `studio-runner/README.md` | `1b8891f988234b4f8e875df644332e69ac2f57efe720a86af63878ef5ada92d2` | `4184d77764d72842d9bc4f5de5f39bafb491ea5f0987bead437b59e51f0bc9cd` |
| `docs/runbooks/studio-runner.md` | `8971ca6b0f5f08b3b35041abe960065d1b6f4fdf4e5fa3b9557a30dd9c16223b` | `d71303cd310a07e9e513eb30aade7207759544a91dc86a9f0d1e6312ea8f1cbe` |

## Factual assessment and scope

- **AC-6 historical header:** no-op is correct. The account/provider design already begins with the dated2026-10-09 SUPERSEDED banner linking secret-login-design.md; it explicitly makes R1-R3 non-normative history. The canonical secret-login design section0 confirms full supersession. Header source SHA-256 remains `d0eef1e85f6f754c98ed8e238c59ab96c21e8021ff0dae0b103282876d1540ca`.
- **CLN-50:** the obsolete fallback-variable bullet alone is removed. The inventory records its unused status, and the README already documents Node-only mocks. This introduces no configuration change.
- **CLN-51:** Node-side setupServer in frontend/src/services/mocks/studio/server.ts and the e2e/mswProxy.ts getResponse resolver support the replacement text. Playwright selects msw or real-backend. Vite proxies /api/v1 using VITE_API_URL with localhost:8080 default; Webpack uses REACT_APP_API_BASE_URL?.replace('/api','') with the same default. The replacement correctly distinguishes these keys. Browser worker paths remain absent. CLAUDE.md and AGENTS.md changed ranges agree; their complete Development Rules and later instructions are byte-preserved. ARCH's historical planned browser-interception sentence remains exact, followed by a dated current-implementation note.
- **C-OBS009-3/F1:** the current-use artifact-1 AST/language/reference/adversarial instructions and associated examples are removed. The retired language.ts and two corpus directories are absent. Current observed descriptions agree with observedOperations.ts, observedReplay.ts, observedReferencePolicy.ts, observedReplayAdapter.ts, routes.ts and runCoordinator.ts. The source defines inputs/secrets/secretOrigins and execution binding; submitObserved validates trusted policy/build before capacity and admission; evidence settlement precedes scratch clearing/value wiping and final report. Routes are /v2/validate-observed, /v2/runs, DELETE /v2/runs/{id}, /health and /ready, with peer pin before bearer and controller-or-self health audience. The pure publication endpoint re-derives the artifact/replay policy from its original basis; current trusted-policy/grant validation belongs to replay-job admission. Neither is runtime proof. The explicit dependency allowlist includes the S3 SDK closure.
- **C-OBS009-3/F2:** chart source confirms scratch and memory /dev/shm, conditional writable local-object-store, and guided /tmp plus journal mounts; TLS/trust/guided credential mounts are read-only. NetworkPolicy selects both API and worker ingress on runner service port, ordinary backend.service.port callback egress and a conditional guided.tlsConnector.port. Observed job binding scope/scopeHash/currentPolicyHash/replayGrant exists, and validateObservedJob compares artifact, trusted policy, grant joins and lifetime before admission. The replacement removes a stale absence claim without changing authorization. Bounded notes correctly retain deployment/enforcement and full-audit limitations.
- **History:** both dated runbook audit rows remain exact; the entire historical section12, including superseded12(e), is byte-preserved. The new dated notes identify the limited correction. Historical evidence, stories and lifecycle were not edited.
- **010 and lean scope:** exact patch targets exclude docs/runbooks/studio-guided-authoring.md and all010/source08 packets. No source, contract, generated output, test, runtime, accessibility, skill or governance-policy change occurs. The current lean story section and named lean plan preserve deferred work and required baseline/final gates. The saved plan's paused status is historical context; this review grants no resumption or runtime authority. Lean-plan SHA-256: `b92b082d22f81f16c20393974c535541fb448eb74429c6ae3970f07a85dc5b8d`.

## Retained conditions

1. Approval is limited to the sealed six exact-target documentation previews/patches and the existing account/provider-header no-op; no story gate, AC completion, lifecycle transition or baseline credit.
2. Root retains integration ownership after resource/source release; recheck exact base hashes before any future application. This review did not apply patches or release a source/resource window.
3. C-OBS009-3/F2 remains PARTIAL: full runbook sections1-3 and5-13 audit is owed to dev with devops; the narrow factual source recheck does not complete it.
4. Preserve historical audit rows, ARCH plan text, superseded section12(e), account/provider R1-R3 history and all sealed packets; do not infer current authority from historical statements.
5. Keep section14 external prerequisites and unmeasured limits open, including cluster/CNI/SPK-05 and G-4 enforcement/sizing, image/Docker proof, PKCS12/JDK/cert-manager provisioning and credentials; no deployment or runtime proof follows.
6. Fresh required backend check --rerun-tasks plus JaCoCo before011 credit and full affected final T5 suites remain owed. Existing original tests/assertions/skips/timeouts and010 Live surface remain protected.
7. Lean-deferred C-OBS008-2 Javadoc and C-OBS008-3 narrative extraction remain deferred; C8/GST auxiliary infrastructure stays parked; AC-5 and TEST-001 remain required.
8. No source/behavior/accessibility/skill/governance scope expansion, staging, commit, push, deployment, signal, held-resource cleanup or runtime authority is granted. Shared wave ceiling USD500 remains; actual aggregate spend is unavailable.

## Execution limits

Read-only filesystem/source inspection and in-memory reconstruction only. No project tests, builds, runtime, network, private captures, protected baseline/current runtime bodies, C5/C212 access, source-window operation, patch application or actual-resource operations. The review writes only this new review directory. No automated review command or formal story gate workflow was run because the delegated scope expressly limits execution to this static documentation review.
