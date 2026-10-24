# Dara CLN-F2 draft receipt

Unapplied, static-only candidate under repo/. Exact unified patch: left-data-draft.patch. Budget declared USD500; actual spend unavailable. No lifecycle or QA verdict.

The five-path patch passes read-only git apply --check against the current tree. Four candidate Java files and five mutation outputs have balanced lexical delimiters; this is not Java compilation. All22 immutable migrations and the unowned V20 fixture match S_011. Original source files still equal their manifest before hashes. CaptureSharedBootstrap and all fixture helpers from contains onward remain byte-identical.

| Source path basename | Before SHA256 | Candidate SHA256 |
|---|---|---|
| GuidedPublicationEvidenceFixture.java | 2ad3d7cb00d52813e05d692d0a21d5c6d22d9e5be9904bf9ad5918e489f932e4 | 3a96584d90eacbbc04e96fa576d6f95975e28e20de30e70ad84e442bb29a3c20 |
| GuidedPublicationMigrationTest.java | 9b8b38e4bd7bb2c04d8a222e3baa228bd0a4b622028bc8250227a01d05fc0abd | 3a465f54514504e324c54fa63efa45e3fc4e664cbdf1f984559c464fb0967eac |
| InferenceMigrationIT.java | 58bc1a01c84cfe1b58f0de9a7ffa44f956108ea3a254a698b3c8fdf4197bc854 | DELETE (unapplied) |
| InferenceMigrationLatestIT.java | 14f748837bfd3f16c8c01c86574f80b0b72d5a3f1840c62e6f20623a847b4c42 | 1de5011128d75353d7e9e32a890412202a7a1be87f22f3834b8a59c194deb884 |
| GuidedReplayingPrefixMigrationIT.java | dfbb264f4a061a1afcf5be59a940905ebde558d2da79783979d458a744049637 | 7dfc7a53f038ca9fd93fe08122390a7a09be82b5e7611cec371f7f53fb3bc8d6 |

Four InferenceMigrationIT methods are retired by name with their exact covering or ported head subjects in disposition.md. All12 existing publication methods remain, plus one J2/J4/J8 head-negative method; Latest9→10 via P1; Prefix55 methods retained with only P3's three-line addition. Total source @Test methods80→78; runtime invocation counts remain unverified.

P1/P2/P3 and J1/J2 have concrete red-mutant patches, in-memory applicability/hash checks and an unexecuted locked red/restore/green plan. P1 preserves positive same-test reuse plus changed snapshot, foreign test and coordinate mismatch. J1 pins wrong basisHash finish and VALIDATING. J2 injects deletion only after early read checks to pin final CAS. J4/J8 are ported explicitly; no speculative covering credit is taken from an unrelated happy-path AuthorityIT case. The second head-publication callback proves a real nonnull prior revision before clearing it. All newly ported Java negative probes explicitly set rollback-only before calling the production writer, so even a mutant acceptance cannot persist probe writes or fault DDL.

Original broad grep control is78. Candidate overlay leaves exactly4 V20 generic verifyHistorical helper lines. Root explicitly instructed preserving that unowned file. grep-reconciliation.md retains the exact baseline/result and proposes a hash-bound four-match exception or a separately owned helper rename; neither is ratified here. The V18-specific discriminator goes70→0. Broad-zero and lane-exit obligations remain unsatisfied pending root/architect ruling.

No compiler, formatter, Gradle, Docker, provider/model call, signal or git mutation was run. Runtime PostgreSQL ordering, private-callback behavior, importer execution, all mutant failures/restored greens and the complete lane gate remain unverified. Actual apply waits for root baseline/tree-open and ownership handover; production mutants additionally wait for the unchanged-main GS-T gate. Preserve the existing12s validation deadline and every native/privacy guard.
