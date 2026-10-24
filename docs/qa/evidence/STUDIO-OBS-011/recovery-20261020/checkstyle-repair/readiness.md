# Checkstyle repair readiness

Prepared off-tree only while root wholebackendcheck01 owns frozen source. No actual source, compiler, Checkstyle, formatter, test, build, runtime, lifecycle or Git operation occurred.

Actual observed defects: **50** across exactly three retained GST test files: Transport14 NeedBraces+7 Indentation; Lifecycle10 NeedBraces; Session19 NeedBraces. The patch wraps exactly43 original single control-statement bodies with86 new block-brace tokens, fixes the seven switch indentation rows, and adjusts only adjoining whitespace needed for those blocks/else branches. No full-file restoration, helper/wait rewrite or framework change.

`checkstyle-only.patch` is the apply candidate. `preservation.json` binds the observed error input, current source SHA/modes, proposed after SHA, each43 original controlled statement and its exact body-token hash. Removing **only** the86 specifically inserted brace tokens reproduces the complete ordered original token stream, including comments and literals. Every recognized assertion expression and quoted literal remains exact. This proves a narrow mechanical text boundary, not Java/Checkstyle execution or runtime correctness.

Root applies only after the current backend job is terminal and after confirming all three before hashes still match. Do not apply the old S011 snapshots. Retain modes and original failure evidence. Then run existing repository compilation, Checkstyle and Spotless checks through the current shared Gradle lock/collector; only root assigns formatter execution if necessary. Required fresh full check with executed JaCoCo and final affected suites remain owed; no assertion, skip, deadline, Order17, default4000 or product gate is weakened.

| File | Before SHA256 | Candidate SHA256 |
|---|---|---|
| GuidedServiceTransportFaultIT.java | `5317d3805950e562da4530433fcfdf660b1744e3b17cf58c5fa3f047b2176b15` | `26e2438159760f31c5b323cec701078a0c46203b8be9c23c8482df86fe8a3b9b` |
| GuidedLifecycleReasonIT.java | `353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5` | `a156ff590e975a66e22d52a01357452f8be9787cf30da4c2f204207e9050bbc5` |
| GuidedSessionIT.java | `0a9cd30bf501089b5cbc17922e1f9809efd5f176c83f42359ad4ba0105a8ac59` | `7270cbfb450faa992cf6dc4d22e90f6b856645cf4b5f22779e7a036b83bdb3df` |

Patch SHA256: `8fca2e83bfdc3b113cfc7dc2c684e579f6fea852bc3759df4c5639dd202d7bc6`. Shared USD500 ceiling; aggregate spend unknown. No release/lifecycle credit.
