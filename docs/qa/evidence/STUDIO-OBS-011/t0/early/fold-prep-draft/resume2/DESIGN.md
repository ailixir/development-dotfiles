# Resume2 author addendum (governs the inherited text below)

FOLD-PREP-1/2 are corrected in both full sets; FOLD-ORDER-1 now resolves phase ordering: old active consumer bindings stay in prep, all3 switches plus complete ports/projector/deletions land atomically in final. See REVIEW-DISPOSITIONS.md and VERIFY-AFTER-GATES.md for current actions; the copied design/conflict discussion below is historical rationale and does not leave the architecture decision unresolved. Root application/plan adoption still required. Original artifacts outside resume2 remain unchanged.

# 11-FOLD-prep design draft

Status: OFF-TREE DRAFT, no source application or runtime evidence. Declared budget USD500; actual spend unavailable. Inherited B1 and source/input freeze remain binding; real main writes additionally require complete unchanged-main GS-T gate and root tree-open after B1/B7.

Use lanes.v4.json exact 17 main / three test permissions. No FOLD_TESTS edit, old-class deletion, migration, dependency, build, new property key, DatabaseClock or GuidedSessionService change. Independent QA owns lifecycle/verdict.

## Intended structure before implementation

HttpRunnerDispatchClient owns three transports built from the existing StudioRunnerTls material. Dispatch retains admissionTimeoutOrDefault and JDK default HTTP version. Validation retains runner.connectTimeout default 2s and HTTP_1_1; call arguments carry maxValidationBytes/validationTimeoutMs. Guided retains runner-origin (not runner.base-url), controller-token-file supplier, 5s connect and HTTP_1_1, monotonic 15s transport budget narrowed by caller deadline, transactional refusal, bounded context classifications, owned body buffers and zeroing. Old 3/4arg constructors and package-private observeRequestBytes stay. SecretWireWriter remains the sole secret-value serializer implementation, never duplicated.

PublicationGrantAuthority owns the unchanged fresh/publication/receipt authorization algorithms and is registered only by !worker GuidedPublicationConfiguration. ProvisionalDispatchAuthorization stays unconditional and receives ObjectProvider via setter; absent authority refuses all three methods with 409 RUNTIME_INCOMPATIBLE. Old authorization bean stays wired for FOLD_TESTS/projector until final. DatabaseClock supplies mint/judge and publisher claim/budget; no window/tolerance changes.

ObservedReplayBindingBuilder is package-private and centralizes the common grant/binding construction. Manual fresh account call remains before build; scheduled path still performs its existing enabled/principal checks and verifier call, and keeps its expiry check before pins lookups (order recorded as a preservation requirement).

Compatibility is temporary only through 11-FOLD-final: allowed consumer classes retain their old public constructors and add constructors accepting the folded client/seam. Both feed the same operation algorithms through private functional method references. Production composition can move to the new constructor while untouched test callers remain compiling. Old classes/beans stay present. Final removes only old constructor plumbing after all named batons; no public transport accessor is added. The projector remains on the old authority in prep.

## Red/application units

0. Add PublicationGrantClockIT against unchanged main; obtain assertion red (never compilation red).
1. Folded client and new HttpRunnerDispatchClientTest, with existing constructor/JobBodyLeak/TLS tests unchanged.
2. Authority seam + !worker wiring + DispatchAuthorizationIT by-name ports + four DatabaseClock sites.
3. Replay builder and compatibility consumer/type swaps as one compile-clean lock unit.
4. After all final batons only: remove legacy compatibility/beans/classes and atomically port exact FOLD_TESTS.

No unit may be applied until source hashes still match; rebase drafts against authorized predecessor edits. All compilation/test/mutation/coverage results UNVERIFIED.
