# SPK-07 grounding benchmark report

> **Screening evidence — not ADR-SC-005 D-C evidence**

## Run

| Field | Value |
|---|---|
| runId | final-20261026 |
| seed | 20261026 |
| arms | A0, A1, S1, S2, S3, S4 |
| reps | 3 |
| started | 2026-10-26T19:11:21.563Z |
| node / playwright | v24.20.0 / 1.63.0 |
| model versions seen | gemini-3.8-flash |
| caps | {"SPK07_MAX_CALLS":"4500","SPK07_MAX_PROMPT_TOKENS_TOTAL":"60000000","maxPromptTokensPerCall":"gateway input cap 262144 bytes"} |
| rows (attempt 1 / all) | 1911 / 2360 |
| VOID entries | 2 by reason {"GT_ABSENT":2}; by stratum {"uniqueNav":1,"random":1} |
| run ended (durability next-day clock) | 2026-10-26T23:29:27.409Z |
| seeds | run seed 20261026; arm order: per task: shuffle seeded by sha256(runSeed|taskId); bootstrap seeds {"primary":1379507090,"s2VsA1":1314839406,"s1VsA1":1037629093,"s4VsS3Visual":1000091754,"tokenRatioS1A1":3476672992} |
| EMPTIED / errors | 178 / 0 |

## Freeze

| Field | Value |
|---|---|
| freeze ok at run time | true |
| corpus sha256 | 400b32aa9ab20593a0f7428cdda0485fb46d174a94c7fc4c655032b0b0b9afec |
| contracts sha256 | 0ccb173aaf5ae0c9d46aaa80f4b823f5026faed51094d05a1aa5f40277578bb0 |
| harness files sha256 | 1a4cddda661584af9dc5c4c04cf92da8e8bd97503ca764a6eca98b09663fe2b0 |
| errors / warnings | none / none |
| re-verified now | matches |
| current harness drift | none |

## Coverage and arm reps

240 of 240 planned tasks finished; rows of unfinished tasks are excluded from every denominator. Minimum for a stage verdict: every stratum min(planned, 8) finished tasks and the visual strata together min(planned, 24).

| stratum | planned | finished |
|---|---|---|
| random | 40 | 40 |
| duplicateNeedsContext | 28 | 28 |
| uniqueNav | 20 | 20 |
| selectCheck | 18 | 18 |
| negative | 17 | 17 |
| labeledField | 16 | 16 |
| chain | 16 | 16 |
| fixtureRegression | 15 | 15 |
| iconOnly | 14 | 14 |
| menuNameDiffers | 14 | 14 |
| readTarget | 14 | 14 |
| assertTarget | 14 | 14 |
| visualOnlyField | 14 | 14 |

No unfinished tasks.

| arm | reps used | steps with rows | tasks |
|---|---|---|---|
| A0 | 1 | 265 | 239 |
| A1 | 1 | 265 | 239 |
| S1 | 1 | 265 | 239 |
| S2 | 2 | 265 | 239 |
| S3 | 2 | 265 | 239 |
| S4 | 2 | 28 | 28 |

4-hour profile (preregistration section 14, entry 6): McNemar unit = success only if ALL of that arm's reps succeed; A0 is derived from A1 (67 derived, 178 emptied, 18 own calls because the request bodies differed, 0 unresolved of 265); PRODUCT_REFUSED_GATEWAY_CAP rows (request over 262,144 bytes): {"A0":0,"A1":28,"S1":0,"S2":0,"S3":0,"S4":30}.

## Unresolved infrastructure errors (excluded from every denominator)

15 rows are still unresolved (0 from a failed shared SOURCE_PLAN). They are not arm failures and are not counted in any rate or comparison below. Rerun with the same RUN_DIR to re-attempt them; stage verdicts that depend on these arms stay INCOMPLETE until then.

| arm | unresolved rows |
|---|---|
| S2 | 9 |
| A1 | 3 |
| S1 | 3 |

By HTTP status: {"0":11,"429":4}; by task: {"ol-field-01":1,"wx-nav-03":1,"wiki-vis-01":1,"govuk-chain-03":1,"rfc-field-02":1,"rnd-026":1,"rnd-035":1,"govuk-menu-02":1,"rfc-icon-01":1,"gut-dup-06":1,"wx-nav-01":1,"arxiv-icon-01":1,"fx-c13":1,"rnd-029":1,"gut-chain-02":1}

## Per arm and stratum (answerable steps; rep-level trials, first attempt)

Cells are k/n (rate [Wilson 95%]). Success = ACTION on the GT element with an executable locator, first attempt, no gate required (primary metric). Product-admitted success also needs the arm's gates (harness gate codes, Java verdict where scored). Descriptive per stratum; decisions use the paired comparisons below.

### A0 (derived from A1 when the request bodies are byte-identical; EMPTIED when emptied)

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 245 | 38/245 (15.5% [11.5%, 20.6%]) | 23/245 (9.4% [6.3%, 13.7%]) | 23/245 (9.4% [6.3%, 13.7%]) | 23/245 (9.4% [6.3%, 13.7%]) | 23/245 (9.4% [6.3%, 13.7%]) | 42/245 (17.1% [12.9%, 22.4%]) | 0/245 (0.0% [0.0%, 1.5%]) | 0 | 5/20 (conf. wrong 0) | 0 | 164/1 |
| assertTarget | 14 | 2/14 (14.3% [4.0%, 39.9%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 9/0 |
| chain | 42 | 2/42 (4.8% [1.3%, 15.8%]) | 0/42 (0.0% [0.0%, 8.4%]) | 0/42 (0.0% [0.0%, 8.4%]) | 0/42 (0.0% [0.0%, 8.4%]) | 0/42 (0.0% [0.0%, 8.4%]) | 10/42 (23.8% [13.5%, 38.5%]) | 0/42 (0.0% [0.0%, 8.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 30/0 |
| duplicateNeedsContext | 28 | 1/28 (3.6% [0.6%, 17.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 5/28 (17.9% [7.9%, 35.6%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 22/0 |
| fixtureRegression | 12 | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 2/3 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 11/1 |
| labeledField | 16 | 3/16 (18.8% [6.6%, 43.0%]) | 1/16 (6.3% [1.1%, 28.3%]) | 1/16 (6.3% [1.1%, 28.3%]) | 1/16 (6.3% [1.1%, 28.3%]) | 1/16 (6.3% [1.1%, 28.3%]) | 3/16 (18.8% [6.6%, 43.0%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 10/0 |
| menuNameDiffers | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 2/14 (14.3% [4.0%, 39.9%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 12/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 3/17 (conf. wrong 0) | 0 | 0/0 |
| random | 39 | 9/39 (23.1% [12.6%, 38.3%]) | 5/39 (12.8% [5.6%, 26.7%]) | 5/39 (12.8% [5.6%, 26.7%]) | 5/39 (12.8% [5.6%, 26.7%]) | 5/39 (12.8% [5.6%, 26.7%]) | 7/39 (17.9% [9.0%, 32.7%]) | 0/39 (0.0% [0.0%, 9.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 23/0 |
| readTarget | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 11/0 |
| selectCheck | 18 | 3/18 (16.7% [5.8%, 39.2%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 2/18 (11.1% [3.1%, 32.8%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 13/0 |
| uniqueNav | 20 | 5/20 (25.0% [11.2%, 46.9%]) | 3/20 (15.0% [5.2%, 36.0%]) | 3/20 (15.0% [5.2%, 36.0%]) | 3/20 (15.0% [5.2%, 36.0%]) | 3/20 (15.0% [5.2%, 36.0%]) | 0/20 (0.0% [0.0%, 16.1%]) | 0/20 (0.0% [0.0%, 16.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 15/0 |
| visualOnlyField | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 6/14 (42.9% [21.4%, 67.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 8/0 |

### A1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 245 | 108/245 (44.1% [38.0%, 50.3%]) | 45/245 (18.4% [14.0%, 23.7%]) | 42/245 (17.1% [12.9%, 22.4%]) | 24/245 (9.8% [6.7%, 14.2%]) | 40/245 (16.3% [12.2%, 21.5%]) | 102/245 (41.6% [35.6%, 47.9%]) | 0/245 (0.0% [0.0%, 1.5%]) | 7 | 10/20 (conf. wrong 0) | 2 | 0/27 |
| assertTarget | 14 | 6/14 (42.9% [21.4%, 67.4%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 1/14 (7.1% [1.3%, 31.5%]) | 2/14 (14.3% [4.0%, 39.9%]) | 6/14 (42.9% [21.4%, 67.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| chain | 42 | 15/42 (35.7% [23.0%, 50.8%]) | 5/42 (11.9% [5.2%, 25.0%]) | 3/42 (7.1% [2.5%, 19.0%]) | 1/42 (2.4% [0.4%, 12.3%]) | 3/42 (7.1% [2.5%, 19.0%]) | 19/42 (45.2% [31.2%, 60.1%]) | 0/42 (0.0% [0.0%, 8.4%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/5 |
| duplicateNeedsContext | 28 | 8/28 (28.6% [15.3%, 47.1%]) | 1/28 (3.6% [0.6%, 17.7%]) | 1/28 (3.6% [0.6%, 17.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 1/28 (3.6% [0.6%, 17.7%]) | 16/28 (57.1% [39.1%, 73.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/3 |
| fixtureRegression | 12 | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 8/12 (66.7% [39.1%, 86.2%]) | 12/12 (100.0% [75.8%, 100.0%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 2/3 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 8/14 (57.1% [32.6%, 78.6%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| labeledField | 16 | 9/16 (56.3% [33.2%, 76.9%]) | 5/16 (31.3% [14.2%, 55.6%]) | 5/16 (31.3% [14.2%, 55.6%]) | 4/16 (25.0% [10.2%, 49.5%]) | 5/16 (31.3% [14.2%, 55.6%]) | 5/16 (31.3% [14.2%, 55.6%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| menuNameDiffers | 14 | 6/14 (42.9% [21.4%, 67.4%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 5/14 (35.7% [16.3%, 61.2%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| negative | 0 | - | - | - | - | - | - | - | 1 | 8/17 (conf. wrong 0) | 0 | 0/0 |
| random | 39 | 21/39 (53.8% [38.6%, 68.4%]) | 7/39 (17.9% [9.0%, 32.7%]) | 7/39 (17.9% [9.0%, 32.7%]) | 4/39 (10.3% [4.1%, 23.6%]) | 6/39 (15.4% [7.2%, 29.7%]) | 13/39 (33.3% [20.6%, 49.0%]) | 0/39 (0.0% [0.0%, 9.0%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/4 |
| readTarget | 14 | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 11/14 (78.6% [52.4%, 92.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| selectCheck | 18 | 7/18 (38.9% [20.3%, 61.4%]) | 4/18 (22.2% [9.0%, 45.2%]) | 4/18 (22.2% [9.0%, 45.2%]) | 2/18 (11.1% [3.1%, 32.8%]) | 4/18 (22.2% [9.0%, 45.2%]) | 7/18 (38.9% [20.3%, 61.4%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/4 |
| uniqueNav | 20 | 15/20 (75.0% [53.1%, 88.8%]) | 6/20 (30.0% [14.5%, 51.9%]) | 6/20 (30.0% [14.5%, 51.9%]) | 4/20 (20.0% [8.1%, 41.6%]) | 6/20 (30.0% [14.5%, 51.9%]) | 4/20 (20.0% [8.1%, 41.6%]) | 0/20 (0.0% [0.0%, 16.1%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/1 |
| visualOnlyField | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 13/14 (92.9% [68.5%, 98.7%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 245 | 112/245 (45.7% [39.6%, 52.0%]) | 51/245 (20.8% [16.2%, 26.3%]) | 49/245 (20.0% [15.5%, 25.5%]) | 26/245 (10.6% [7.3%, 15.1%]) | 48/245 (19.6% [15.1%, 25.0%]) | 124/245 (50.6% [44.4%, 56.8%]) | 0/245 (0.0% [0.0%, 1.5%]) | 8 | 11/20 (conf. wrong 0) | 4 | 0/1 |
| assertTarget | 14 | 6/14 (42.9% [21.4%, 67.4%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 1/14 (7.1% [1.3%, 31.5%]) | 2/14 (14.3% [4.0%, 39.9%]) | 8/14 (57.1% [32.6%, 78.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 42 | 20/42 (47.6% [33.4%, 62.3%]) | 7/42 (16.7% [8.3%, 30.6%]) | 6/42 (14.3% [6.7%, 27.8%]) | 2/42 (4.8% [1.3%, 15.8%]) | 5/42 (11.9% [5.2%, 25.0%]) | 20/42 (47.6% [33.4%, 62.3%]) | 0/42 (0.0% [0.0%, 8.4%]) | 2 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| duplicateNeedsContext | 28 | 9/28 (32.1% [17.9%, 50.7%]) | 2/28 (7.1% [2.0%, 22.6%]) | 2/28 (7.1% [2.0%, 22.6%]) | 0/28 (0.0% [0.0%, 12.1%]) | 2/28 (7.1% [2.0%, 22.6%]) | 19/28 (67.9% [49.3%, 82.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| fixtureRegression | 12 | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 12/12 (100.0% [75.8%, 100.0%]) | 8/12 (66.7% [39.1%, 86.2%]) | 12/12 (100.0% [75.8%, 100.0%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 2/3 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 6/14 (42.9% [21.4%, 67.4%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 0/14 (0.0% [0.0%, 21.5%]) | 2/14 (14.3% [4.0%, 39.9%]) | 6/14 (42.9% [21.4%, 67.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/1 |
| labeledField | 16 | 11/16 (68.8% [44.4%, 85.8%]) | 7/16 (43.8% [23.1%, 66.8%]) | 7/16 (43.8% [23.1%, 66.8%]) | 5/16 (31.3% [14.2%, 55.6%]) | 7/16 (43.8% [23.1%, 66.8%]) | 5/16 (31.3% [14.2%, 55.6%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 14 | 7/14 (50.0% [26.8%, 73.2%]) | 1/14 (7.1% [1.3%, 31.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 6/14 (42.9% [21.4%, 67.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 2 | 9/17 (conf. wrong 0) | 0 | 0/0 |
| random | 39 | 17/39 (43.6% [29.3%, 59.0%]) | 8/39 (20.5% [10.8%, 35.5%]) | 8/39 (20.5% [10.8%, 35.5%]) | 5/39 (12.8% [5.6%, 26.7%]) | 8/39 (20.5% [10.8%, 35.5%]) | 21/39 (53.8% [38.6%, 68.4%]) | 0/39 (0.0% [0.0%, 9.0%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| readTarget | 14 | 2/14 (14.3% [4.0%, 39.9%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 11/14 (78.6% [52.4%, 92.4%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 18 | 7/18 (38.9% [20.3%, 61.4%]) | 4/18 (22.2% [9.0%, 45.2%]) | 4/18 (22.2% [9.0%, 45.2%]) | 2/18 (11.1% [3.1%, 32.8%]) | 4/18 (22.2% [9.0%, 45.2%]) | 11/18 (61.1% [38.6%, 79.7%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 20 | 15/20 (75.0% [53.1%, 88.8%]) | 5/20 (25.0% [11.2%, 46.9%]) | 5/20 (25.0% [11.2%, 46.9%]) | 3/20 (15.0% [5.2%, 36.0%]) | 5/20 (25.0% [11.2%, 46.9%]) | 5/20 (25.0% [11.2%, 46.9%]) | 0/20 (0.0% [0.0%, 16.1%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| visualOnlyField | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 12/14 (85.7% [60.1%, 96.0%]) | 0/14 (0.0% [0.0%, 21.5%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S2

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 490 | 231/490 (47.1% [42.8%, 51.6%]) | 229/490 (46.7% [42.4%, 51.2%]) | 218/490 (44.5% [40.1%, 48.9%]) | 104/490 (21.2% [17.8%, 25.1%]) | 211/490 (43.1% [38.7%, 47.5%]) | 241/490 (49.2% [44.8%, 53.6%]) | 0/490 (0.0% [0.0%, 0.8%]) | 16 | 22/40 (conf. wrong 4) | 6 | 0/2 |
| assertTarget | 28 | 12/28 (42.9% [26.5%, 60.9%]) | 12/28 (42.9% [26.5%, 60.9%]) | 12/28 (42.9% [26.5%, 60.9%]) | 8/28 (28.6% [15.3%, 47.1%]) | 12/28 (42.9% [26.5%, 60.9%]) | 16/28 (57.1% [39.1%, 73.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 84 | 40/84 (47.6% [37.3%, 58.2%]) | 41/84 (48.8% [38.4%, 59.3%]) | 36/84 (42.9% [32.8%, 53.5%]) | 20/84 (23.8% [16.0%, 33.9%]) | 35/84 (41.7% [31.7%, 52.3%]) | 39/84 (46.4% [36.2%, 57.0%]) | 0/84 (0.0% [0.0%, 4.4%]) | 5 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 56 | 13/56 (23.2% [14.1%, 35.8%]) | 10/56 (17.9% [10.0%, 29.8%]) | 10/56 (17.9% [10.0%, 29.8%]) | 0/56 (0.0% [0.0%, 6.4%]) | 10/56 (17.9% [10.0%, 29.8%]) | 42/56 (75.0% [62.3%, 84.5%]) | 0/56 (0.0% [0.0%, 6.4%]) | 1 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| fixtureRegression | 24 | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 16/24 (66.7% [46.7%, 82.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0 | 4/6 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 28 | 16/28 (57.1% [39.1%, 73.5%]) | 14/28 (50.0% [32.6%, 67.4%]) | 14/28 (50.0% [32.6%, 67.4%]) | 0/28 (0.0% [0.0%, 12.1%]) | 11/28 (39.3% [23.6%, 57.6%]) | 8/28 (28.6% [15.3%, 47.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| labeledField | 32 | 22/32 (68.8% [51.4%, 82.0%]) | 22/32 (68.8% [51.4%, 82.0%]) | 22/32 (68.8% [51.4%, 82.0%]) | 16/32 (50.0% [33.6%, 66.4%]) | 22/32 (68.8% [51.4%, 82.0%]) | 10/32 (31.3% [18.0%, 48.6%]) | 0/32 (0.0% [0.0%, 10.7%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 28 | 14/28 (50.0% [32.6%, 67.4%]) | 16/28 (57.1% [39.1%, 73.5%]) | 14/28 (50.0% [32.6%, 67.4%]) | 0/28 (0.0% [0.0%, 12.1%]) | 14/28 (50.0% [32.6%, 67.4%]) | 12/28 (42.9% [26.5%, 60.9%]) | 0/28 (0.0% [0.0%, 12.1%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 4 | 18/34 (conf. wrong 4) | 0 | 0/0 |
| random | 78 | 40/78 (51.3% [40.4%, 62.1%]) | 38/78 (48.7% [37.9%, 59.6%]) | 38/78 (48.7% [37.9%, 59.6%]) | 14/78 (17.9% [11.0%, 27.9%]) | 38/78 (48.7% [37.9%, 59.6%]) | 36/78 (46.2% [35.5%, 57.1%]) | 0/78 (0.0% [0.0%, 4.7%]) | 0 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| readTarget | 28 | 3/28 (10.7% [3.7%, 27.2%]) | 2/28 (7.1% [2.0%, 22.6%]) | 1/28 (3.6% [0.6%, 17.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 24/28 (85.7% [68.5%, 94.3%]) | 0/28 (0.0% [0.0%, 12.1%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 36 | 15/36 (41.7% [27.1%, 57.8%]) | 15/36 (41.7% [27.1%, 57.8%]) | 15/36 (41.7% [27.1%, 57.8%]) | 10/36 (27.8% [15.8%, 44.0%]) | 15/36 (41.7% [27.1%, 57.8%]) | 21/36 (58.3% [42.2%, 72.9%]) | 0/36 (0.0% [0.0%, 9.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 40 | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 20/40 (50.0% [35.2%, 64.8%]) | 30/40 (75.0% [59.8%, 85.8%]) | 8/40 (20.0% [10.5%, 34.8%]) | 0/40 (0.0% [0.0%, 8.8%]) | 0 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| visualOnlyField | 28 | 0/28 (0.0% [0.0%, 12.1%]) | 3/28 (10.7% [3.7%, 27.2%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 25/28 (89.3% [72.8%, 96.3%]) | 0/28 (0.0% [0.0%, 12.1%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S3

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 490 | 396/490 (80.8% [77.1%, 84.1%]) | 395/490 (80.6% [76.9%, 83.9%]) | 386/490 (78.8% [74.9%, 82.2%]) | 288/490 (58.8% [54.4%, 63.0%]) | 381/490 (77.8% [73.9%, 81.2%]) | 78/490 (15.9% [12.9%, 19.4%]) | 7/490 (1.4% [0.7%, 2.9%]) | 14 | 22/40 (conf. wrong 4) | 12 | 0/2 |
| assertTarget | 28 | 24/28 (85.7% [68.5%, 94.3%]) | 26/28 (92.9% [77.4%, 98.0%]) | 24/28 (85.7% [68.5%, 94.3%]) | 16/28 (57.1% [39.1%, 73.5%]) | 24/28 (85.7% [68.5%, 94.3%]) | 2/28 (7.1% [2.0%, 22.6%]) | 2/28 (7.1% [2.0%, 22.6%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 84 | 74/84 (88.1% [79.5%, 93.4%]) | 72/84 (85.7% [76.7%, 91.6%]) | 72/84 (85.7% [76.7%, 91.6%]) | 51/84 (60.7% [50.0%, 70.5%]) | 72/84 (85.7% [76.7%, 91.6%]) | 10/84 (11.9% [6.6%, 20.5%]) | 0/84 (0.0% [0.0%, 4.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 56 | 52/56 (92.9% [83.0%, 97.2%]) | 54/56 (96.4% [87.9%, 99.0%]) | 52/56 (92.9% [83.0%, 97.2%]) | 50/56 (89.3% [78.5%, 95.0%]) | 52/56 (92.9% [83.0%, 97.2%]) | 2/56 (3.6% [1.0%, 12.1%]) | 2/56 (3.6% [1.0%, 12.1%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| fixtureRegression | 24 | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 18/24 (75.0% [55.1%, 88.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0 | 4/6 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 28 | 22/28 (78.6% [60.5%, 89.8%]) | 22/28 (78.6% [60.5%, 89.8%]) | 20/28 (71.4% [52.9%, 84.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 18/28 (64.3% [45.8%, 79.3%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 2 | 0/0 (conf. wrong 0) | 9 | 0/2 |
| labeledField | 32 | 25/32 (78.1% [61.2%, 89.0%]) | 25/32 (78.1% [61.2%, 89.0%]) | 25/32 (78.1% [61.2%, 89.0%]) | 21/32 (65.6% [48.3%, 79.6%]) | 25/32 (78.1% [61.2%, 89.0%]) | 7/32 (21.9% [11.0%, 38.8%]) | 0/32 (0.0% [0.0%, 10.7%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 28 | 28/28 (100.0% [87.9%, 100.0%]) | 28/28 (100.0% [87.9%, 100.0%]) | 28/28 (100.0% [87.9%, 100.0%]) | 28/28 (100.0% [87.9%, 100.0%]) | 28/28 (100.0% [87.9%, 100.0%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 4 | 18/34 (conf. wrong 4) | 0 | 0/0 |
| random | 78 | 56/78 (71.8% [61.0%, 80.6%]) | 56/78 (71.8% [61.0%, 80.6%]) | 56/78 (71.8% [61.0%, 80.6%]) | 46/78 (59.0% [47.9%, 69.2%]) | 56/78 (71.8% [61.0%, 80.6%]) | 20/78 (25.6% [17.3%, 36.3%]) | 0/78 (0.0% [0.0%, 4.7%]) | 0 | 0/0 (conf. wrong 0) | 3 | 0/0 |
| readTarget | 28 | 8/28 (28.6% [15.3%, 47.1%]) | 9/28 (32.1% [17.9%, 50.7%]) | 8/28 (28.6% [15.3%, 47.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 7/28 (25.0% [12.7%, 43.4%]) | 18/28 (64.3% [45.8%, 79.3%]) | 1/28 (3.6% [0.6%, 17.7%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 36 | 27/36 (75.0% [58.9%, 86.2%]) | 27/36 (75.0% [58.9%, 86.2%]) | 25/36 (69.4% [53.1%, 82.0%]) | 18/36 (50.0% [34.5%, 65.5%]) | 23/36 (63.9% [47.6%, 77.5%]) | 7/36 (19.4% [9.8%, 35.0%]) | 2/36 (5.6% [1.5%, 18.1%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 40 | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 32/40 (80.0% [65.2%, 89.5%]) | 8/40 (20.0% [10.5%, 34.8%]) | 0/40 (0.0% [0.0%, 8.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 28 | 24/28 (85.7% [68.5%, 94.3%]) | 20/28 (71.4% [52.9%, 84.7%]) | 20/28 (71.4% [52.9%, 84.7%]) | 8/28 (28.6% [15.3%, 47.1%]) | 20/28 (71.4% [52.9%, 84.7%]) | 4/28 (14.3% [5.7%, 31.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S4

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 56 | 16/56 (28.6% [18.4%, 41.5%]) | 12/56 (21.4% [12.7%, 33.8%]) | 10/56 (17.9% [10.0%, 29.8%]) | 4/56 (7.1% [2.8%, 17.0%]) | 10/56 (17.9% [10.0%, 29.8%]) | 4/56 (7.1% [2.8%, 17.0%]) | 0/56 (0.0% [0.0%, 6.4%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/32 |
| iconOnly | 28 | 6/28 (21.4% [10.2%, 39.5%]) | 6/28 (21.4% [10.2%, 39.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 4/28 (14.3% [5.7%, 31.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0/28 (0.0% [0.0%, 12.1%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/18 |
| visualOnlyField | 28 | 10/28 (35.7% [20.7%, 54.2%]) | 6/28 (21.4% [10.2%, 39.5%]) | 6/28 (21.4% [10.2%, 39.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 6/28 (21.4% [10.2%, 39.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/14 |

## Paired comparisons (correct-and-executable per step, answerable tasks)

Unit = task step, outcome = majority over reps. McNemar is exact two-sided on discordant units (only-X/only-Y). Sensitivity pairs every rep. Bootstrap = 10,000 task-cluster resamples, seeded, 95% percentile CI of rate(X) - rate(Y).

| X vs Y | units | only X / only Y | McNemar p | all-reps p (b/c) | diff [95% CI] | rates |
|---|---|---|---|---|---|---|
| **PRIMARY** S3 vs S2 | 245 | 86/7 | 0.0000 | 0.0000 (183/15) | 34.3% [27.6%, 40.9%] | 75.9% vs 43.7% |
| S2 vs A1 | 245 | 67/2 | 0.0000 | 0.0000 (68/2) | 27.3% [21.6%, 33.3%] | 43.7% vs 17.1% |
| S1 vs A1 (format effect) | 245 | 9/2 | 0.0654 | 0.0654 (9/2) | 2.9% [0.4%, 5.5%] | 20.0% vs 17.1% |
| S4 vs S3 on visualOnlyField + iconOnly | 28 | 0/15 | 0.0001 | 0.0000 (0/30) | -53.6% [-71.4%, -35.7%] | 17.9% vs 71.4% |

### Sensitivity (reported, never gating): diff [95% CI] (units)

| comparison | admitted | afterReask | realSitesOnly | heldOutOnly | strictLocators | strictEquality |
|---|---|---|---|---|---|---|
| S3 vs S2 | 37.6% [30.8%, 44.4%] (245) | 34.7% [27.8%, 41.6%] (245) | 36.1% [29.0%, 43.0%] (233) | 30.0% [19.8%, 40.2%] (120) | 31.0% [24.3%, 37.8%] (245) | 33.1% [26.1%, 39.9%] (245) |
| S2 vs A1 | 11.4% [7.3%, 15.8%] (245) | 26.7% [21.2%, 32.6%] (245) | 28.8% [22.8%, 35.0%] (233) | 25.4% [17.0%, 33.9%] (120) | 27.3% [21.6%, 33.3%] (245) | 26.9% [21.3%, 32.8%] (245) |
| S1 vs A1 | 0.8% [-0.8%, 2.5%] (245) | 3.3% [0.8%, 5.8%] (245) | 3.0% [0.4%, 5.8%] (233) | 2.5% [-1.7%, 6.9%] (120) | 2.9% [0.4%, 5.5%] (245) | 2.0% [-0.4%, 4.5%] (245) |
| S4 vs S3 (visual) | -7.1% [-17.9%, 0.0%] (28) | -50.0% [-67.9%, -32.1%] (28) | -53.6% [-71.4%, -35.7%] (28) | -64.3% [-85.7%, -35.7%] (14) | -53.6% [-71.4%, -35.7%] (28) | -37.5% [-57.1%, -19.6%] (28) |

Summed prompt-token ratio S1/A1: 0.363, 95% cluster-bootstrap CI [0.345, 0.382] over 204 tasks.

## Absolute bar

Reference 97.0% per step (D-C 90% workflow completion implies 0.97^5 = 85.9%).

| arm | per-step correct-and-executable | implied 5-step completion | 5-step at Wilson lower bound |
|---|---|---|---|
| A0 | 9.4% | 0.0% | 0.0% |
| A1 | 17.1% | 0.0% | 0.0% |
| S1 | 20.0% | 0.0% | 0.0% |
| S2 | 44.5% | 1.7% | 1.0% |
| S3 | 78.8% | 30.3% | 23.6% |
| S4 | 17.9% | 0.0% | 0.0% |

## Tokens, latency, admission

Tokens are real Gemini `usageMetadata` (first attempt). Admission: production limits and the gateway cap are per observation; the planned-limits column is per request (every S3 request must pass for Stage 3).

| arm | calls | prompt p50 | prompt p95 | prompt mean | out mean | thoughts mean | model ms p50/p95 | observe ms p50/p95 | obs bytes p50/p95 |
|---|---|---|---|---|---|---|---|---|---|
| A0 | 18 | 16289 | 16896 | 15870 | 152 | 46 | 3277/24697 | 29/57 | 400/32413 |
| A1 | 227 | 23351 | 74822 | 27213 | 210 | 30 | 3705/17205 | 32/573 | 54577/688385 |
| S1 | 255 | 9843 | 47102 | 14916 | 186 | 0 | 3120/20764 | 32/549 | 6722/77904 |
| S2 | 510 | 9995 | 58205 | 16162 | 190 | 5 | 3260/20239 | 30/550 | 8034/101112 |
| S3 | 510 | 10621 | 19350 | 11305 | 182 | 8 | 3040/19944 | 86/791 | 10704/31827 |
| S4 | 22 | 9074 | 21145 | 10862 | 167 | 26 | 3566/25289 | 97/229 | 9525/31862 |
| SP | 237 | 6158 | 6605 | n/a | n/a | n/a | 3197/18713 | n/a/n/a | n/a/n/a |

| arm | observations | production limits (A0-S2: nodes/bytes/depth + gateway + translation caps) | gateway cap 262,144 | translation cap 65,536 (wire + 2048) | max translation input bytes | requests under planned limits (obs <= 40,000 B and body <= 262,144 B) |
|---|---|---|---|---|---|---|
| A0 | 265 | 87/265 (32.8% [27.5%, 38.7%]) | 87/265 (32.8% [27.5%, 38.7%]) | 87/265 (32.8% [27.5%, 38.7%]) | 58271 | 95/95 (100.0% [96.1%, 100.0%]) |
| A1 | 265 | 82/265 (30.9% [25.7%, 36.7%]) | 236/265 (89.1% [84.7%, 92.3%]) | 82/265 (30.9% [25.7%, 36.7%]) | 1659915 | 97/329 (29.5% [24.8%, 34.6%]) |
| S1 | 265 | 82/265 (30.9% [25.7%, 36.7%]) | 265/265 (100.0% [98.6%, 100.0%]) | 236/265 (89.1% [84.7%, 92.3%]) | 190349 | 298/331 (90.0% [86.3%, 92.8%]) |
| S2 | 265 | 82/265 (30.9% [25.7%, 36.7%]) | 265/265 (100.0% [98.6%, 100.0%]) | 236/265 (89.1% [84.7%, 92.3%]) | 195634 | 553/614 (90.1% [87.4%, 92.2%]) |
| S3 | 265 | 265/265 (100.0% [98.6%, 100.0%]) | 265/265 (100.0% [98.6%, 100.0%]) | 264/265 (99.6% [97.9%, 99.9%]) | 66895 | 595/595 (100.0% [99.4%, 100.0%]) |
| S4 | 28 | 28/28 (100.0% [87.9%, 100.0%]) | 12/28 (42.9% [26.5%, 60.9%]) | 27/28 (96.4% [82.3%, 99.4%]) | 68011 | 36/66 (54.5% [42.6%, 66.0%]) |

## Java verdicts (A1, S1, S2, SOURCE_PLAN)

| arm | ADMITTED | REFUSED | SCORER_ERROR | codes (verdict/stage:code) |
|---|---|---|---|---|
| SP | 212 | 25 | 0 | {"REFUSED/admitPlan:MISSING_SOURCE":14,"REFUSED/admitPlan:INVALID_CONTRACT":11} |
| S2 | 392 | 248 | 0 | {"ADMITTED/parse:UNSUPPORTED":219,"REFUSED/action:INVALID_CONTRACT":248,"ADMITTED/parse:CLARIFICATION":57} |
| S1 | 226 | 120 | 0 | {"ADMITTED/parse:UNSUPPORTED":113,"REFUSED/action:INVALID_CONTRACT":120,"ADMITTED/parse:CLARIFICATION":28} |
| A1 | 198 | 117 | 0 | {"ADMITTED/parse:UNSUPPORTED":90,"REFUSED/action:INVALID_CONTRACT":117,"ADMITTED/parse:CLARIFICATION":31} |

## Durability

One factor at a time per task: 5 baseline contexts (1280x720, en-US, the task's cookie choice), then 1 each for viewport 1920x1080, locale en-GB and the opposite cookie choice where the site has a banner. Outcomes: OK, FAIL_CLOSED, WRONG_UNIQUE (HZ-2), VOID.

### Short-term (<24 h after the run)

Not run.

### Next day (>=24 h after the run)

Not run.

## Safety

| check | result |
|---|---|
| leak scan | 0 hits in 2894 files (64 canaries) |
| mask test | 0 differences |
| hostile cases | 20/20 |
| F1 conformance | PASS |

## Hard zeros

| hard zero | arm | count | detail |
|---|---|---|---|
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | A0 | 0 | 0 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | A1 | 0 | 12 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S1 | 0 | 15 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S2 | 4 | 23 wrong-element ACTIONs incl. refused; neg-wiki-02|0|S2|1|1, neg-wiki-02|0|S2|2|1, neg-gov-02|0|S2|1|1, neg-gov-02|0|S2|2|1 |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S3 | 11 | 16 wrong-element ACTIONs incl. refused; neg-pydocs-01|0|S3|1|1, neg-pydocs-01|0|S3|2|1, ol-sel-01|0|S3|2|1, ol-dup-03|0|S3|2|1, ol-dup-03|0|S3|1|1 |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S4 | 0 | 4 wrong-element ACTIONs incl. refused;  |
| HZ-2 wrong-unique durability | - | n/a | durability not run |
| HZ-3 leak | - | 0 | by arm: {"harness":0,"A0":0,"A1":0,"S1":0,"S2":0,"S3":0,"S4":0}; A0/A1 hits are production findings outside gating |
| HZ-4 mask difference | - | 0 |  |
| HZ-5 hostile or injection case not passed | - | 0 | hostile 20/20, injected 15/15 |
| HZ-6 engine vs public mismatch | - | n/a | durability engine check not run |
| F1 conformance (f1-conformance) | - | 0 | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |

## Stage go / no-go (computed)

GO needs every check true. NO-GO = a check failed. INCOMPLETE = evidence missing (cannot be GO). A hard zero blocks a stage until root-caused and re-run.

| stage | verdict |
|---|---|
| 1: Resolver on Playwright semantics (S2) | **NO-GO** |
| 2: Outline rendering (S1) | **INCOMPLETE** |
| 3: Sanitized AI-snapshot perception and synthesis (S3) | **NO-GO** |
| 4: Set-of-Marks screenshot (S4); a GO means taking it to the ADR and Security & Compliance, not into the product | **NO-GO** |

### Stage 1: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 240/240 tasks finished |
| no unresolved infrastructure errors (S2, A1) | MISSING | 12 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S2 > A1: lower bound of the bootstrap CI above 0 | pass | diff 27.3% CI [21.6%, 33.3%], McNemar p=0.0000 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S2) | FAIL | 4 found (23 wrong-element ACTIONs incl. refused); e.g. neg-wiki-02|0|S2|1|1, neg-wiki-02|0|S2|2|1, neg-gov-02|0|S2|1|1 |
| HZ-2 no wrong-unique durability result (S2) | MISSING | durability not run |
| HZ-3 no leak in harness outputs or the S2 payload | pass | 0 blocking (harness-level 0, S2 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 2894 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | pass | hostile 20/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S2) | MISSING | durability engine check not run |

### Stage 2: INCOMPLETE

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 240/240 tasks finished |
| no unresolved infrastructure errors (S1, A1) | MISSING | 6 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S1 not worse than A1: lower bound of the CI for S1 - A1 success >= -3 pp | pass | diff 2.9% CI [0.4%, 5.5%], McNemar p=0.0654 |
| S1 cheaper: upper bound of the 95% cluster-bootstrap CI of summed prompt tokens S1/A1 below 1 | pass | ratio 0.363 CI [0.345, 0.382] over 204 tasks |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S1) | pass | 0 found (15 wrong-element ACTIONs incl. refused) |
| HZ-2 no wrong-unique durability result (S1) | MISSING | durability not run |
| HZ-3 no leak in harness outputs or the S1 payload | pass | 0 blocking (harness-level 0, S1 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 2894 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | pass | hostile 20/20, injected 15/15 |

### Stage 3: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 240/240 tasks finished |
| no unresolved infrastructure errors (S3, S2) | MISSING | 9 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S3 > S2 (primary): lower bound of the bootstrap CI above 0 | pass | diff 34.3% CI [27.6%, 40.9%], McNemar p=0.0000 |
| chain stratum evidenced for S3 | pass | 84 chain trials |
| every S3 request admitted under planned limits (observation <= 40,000 bytes, request <= 262,144 bytes) | pass | 595/595 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S3) | FAIL | 11 found (16 wrong-element ACTIONs incl. refused); e.g. neg-pydocs-01|0|S3|1|1, neg-pydocs-01|0|S3|2|1, ol-sel-01|0|S3|2|1 |
| HZ-2 no wrong-unique durability result (S3) | MISSING | durability not run |
| HZ-3 no leak in harness outputs or the S3 payload | pass | 0 blocking (harness-level 0, S3 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 2894 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | pass | hostile 20/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S3) | MISSING | durability engine check not run |

### Stage 4: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum on the visual strata (>= min(planned, 24)) | pass | 240/240 tasks finished |
| no unresolved infrastructure errors (S4, S3) | pass | none |
| S4 > S3 on the visual stratum (visualOnlyField + iconOnly): lower bound of the CI above 0 | FAIL | 28 units, diff -53.6% CI [-71.4%, -35.7%], McNemar p=0.0001 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S4) | pass | 0 found (4 wrong-element ACTIONs incl. refused) |
| HZ-2 no wrong-unique durability result (S4) | MISSING | durability not run |
| HZ-3 no leak in harness outputs or the S4 payload | pass | 0 blocking (harness-level 0, S4 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 2894 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | pass | hostile 20/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S4) | MISSING | durability engine check not run |

## Method notes

- Identity is the CDP backendNodeId; the GT is re-resolved with its own Playwright chain and the step is VOID on a load unless it is unique.
- Primary metric: first attempt, ACTION on the GT element with an executable locator. McNemar unit = (task, step), success = a strict majority of reps (2 of 3), or in the 4-hour profile ALL of the arm's reps. Effect and CI: success rate over (task, step, rep), 10,000-resample task-cluster bootstrap, seeded.
- HZ-1: an ACTION on a wrong element (or any ACTION on a negative) that the arm's gates admit with an executable locator, at any attempt, or any COMPLETE (gated or not). Every wrong-element ACTION, admitted or refused, is also counted.
- Infrastructure errors (HTTP 429/5xx, connection, timeout, failed shared SOURCE_PLAN) are excluded from every denominator and listed separately; a resumed run re-attempts them. OBSERVE_ERROR, PLAN_INVALID, OVER_CAP and a 200 reply that is not parsable JSON stay in the denominators as failures; EMPTIED (A0) is a failure without a model call.
- Click-like steps (click, press, check, uncheck): a pick inside the GT element with no interactive element between it and the GT is EQUIVALENT_DESCENDANT and counts as correct; ancestors never do. The strictEquality sensitivity row removes that credit.
- Production admission for A1, S1 and S2 excludes the 50 ms collection time limit (they collect with lifted limits); A0 runs under the real limits and carries the real-limit outcome (EMPTIED).
- Next-day durability is measured from the END of the full run (run.json endedAt).
- Leak hits are attributed to the arm whose payload held them (body files via calls.jsonl labels, per-arm jsonl lines by key); unattributed hits are harness-level and block every stage; A0/A1 hits are production findings outside SPK-07 gating.
- Durability skips locators that were already the wrong element at freeze (counted as HZ-1) unless the run used --include-wrong.
- Stage 2: S1 not worse = lower bound of the S1 - A1 CI >= -3 pp; cheaper = upper bound of the summed prompt-token ratio S1/A1 CI < 1. Stage 4: lower bound above 0 on visualOnlyField + iconOnly; a positive estimate whose CI includes 0 is inconclusive and a no-go.
- Positional and non-exact locator flags in the strict-locator sensitivity are heuristics on the locator JSON (nth/first/last, missing exact:true, case-insensitive selector flag).

