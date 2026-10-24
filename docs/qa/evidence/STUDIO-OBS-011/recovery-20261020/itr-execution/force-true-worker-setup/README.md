# ForceTrue singleton worker setup — source-only review packet

The failed forceTrue run remains invalid evidence. Its original nonempty-canary assertion fired at both audit boundaries, but the strict reader also found a suppressed `NoSuchFileException` while `collectJoinedSinks()` read worker logs that the synthetic-only singleton had never created.

The proposed diagnostic-only correction adds `throws Exception` and calls the existing `startWorkers()` at the start of that same singleton. Those are the only changes from the exact failed diagnostic source. Canonical TEST001 remains `e10c162d…`; nothing here has been applied or executed.

`startWorkers()` creates actual owned guided and ordinary processes, redirects their output to the two required logs, and waits for original ownership/listener readiness. Its existing failure cleanup propagates errors. Final cleanup already drains and verifies every registered root/descendant before collecting sinks. The proposal adds no fake files, missing-file exception handling, scanner changes or cleanup waivers.

The added setup creates no source, learning, publication or ordinary execution and registers no audit canaries. Its governed-policy inserts require neither CSI nor user foreign keys. The singleton's original synthetic scanner assertions and local canary streams remain byte-identical. Actual `realCanaryCount == 0`, native readiness/drain and absence of any unrelated throwable must still be proved by execution.

The copied strict mutation reader, expected cases, original public source, collector-provenance metadata and activation schema are byte-identical. The successor mutation plan changes only the selected mutant's source/activation hash and forward-patch hash. The reader derives assertion locations from that exact candidate. It continues to require the exact selected body PASS, actual one-of-46 multiplicity, complete per-invocation evidence, original 4000 profile, both activation receipts, zero real canaries, and exactly the two original final-boundary AssertionErrors. Any extra throwable still rejects.

Review `from-existing-force-true.patch` for the minimal correction. `from-test001.patch` and `restore-test001.patch` bind canonical staging/restoration; the other inverse recovers the exact failed diagnostic. `future-commands.json` contains a fresh explicit-method label and the unchanged collector/reader command shapes. Root and independent exact-diff review precede any execution. No full-class slot or gate credit follows from this packet.
