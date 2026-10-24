# 11-RT corrected sandbox proof — paused at emit disposition

Root/QA-approved wrapper correction was applied only to the after-tree deferred.test.ts, exact SHA90f886fa3edd85f3a4246d40e097fe1ff1bd7863830c47dd81a74247ad539461. Actual repository targets remain original. names02 and targeted lint02 passed. Full unit02 passed2643cases with zero failures and25skips,2668total across117files. Per-file ordered retained names/statuses match fresh B2 exactly after removing only the four bound pointer skips; all15 genuine deferred criteria remain skipped. Unchanged self-test/AST/type02/full-lint01 proofs were reused, not repeated. Prior types01 setup failure and unit01 empty-suite failure remain preserved and uncredited.

Both canonical copied TypeScript compiler emits exited0 using identical Node24/pnpm/TypeScript/config/dependencies. The existing compare-emit command exited1, preserved as an actual byte-difference result rather than an implementation failure or acceptance. Complete full-dist digests:

- Before: `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`.
- After: `f726d3f41a06809fc88a41415809ed8e415ef565ef42b323cd282135060375ac`.

Complete JS-only digests:

- Before: `2663025dfd0610bd0ca420f6bb98f2b76c518876f26f61ab7dbc026533b9226b`.
- After: `9972902bc4fb5609d2fba69ae1391c5e774828102f51407c46a40a1ddad4994c`.

Twelve paths differ: guided/contracts.js/.js.map; diagnostics.js/.js.map; evidence.js/.js.map; json.js.map; transport.js/.js.map; run/guidedBrowser.d.ts/.js/.js.map. `emit-comparison.json` preserves both complete full/JS manifests and raw comparison disposition; `emitted-diffs/` holds each exact direct unified diff and `emit-disposition-request.json` binds every diff hash. Five JS files differ. Four show multiline printer output from wrapped TypeScript; guidedBrowser.js and guidedBrowser.d.ts each differ exactly by the approved JSDoc client name. The six source maps differ only in their mappings field. `proposed-emit-review-delta.json` records these observations; it does not grant semantic or digest acceptance.

All actual root collectors kept sourceStable/testInputStable/distStable true, actualSb1de06061431bc676d15223b03abbdeb14a64984944565461a8aed6e9ef38116/D698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210. Both493-input sandbox source inventories remain unchanged after the authorized correction; full sandbox post-emit inventories exactly match the comparator. Seven actual preimages, seven final proposed candidate hashes and all18protected identities were checked. Historical draft files and previous failed evidence are unchanged. No dependency/symlink/install/config change occurred.

Execution stopped here as required. Root must provide written acceptance or rejection of the exact actual full-dist move before fixture execution or any source copyback; otherwise AC-4(d) remains carried. Fixtures, actual runner build and copyback are unrun, and no runtime job remains active. Complete emit/fixture/final QA, final merge and other story gates remain owed. SharedUSD500 ceiling retained; aggregate spend UNKNOWN. No lifecycle/production credit is claimed.
