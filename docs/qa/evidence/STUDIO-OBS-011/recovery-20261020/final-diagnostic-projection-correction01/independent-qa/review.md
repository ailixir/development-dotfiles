# Independent correction01 source QA: SOURCE_CLEAN

The author successor resolves original findings F1 and F2. There are no remaining blocking source findings within this narrow correction. This is approval of the reviewed command data only, subject to the retained limitations below; it grants no runtime projection, native result, final-source admission, story gate or lifecycle credit. I did not author or modify the correction, execute either payload, inspect runtime logs or protected bodies, or change product, wrapper, pair-reader or story source.

The reviewed author manifest is `d9fc8804b1d395e6006710b2793d93f614891abcecbeb7376d39cee92b59ce24`; command JSON is `a89dec88e49ff361a338d9ad50e5600a6055a738fd656cc1d1826f5c400d9bc7`; README is `ec0ae202fab58dcf502adae1d50f9e4069e9ac2efd3ee57786f4773661975abe`. The original NOT_READY report `aab26764ad69d7a0a342e3c7076aa263c1caa373f5bcb4cb01b0ee8e0faee9c2` remains unchanged and applies to the original preparation.

## Resolved findings

**F1 — resolved.** The new IPC payload requires and exports `controlReads`. It validates at most 512 rows, each exactly four integers: nonnegative JavaScript-safe elapsed/stall values followed by numeric 0/1 overlap flags. Booleans and fractional values are rejected. `controlReadCount` must match the retained row count. These are the existing source-written `[ms, stall, publishOverlap, killOverlap]` rows, not newly observed data or a timer change. The README accurately limits maxima and overlap counts to retained rows, discloses possible producer truncation at capacity, and keeps an empty set of timing samples unavailable rather than manufacturing a zero-duration observation. Existing per-C6 identity, loop-delay and count fields remain intact.

**F2 — resolved.** The payload requires all 20 ordinary-parent keys and all seven child keys before retaining those records. Missing required nullable schema/result/exit/loop/identity fields now produce incomplete-coverage errors rather than becoming explicit null. Child PID and nullable UUID shape are validated before the internal join; intentional explicit-null identity still has the source's wildcard semantics. Existing nullable value and fixed-label checks remain. Version must be an exact Python integer equal to 1, excluding JSON true and 1.0. The degraded `diagnosticFailed:true` parent remains an explicit wrapper failure and cannot become ordinary evidence or make projection coverage complete. No invented fallback values or new raw identity fields are exported.

## Independent checks

I rehashed all nine manifest-bound successor artifacts, all eight files in the entire sealed predecessor tree (including its original QA report), all 14 read-time source/ruling pins, and all three writer/projection block pins. All match. I reconstructed the exact successor and predecessor bytes in memory using both JSON forward/inverse patches and both decoded-IPC forward/inverse patches; no patch was applied to a filesystem input. Both structured five-argument arrays and Python ASTs parse without payload execution. The command JSON changes are exactly `/ipcProjectionArgv/2` and `/inlineSha256/ipc`; the new IPC inline hash is `6dd83d18a659190bdfbe5c3f51f9d37a08083e03209c14c2daa9d9f9d982e357`.

The entire start-failure argv, its inline hash, and the input template are byte-identical to the predecessor. Final hashes, receipt and owner-to-task mappings remain UNBOUND. Current source pins are read-time compatibility checks; they do not admit a later final composition. The original pair reader is unchanged.

The original README's exact R10 baseline requirements, null-versus-false distinction, per-full-run REL refusal denominator, deadline-code versus timeout-kind distinction, real bootstrap UNKNOWN_OUTCOME pairing, earlier same-session stop requirement, unknown startup-hang classification and Replay-only whole-check coverage limits remain in force. The correction does not introduce a new exclusion, timing tolerance, native attempt, observer, framework or acceptance gate. Incomplete projection data cannot establish zero recurrences, and a failed native run remains failed.

## Retained limitations

Readers retain the original leaf no-follow/regular-file check, initial 16 MiB descriptor-size bound and post-read size/mtime comparison. They still use `f.read()` without max-plus-one limiting. Actual terminal owned writers and established owner/task bindings are therefore required; this source approval does not strengthen that read into an adversarial concurrent-writer guarantee.

The IPC payload still detects multiple children for one parent and unmatched children, but does not independently establish reverse child-to-parent uniqueness. Its `projectionComplete` field must not be cited as proof that no duplicate parent reused one child. This remains the explicitly disclosed nonblocking limitation from the first review, not an observed runtime event or a reason to add a test attempt.

At 512 control-read rows, lifetime timing completeness is unknown because the source producer caps retention. Empty rows provide no observed timing maximum. Start-failure lines still cannot supply actual bootstrap outcome pairing, same-session stop chronology or startup-hang attribution; broader whole-check guided fixtures still require their separate existing coverage evidence. None of these unknowns becomes zero through this source verdict.

Root may use this reviewed successor after actual final receipt/source/dist/ownership binding and the existing terminal-writer preconditions are met. Keep the sealed predecessor and original NOT_READY evidence, original run cap and clock, and story lifecycle fields unchanged.
