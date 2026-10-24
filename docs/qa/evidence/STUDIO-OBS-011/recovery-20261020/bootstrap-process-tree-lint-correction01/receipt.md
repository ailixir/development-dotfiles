# V2 source-only lint correction receipt

**All23 findings mapped to four staged corrections; validation UNEXECUTED.** Exactly three test-tier paths are mirrored under this new packet. No old packet, actual/private runtime source, lint rule/config/dependency, story/status or QA verdict changed. No candidate parser/compiler/test/probe/signal/seed/native/build operation ran. Stop for independent v2source QA.

| Path | V1 green SHA256 | V2 green SHA256 |
|---|---|---|
| `studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts` | `187a2460cd61f38dbbaeab6b4d571f6a2fa9b1a644f6e6e2c5836397566285b8` | `f4cc9fb3be55dad91daa30e2d169e9d1d872a8be4a4901649d61c681cf858eba` |
| `studio-runner/test/helpers/bootstrapProcessTreeObservation.ts` | `8cb01289c3b77a501facf1f1763b8ec436cdd07add3ce6b1c461fd47d318d626` | `b15b569f43c40f2461d8f5c1604a3243f4ea837a40e04fc0e2e576abecc8a5a1` |
| `studio-runner/test/run/bootstrapProcessTreeObservation.test.ts` | `dbcaac71e28b282c0cd4d1cea213fb9994832cd5be3108dc3f30f62cb43968d8` | `775ee841b73fa4a3a78fc0bd27a419d1ec97b7cec6b8e7bf38863c4eb24fc181` |

V2OLD helper SHA256 `7058cc1a9640eac6d10cab3989159fd905394a72645c583bb99a05b819679faa`. Same four-function API and same fixture/unit across v2red/green; helper differs only in capture acquisition. Original proof spec432565fb…/37literal names remains exact. Future primary postcondition is line54; old executed52 remains unaltered historical proof.

Corrections: typed mutable failure state preserves real fail-closed catch/await/guard and synchronous cancellation; explicit ASCII predicate is equivalent to the old0..31/127 regex; four String conversions preserve numeric table bytes;17 unbound references use the same typed stored spy, retaining every fake call/assertion and afterEach restore. No added suppression or softened condition. Full normalization restores v1 bytes, and all original15 native assertions/six cases/timers/strict SIGSTOP/complete inventory/finally remain. These are source-text/equivalence arguments, not a parser, lint or type pass.

[complete-findings-before-fix.json](complete-findings-before-fix.json) records the inventory before editing. [complete-resolution-notes.json](complete-resolution-notes.json) maps each23site to FIXED_IN_CANDIDATE_UNEXECUTED; the original lint gate remains FAIL. [normalization-and-equivalence-proof.json](normalization-and-equivalence-proof.json) states the bounded proof. Forward/inverse patches include v1→v2, original actual7b→v2, v2OLD overlay and helper-only green. The actual helper/unit before-state remains ABSENT.

[future-v2-proof-plan.json](future-v2-proof-plan.json) gives an UNEXECUTED lint-old-first/types-old/one-oldRED/helper-only37GREEN/types-green/lint-green sequence in existing proof01, after independent QA/root release. No fresh seed/product rebuild/AST matrix/full2676 repeat is needed only while exact product/source/dependency/browser/E19 equivalence holds. V1 genuineRED/37GREEN/types0 and failedlint1 remain sealed; no original result is erased or reused as v2execution.

Current private proof01 remains v1green187/8cb/dbca, complete product238E19 unchanged; actual fixture remains7b/newpathsABSENT and complete238D698 unchanged. The source-only boundary is hash-bound. Apply-qa-fixes skill/SOT and explicit staging overrides are recorded. FileList/DevAgentRecord notes wait for future authorized actual application; QAResults/status/Done are untouched. No self-approval, native/application/lifecycleGO, extra Replay slot or clock reset is claimed.
