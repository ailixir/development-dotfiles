# FOLD-final proposed adoption decisions — architecture disposition

Aria, 2026-10-19. These three bounded decisions are **statically supported**, subject to FOLD-META-01 correction, independent Quinn review, root's durable adoption and all existing application/runtime gates. They do not grant application, W1, lane exit, runtime or lifecycle credit. The actual source remains held and all incoming runtime batons remain unreleased.

## FOLD-SETUP-1 — two explicit operation setup constructors

Support the exact proposed public overloads on `HttpRunnerDispatchClient`:

- `(URI, SSLContext, Supplier<String>, GuidedContracts)` for the former guided-operation setup;
- `(URI, HttpClient, Supplier<String>, GuidedContracts)` for the former explicit validator setup, with byte/time limits supplied to each validate call.

The cross-package existing native/unit tests need these exact supplied TLS/client/token/contract inputs after the old client types disappear. A fabricated production Environment, extra HTTP client or a public observer SPI would change the test boundary or allocate an unnecessary transport. These operation-specific constructors reuse the same folded private implementations and cannot restore any old-type compatibility adapter. They are unannotated; the existing @Autowired four-argument deployment constructor and operation initialization remain the sole Spring composition.

For guided setup, the supplied SSLContext is passed unchanged, origin remains HTTPS/root-path/no-userinfo/query/fragment, retry refusal remains, and the same connect5s/HTTP1.1/NEVER/15s monotonic narrowed-caller-deadline implementation is used. Exactly one guided HttpClient is created; unused dispatch/validation references alias that client instead of allocating transports. The token remains a live supplier, with no synthetic credential or fallback origin authority. For supplied validation setup, the exact client is retained, original closed-origin and NEVER/no-retry constructor checks remain, null origin explicitly means unconfigured (no fallback to another origin), and the supplier is read at its original canonical-payload/cap-before-budget position. Its constructor creates no HttpClient.

Both old public ordinary dispatch3/4-argument constructors and `send(RunJob)` are byte-identical. The same StudioRunnerTls identity/configuration, redirects, hostname/client-certificate settings, distinct connect/read/caller deadlines, validation per-call bounds, metrics and secret writer/digest/owned-buffer behavior remain required. No GuidedPublicationProperties is stored/injected into the folded client/worker. `observeRequestBytes` stays package-private; only src/test's DispatchTestAccess bridges the already-existing observation seam. The private reflection targets remain the actual OwnedRequestBody/BoundedResponse implementations.

Scope is valid existing operation setups and current caller maps. An untyped null second argument among the two **new** URI overloads needs an explicit type; no inspected port relies on such ambiguous syntax. The old explicit validation constructor already dereferenced a null client during redirect checks; null origin still defers unconfigured refusal to validate. The former guided constructor already rejected/dereferenced malformed/null setup inputs; no lenient null fallback is added. The folded prep's explicit “operation not initialized” guards remain fail-closed; do not claim unsupported null-contract/partially initialized misuse has identical NPE/stack behavior to a retired standalone class. The existing null-canonical-result fallback test is a different supported seam and its exact validation/token/budget ordering is preserved. Actual compilation, native transport/error/IRQ/TLS and profile proofs remain owed.

## FOLD-TS-META-1 — two exact metadata-only ownership additions

Support adding only these two paths to the final atomic ownership unit:

1. `studio-runner/test/fixtures-tier/guidedCloseBound.test.ts`: one JSDoc old type name → folded type name. Zero non-comment tokens change; all executable bounds/body/assertions and test identities remain.
2. `studio-runner/test/guided/runtime.test.ts`: one `it` display-title literal changes that same type name. The callback/body/assertions and cardinality remain unchanged. Record one renamed identity, zero additions/drops, under suite `REL-001/D4 the guided start has one deadline`:

   Old title: `pins the budget to the backend 15 s transport ceiling minus the 3 s reserve (GuidedRunnerClient.transportDeadline)`.

   New title: `pins the budget to the backend 15 s transport ceiling minus the 3 s reserve (HttpRunnerDispatchClient.transportDeadline)`.

Exact old/new full names and file hashes are in the independent audit. Future discovery/count reconciliation must account for this rename; do not report it as an added/dropped functional case. No other TS source, runtime test body, timer or assertion is granted to FOLD.

## FOLD-RT-TIMING-1 — exact interim comment, then original full grep zero

Support a **timing/ownership amendment**, not a final end-state exception. The prospective complete FOLD overlay has exactly one remaining original full-scope grep hit: RT-owned `studio-runner/src/run/guidedBrowser.ts:26` JSDoc naming `GuidedRunnerClient.transportDeadline`. Current source SHA is `63f899ef688df31f3608c4a0b10f86ea5e63b710410bb32eb7f4d374cd2d63ae`. The separately reviewed complete RT candidate SHA is `59b4d23a2b06e9ffdf3371221970371c5fd8d4e4fe2df4b9acaf51dd2a0a72f0`, with zero old names. That source rename stays with RT's complete pure-wrap/manifest/dist copyback at MERGE W5; FOLD must not take the line, split the RT patch or invalidate its byte/token/emit proof by an independent source edit.

Root's adoption may record **only that exact SHA/path/comment** as pending at the interim FOLD exit. It cannot claim interim full-grep-zero. Every old bean/type/class/compatibility adapter must already be gone in the atomic FOLD unit. Any other grep hit is a finding, not a newly inferred exception. Keep this original command unchanged:

```sh
grep -rnw 'GuidedRunnerClient\|ObservedValidationClient\|GuidedPublicationAuthorization' backend/src studio-runner/src studio-runner/test
```

After actual RT MERGE, rerun that exact complete command and require zero **before Done**/final end-state acceptance. No narrower command, output suppression, residual compatibility type or permanent old-name exception is authorized. This preserves the requested final state while retaining the existing RT ownership unit. Root must adopt it durably with the two TS additions; this report does not self-waive a gate or amend the plan in place.
