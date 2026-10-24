# Engineering documentation — independent architecture review

Aria / aiox-architect, 2026-10-19. **The scoped package is substantially consistent, but its CLN-51 Webpack wording needs correction. The runner README also needs the bounded same-file disposition below before its active retired-engine descriptions can be treated as resolved.** No source/doc author correction, plan/story change or runtime operation was performed. Only this review directory was written; the separately locked live diagnostic unit was untouched. Static advice is not W1, deployment, release, lane-exit or story/QA approval.

Reviewed all seven original/preview targets and exact patches, source references and unresolved facts against current sources, AGENTS.md, root state, v7's adoption of v6/v5/v4 and actual CLN-49/CLN-51/C-OBS009-3 meanings. Independent in-memory reconstruction, hashes and protected-range checks are in `independent-static.json`. No author helper, Node/compiler/test/build/formatter/Helm/Docker/provider process or Git operation was executed.

## EDOC-R1 — exact Webpack transform wording

The proposed CLAUDE/AGENTS Mock-First text is byte-identical and correctly distinguishes Node-only MSW, the Vitest server, Playwright msw-project proxy and backend-connected development servers. Vite's target is indeed `env.VITE_API_URL || 'http://localhost:8080'`. Active Webpack reads `REACT_APP_API_BASE_URL`; it does **not** perform suffix removal. `frontend/webpack.config.js:132` executes:

`process.env.REACT_APP_API_BASE_URL?.replace('/api', '') || 'http://localhost:8080'`

That literal string replacement removes the first `/api` substring wherever it occurs. Calling it a “/api suffix removed” operation is inaccurate; the current `.env.development` value even ends `/api/v1`. This review does not propose fixing Webpack or infer a tested proxy defect. **Correct only the three proposed prose targets** (matching CLAUDE/AGENTS and ARCH's current mechanism paragraph): say Webpack derives its proxy target from REACT_APP_API_BASE_URL using the literal existing transform, or simply name the variable and qualify that its target follows webpack.config.js. Describe localhost:8080 as the unset/empty fallback, not a guarantee about arbitrary configured paths.

Keep VITE_API_URL (proxy target) distinct from VITE_API_BASE_URL (browser API base) and REACT_APP_API_BASE_URL. No browser MSW enablement flag exists. Keep the two CLN-51 ranges identical; preserve functional-only accessibility. The new inventory addendum can use the same precise short description for consistency. Its existing “with /api removed” wording is less specific than the erroneous suffix claim; it must not be used as proof of normalization beyond the code.

`unresolved-facts.json` EDOC-01 is also stale relative to the actual preview: the preview already names both frontend variables. Update the author receipt/disposition when correcting R1 rather than leave a claim that only VITE_API_URL is named. Root can confirm the corrected source-qualified wording without another product decision.

## EDOC-R2 — bounded runner README scope disposition

The required named artifact-1 sections and both validateArtifact mentions are removed in the preview. However, the current README opens by saying it documents what ships **today**; story-number headings alone do not turn its live operational instructions into dated history. Several retained statements still describe the deleted engine. Merely naming them in unresolved facts does not make them true or constitute a co-ratified carry of the old runtime.

The deletion also introduces a direct local inconsistency: the Routes table now has three rows, immediately followed by “All four require…”. Actual `src/server/routes.ts:3–14,206–228` defines the five ordinary routes: POST /v2/validate-observed, POST /v2/runs, DELETE /v2/runs/{id}, GET /health and GET /ready; optional guided routes have their own transport. The V1 validate/run/cancel routes are explicitly deleted there. This count/route description needs a text correction with the table change even under the narrowest existing scope.

**Recommend root explicitly adopt one bounded amendment to the already owned README patch**, authored by Dex and source-co-reviewed with the runbook/DevOps owner as needed, still applied only by root11-MERGE. It adds no target, product behavior, test, pin, configuration, security control or external prerequisite. Restrict the correction to these current-facing regions:

| Region in current preview | Exact source-aligned disposition |
|---|---|
| Opening/current module table, lines5–27 | Replace old LLM-source/AST-engine responsibility descriptions with actual observed validation/execution responsibilities. **Do not delete src/validator or src/executor references as directories:** both exist. Their current contents are observedReferencePolicy/observedReplay/schema/history and observedOperations/observedReplay/redaction/stepReporter, respectively. Correct “Not yet present” upload/STORED claims: evidence upload/object-store/manifest behavior already exists under src/run, even though there is no src/evidence directory. |
| Parent responsiveness, Routes, saturation and drain prose, approximately139–140,240–260,300 | Use actual current v2 routes and correct route count/identity wording. Preserve non-acceptance versus ambiguous outcome, no retry, capacity, readiness, drain, peer-pin/bearer and original cleanup semantics. Do not imply guided callbacks use ordinary replay authorization. |
| Active Security/Secrets paragraphs, approximately365–374 | Retire vars.secret/ValueResolver/AST argument instructions as current engine advice. Current artifact generation is data-only; secret fill uses secretRef/sourceInputId and its declared recipe/provenance, with actual origin/authorization/redaction boundaries retained. A concise pointer to current observed/guided sections is preferable to inventing a new schema tutorial. No secret capability is broadened. |
| Active guided paragraph near645 | Change only the obsolete Node22 pin reference to the current Node24 requirement. package.json engines is >=24.11.0 <25.0.0 and .nvmrc is24. Preserve the internal-image/ED-05/check:pins gate as still requiring its actual proof. **Do not globally replace Node22:** the earlier dated “pins used to say22” explanation is valid history. |
| Active observed paragraph near685 | Replace “Legacy artifact1 validation, AST semantics and protocol1 remain separate” with their actual retirement/current single path. Do not suggest a supported compatibility fallback. Current source's produced artifact has version3 and profile contract3. No mass renaming of historical human section labels or build identities is required. |

The active Runtime upgrade instructions near472/481 also refer to old corpus/recompile terminology. Within this same bounded amendment, qualify the corpus as the actually packaged observed reference and existing current negative/unit cases, and describe explicit reconfirmed learning/revision replacement rather than a retained compile path. Preserve required fixture gates, exact-build compatibility, old-run evidence and the prohibition on silent artifact reinterpretation. Do not add test commands or revive removed corpora. If root preserves these old sentences as history instead, place an immediate, unambiguous dated supersession note identifying the current procedure; they must not remain active guidance.

This is a related retired-engine/current-operations text correction, not a mandate to rewrite the whole README. The current author's “Versions through EOF byte-identical” rule is a deliberate draft limit, not proof that active Node22 or legacy-engine instructions are correct. Root should narrow that limit only to the exact active sentences above; retain all other dated pin/history text and unrelated guided implementation details. No protected runbook4/14 change is needed. If a broader README refresh is desired, give it a separate named owner/disposition rather than silently including it here.

EDOC-03's factual premise also needs correction: it calls src/validator and src/executor removed, while actual directories remain. Their **old responsibilities** are obsolete. Do not use that metadata to delete current observed implementation documentation. EDOC-04 is accurate about the conflicting active Node22 sentence and its current ownership limit; distinguish it from the valid dated Node22 history.

## Seven-target review and preservation

CLAUDE/AGENTS alter only the CLN-51 mechanism/environment wording; matching Mock-First ranges independently compare equal, and the functional-only accessibility range is byte-preserved. The correct source-qualified R1 wording remains the one required correction there. AGENTS stays a patch/preview supplied to root; this lane does not apply it.

ARCH updates its current mechanism and workflow while retaining §3.2's original planned browser interception behind an immediate dated correction. That respects G11. No historical architecture statement is silently rewritten into a past runtime claim.

The rollout runbook's retired UI selector/authoring/incremental flags remain only within an explicitly dated historical rollout paragraph, satisfying CLN-49's allowed dated-note disposition. Its deletion of “complete API lifecycle” is correct for the old lifecycle.mjs carry. The retained independent fixture-oracle wording is required: current evaluation/cli.mjs still imports oracle.mjs/report.mjs and current evaluation README explicitly names that retained layer; its reports keep releaseReady:false. The observed-authoring driver also exists and uses the public API; do not infer from the old driver's removal that all API evaluation functionality is absent. No actual benchmark/provider/readiness result is claimed.

The inventory preview is byte-prefix-identical to the whole original and appends only the dated static addendum. Original rows/totals/rulings and lifecycle remain intact. Independent source census confirms **61 raw chart tokens /53 closed acceptedEnvKeys /57 loader KEY_SPECS keys**, zero unknown closed keys and four loader-only/direct keys: INSTANCE_ID, SERVICE_IDENTITY, CALLBACK_IDENTITY, CALLBACK_BASE_URL. Those are different counts; the draft correctly avoids calling61 rendered runner variables. There is no Helm/render/deployment evidence in that census. The R-AI archive-first receipt is truthfully pending root/DevOps; this lane owns no .ai mutation and cannot close that obligation.

The runner runbook header and §§1–3/5–13 receive dated source-audit corrections. Their source qualifications are consistent with the inspected network policy, actual seven-state DispatchState vocabulary, kill-switch/recovery separation, immutable ManifestKeys, distinct guided evidence, current gateway prefix and forward-only schema lineage. The §2 callback-api row now includes the guided connector port conditional on guided mode and distinguishes the ordinary replay callback port from that TLS connector. API+worker runner ingress matches the template. No extra egress category, journal deletion/retry procedure or evidence shortcut is introduced.

Protected ranges were independently extracted by headings and remain byte-identical:

| Range | Bytes | SHA256 |
|---|---:|---|
|runner runbook §4|4265|`0ec43db021800e114517d66899f827a8cf5e45ebdd23356785e4380a497af259`|
|runner runbook §14|12392|`4d83b3594c7cab2daa4a4505df1088dbc43c74e55ee4e6f1e9c552ff07880e66`|

The old header's “not re-audited” statement is explicitly a record of the009 change, qualified by the new dated audit; unchanged14.6's historical missing-row statement is explained by the new §2/header note. Preserve both. The already present14.4 UAT upgrade note satisfies the documented note prerequisite; it is **not** an actual upgrade, image, cert, Secret, issuer, cluster, provider, pilot, approval or release receipt. Missing external inputs remain with their existing009/010 owners, not newly invented11-DOC/T0 work.

## Gateway and external-evidence qualification

Actual beans bind studio.gateway; deployment.yaml renders dedicated STUDIO_GATEWAY_PROVIDER/ENDPOINT/PROJECT/LOCATION/MODEL/CREDENTIALS_MODE/CREDENTIALS_KEY_FILE environment entries from existing gateway values/ConfigMap/file settings. The generic properties override helper still enumerates legacy studiocompilegateway spellings. The draft correctly discloses this mismatch and recommends dedicated values without claiming all new spellings are guarded, a successful exploit, or a completed fix.

Retain normal environment-versus-mounted-property precedence when documenting the separate009 guard follow-up: an accepted generic properties spelling alone does not prove it changes the effective value where a higher-priority explicit environment entry wins. Conversely, those environment entries do not prove every alias/source is protected. Exact alias/precedence/rejection behavior belongs to that bounded DevOps source/render test work, not a speculative11-DOC security edit. Re-audit the note against the accepted009 correction before final documentation copyback; do not close the discrepancy on a stale snapshot or imply a new provider/model is enabled.

The runbook's CSRF, real identity/Vault policy, target CNI, physical store deletion, proxy/cookie and approved deployment limitations remain disclosed. This review adds no policy/provisioning/test gate to solve them and authorizes no external contact or model call.

## Evidence limits and next action

Independent checks reconstructed every one of the seven individual previews, their combined patch and the five-target/root-only split; all manifest hashes and current actual target preimages match. Inventory prefix preservation, protected runbook sections, identical CLN-51 ranges, retained accessibility, named retired-section absence and the61/53/57 source census were verified directly. These static checks do not cure R1 or the current README narrative conflicts.

Next action: root confirms R1's source-qualified wording and explicitly records the bounded same-README R2 scope; Dex prepares those text-only corrections off-tree and refreshes its stale unresolved-fact dispositions/patches/hashes. Re-review exact deltas while preserving all original dated records and runbook4/14. Later application follows the existing quoted-writer/ownership/tree gates, with AGENTS and runner README applied only by root11-MERGE. No documentation patch itself proves actual UAT/deployment/provider/pilot/release acceptance, and no lane/story closure is issued here.
