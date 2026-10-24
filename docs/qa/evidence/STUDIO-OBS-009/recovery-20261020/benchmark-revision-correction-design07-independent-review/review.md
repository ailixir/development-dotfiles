# Independent FR06-01 design07 review

Verdict: REVISE BEFORE IMPLEMENTATION. The trusted revision/CAS correction is appropriate and minimal, but the proposed response-validation placement loses the response required by the privacy scan on malformed 2xx results.

## RD07-QA-01 — capture must precede response rejection

The design requires readDraft and updateDraft to validate the returned identity/positive safe-integer tuple inside the public client before returning the full body. In the reviewed evaluator, withTextCapture at1098–1108 awaits the underlying client method before retaining its fulfilled return value. If a 2xx GET has malformed revisions plus the planted canary, client-side validation throws before capture. interruptedRun at1186–1241 scans only already captured responses, so it cannot observe that canary. A malformed 2xx PUT response has the same problem after an update may already have committed. Separate malformed-response and valid-canary tests do not detect this intersection.

Arrange the new flow so the complete successful response reaches the existing transient capture before response-tuple rejection, then enforce the matching id and checked revisions before dependent operations. A small driver-boundary assertion after awaiting the wrapped response is one possible arrangement; implementation details and return typing must be resolved coherently in the successor design. Avoid raw-body exception fields, logging, a second capture subsystem, silent correction or conflict retries.

Required regression intersections: a malformed/missing-tuple GET carrying the canary must be captured, detected in the catch scan, recorded only as closed findings, and must cause zero PUT/suffix starts; a malformed PUT response carrying the canary must likewise be captured/detected, retain exactly one attempted PUT without retry, and start no suffix. Both keep one known base charge and no extra learning session or fabricated consumption facts. Raw canary text must be absent from the run record. These focused cases may reuse the existing memory driver and fake transport; no real backend/provider is needed.

## Accepted design portions

The authenticated post-publication GET is current authority at the server read, and StudioService304–319 authorizes and locks/refreshes the draft. It avoids guessing publication counter changes or reusing a possibly stale create response. GET and PUT remain separate operations; a single PUT with the supplied tuple preserves server CAS, and409 must stop without reread/retry/rebase.

Requiring positive Number.isSafeInteger numeric revisions, matching id, no coercion/arithmetic/defaults, and serializing the tuple after authoring.request protects precision and source-data override. Keep guided start/finalize string contracts separate. Base finalize must continue using its original frozen tuple; suffix start uses the checked updated draft and the original publication receipt remains the incremental base identity.

The existing interrupted-run recovery can preserve one already charged base, no suffix, and incomplete observation after GET/PUT failure. It does not infer that a submitted PUT was unperformed. Existing pure group5 controls and focused transport/provenance/conflict/precision/privacy checks, runner type-check and changed-file lint are proportional. No105/RED/native/full-suite repeat, backend/schema/source dependency change, additional framework, fake corpus proof or provider budget assumption is needed.

## Review scope and limitations

Manifest1047d9b2 and its three design artifacts are verified. The first metadata-verification attempt expected the other packet's files schema and stopped on KeyError; the public design documents were then displayed before the corrected artifacts-schema verification. All three were subsequently hash/length verified before conclusions; all seven bound public code files were hash/length verified before source excerpts. No private bodies were displayed or read, and no code under review was parsed/imported/executed. This bookkeeping correction does not affect the source finding.

Reviewed source excerpts comprise the archived public client, withTextCapture, interruptedRun, incremental branch, declaration interface and relevant memory/scripted tests, plus current StudioService readAuthoringDraft. Metadata-only route bindings identify the supporting DTO/controller contract. No source, story, SDK, gate, pointer or ledger was changed. The successor design and implementation still require independent review and separately admitted validation; this review grants no runtime/source-adoption authority.
