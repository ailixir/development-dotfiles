# SPK-07 grounding benchmark report

**POST-HOC**: this run was decided and assembled after earlier results were seen; it is not a pre-registered confirmatory run.

> **Screening evidence — not ADR-SC-005 D-C evidence**

## Run

| Field | Value |
|---|---|
| runId | final-s3v2-20261027 |
| seed | 20261026 |
| arms | A0, A1, S1, S2, S3 |
| reps | 3 |
| started | 2026-10-26T19:11:21.563Z |
| node / playwright | v24.20.0 / 1.63.0 |
| model versions seen | gemini-3.8-flash |
| caps | {"SPK07_MAX_CALLS":"4500","SPK07_MAX_PROMPT_TOKENS_TOTAL":"60000000","maxPromptTokensPerCall":"gateway input cap 262144 bytes"} |
| rows (attempt 1 / all) | 1765 / 2196 |
| VOID entries | 17 by reason {"GT_ABSENT":10,"LOAD_FAILED":4,"PRIOR_STEP_VOID":3}; by stratum {"uniqueNav":4,"random":2,"selectCheck":2,"negative":1,"assertTarget":2,"chain":6} |
| run ended (durability next-day clock) | 2026-10-26T23:29:27.409Z |
| seeds | run seed 20261026; arm order: per task: shuffle seeded by sha256(runSeed|taskId); bootstrap seeds {"primary":1379507090,"s2VsA1":1314839406,"s1VsA1":1037629093,"s4VsS3Visual":null,"tokenRatioS1A1":3476672992} |
| EMPTIED / errors | 174 / 0 |
| postHoc | true |
| assembledFrom | {"base":"final-20261026","s3v2":"s3v2-20261027","wave2":"wave2-20261027","freshOnly":false,"note":"post-hoc S3 v2: wave-1 A0/A1/S1/S2 from base, S3 re-run on wave-1 tasks, all arms (no S4) on wave-2 tasks; neg-gov-02 taken from the wave-2 run only; safety.json/leakscan.json are from the s3v2 run"} |

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

231 of 298 planned tasks finished; rows of unfinished tasks are excluded from every denominator. Minimum for a stage verdict: every stratum min(planned, 8) finished tasks and the visual strata together min(planned, 24).

| stratum | planned | finished |
|---|---|---|
| labeledField | 19 | 14 |
| selectCheck | 23 | 18 |
| duplicateNeedsContext | 39 | 31 |
| uniqueNav | 29 | 23 |
| iconOnly | 18 | 14 |
| readTarget | 19 | 16 |
| assertTarget | 19 | 15 |
| chain | 19 | 14 |
| fixtureRegression | 15 | 11 |
| menuNameDiffers | 16 | 12 |
| visualOnlyField | 17 | 13 |
| negative | 25 | 21 |
| random | 40 | 29 |

Unfinished tasks (67): arxiv-field-04, arxiv-sel-05, arxiv-dup-01, arxiv-dup-03, arxiv-nav-04, arxiv-icon-01, arxiv-icon-02, arxiv-assert-03, arxiv-chain-01, fx-c05, fx-c13, fx-q2, fx-c11, govuk-menu-01, govuk-menu-02, govuk-menu-03, govuk-menu-04, govuk-sel-04, govuk-read-04, govuk-assert-04, govuk-chain-02, govuk-chain-04, gut-field-01, gut-nav-06, gut-dup-01, gut-dup-06, gut-icon-03, gut-read-04, hn-vis-02, hn-vis-03, hn-vis-04, hn-vis-05, hn-chain-02, neg-hn-01, neg-hn-02, neg-hn-04, neg-gov-03, ol-nav-01, pydocs-field-01, pydocs-dup-07, pyorg-assert-02, rfc-field-01, rfc-sel-06, rfc-icon-01, rfc-dup-01, rfc-nav-01, steam-nav-04, usa-nav-01, wx-field-02, wx-sel-01, wx-dup-03, wx-read-01, wiki-dup-02, wiki-sel-03, wiki-assert-03, wiki-chain-02, rnd-006, rnd-007, rnd-009, rnd-010, rnd-011, rnd-015, rnd-017, rnd-021, rnd-025, rnd-027, rnd-033

| arm | reps used | steps with rows | tasks |
|---|---|---|---|
| A0 | 1 | 253 | 230 |
| A1 | 1 | 253 | 230 |
| S1 | 1 | 253 | 230 |
| S2 | 2 | 253 | 230 |
| S3 | 2 | 251 | 228 |

4-hour profile (preregistration section 14, entry 6): McNemar unit = success only if ALL of that arm's reps succeed; A0 is derived from A1 (68 derived, 174 emptied, 11 own calls because the request bodies differed, 0 unresolved of 253); PRODUCT_REFUSED_GATEWAY_CAP rows (request over 262,144 bytes): {"A0":0,"A1":19,"S1":0,"S2":0,"S3":0}.

## Unresolved infrastructure errors (excluded from every denominator)

12 rows are still unresolved (0 from a failed shared SOURCE_PLAN). They are not arm failures and are not counted in any rate or comparison below. Rerun with the same RUN_DIR to re-attempt them; stage verdicts that depend on these arms stay INCOMPLETE until then.

| arm | unresolved rows |
|---|---|
| S2 | 6 |
| A1 | 2 |
| S1 | 2 |
| S3 | 2 |

By HTTP status: {"0":7,"429":5}; by task: {"ol-field-01":1,"wx-nav-03":1,"wiki-vis-01":1,"govuk-chain-03":1,"rfc-field-02":1,"rnd-026":1,"rnd-035":1,"wx-nav-01":1,"rnd-029":1,"gut-chain-02":1,"arxiv-chain-02":1,"arxiv-nav-01":1}

## Per arm and stratum (answerable steps; rep-level trials, first attempt)

Cells are k/n (rate [Wilson 95%]). Success = ACTION on the GT element with an executable locator, first attempt, no gate required (primary metric). Product-admitted success also needs the arm's gates (harness gate codes, Java verdict where scored). Descriptive per stratum; decisions use the paired comparisons below.

### A0 (derived from A1 when the request bodies are byte-identical; EMPTIED when emptied)

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 230 | 37/230 (16.1% [11.9%, 21.4%]) | 23/230 (10.0% [6.8%, 14.6%]) | 23/230 (10.0% [6.8%, 14.6%]) | 23/230 (10.0% [6.8%, 14.6%]) | 23/230 (10.0% [6.8%, 14.6%]) | 35/230 (15.2% [11.1%, 20.4%]) | 0/230 (0.0% [0.0%, 1.6%]) | 0 | 7/23 (conf. wrong 0) | 0 | 158/0 |
| assertTarget | 15 | 1/15 (6.7% [1.2%, 29.8%]) | 1/15 (6.7% [1.2%, 29.8%]) | 1/15 (6.7% [1.2%, 29.8%]) | 1/15 (6.7% [1.2%, 29.8%]) | 1/15 (6.7% [1.2%, 29.8%]) | 2/15 (13.3% [3.7%, 37.9%]) | 0/15 (0.0% [0.0%, 20.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 12/0 |
| chain | 37 | 5/37 (13.5% [5.9%, 28.0%]) | 2/37 (5.4% [1.5%, 17.7%]) | 2/37 (5.4% [1.5%, 17.7%]) | 2/37 (5.4% [1.5%, 17.7%]) | 2/37 (5.4% [1.5%, 17.7%]) | 10/37 (27.0% [15.4%, 43.0%]) | 0/37 (0.0% [0.0%, 9.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 22/0 |
| duplicateNeedsContext | 31 | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 5/31 (16.1% [7.1%, 32.6%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 26/0 |
| fixtureRegression | 9 | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 2/2 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 1/14 (7.1% [1.3%, 31.5%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 13/0 |
| labeledField | 14 | 4/14 (28.6% [11.7%, 54.6%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 2/14 (14.3% [4.0%, 39.9%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 8/0 |
| menuNameDiffers | 12 | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 3/12 (25.0% [8.9%, 53.2%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 0/0 (conf. wrong 0) | 0 | 9/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 5/21 (conf. wrong 0) | 0 | 0/0 |
| random | 28 | 8/28 (28.6% [15.3%, 47.1%]) | 4/28 (14.3% [5.7%, 31.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 16/0 |
| readTarget | 16 | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 1/16 (6.3% [1.1%, 28.3%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 15/0 |
| selectCheck | 18 | 3/18 (16.7% [5.8%, 39.2%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 1/18 (5.6% [1.0%, 25.8%]) | 2/18 (11.1% [3.1%, 32.8%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 13/0 |
| uniqueNav | 23 | 7/23 (30.4% [15.6%, 50.9%]) | 4/23 (17.4% [7.0%, 37.1%]) | 4/23 (17.4% [7.0%, 37.1%]) | 4/23 (17.4% [7.0%, 37.1%]) | 4/23 (17.4% [7.0%, 37.1%]) | 0/23 (0.0% [0.0%, 14.3%]) | 0/23 (0.0% [0.0%, 14.3%]) | 0 | 0/0 (conf. wrong 0) | 0 | 16/0 |
| visualOnlyField | 13 | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 5/13 (38.5% [17.7%, 64.5%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 8/0 |

### A1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 230 | 102/230 (44.3% [38.1%, 50.8%]) | 50/230 (21.7% [16.9%, 27.5%]) | 47/230 (20.4% [15.7%, 26.1%]) | 26/230 (11.3% [7.8%, 16.0%]) | 46/230 (20.0% [15.3%, 25.6%]) | 102/230 (44.3% [38.1%, 50.8%]) | 0/230 (0.0% [0.0%, 1.6%]) | 5 | 17/23 (conf. wrong 0) | 1 | 0/17 |
| assertTarget | 15 | 4/15 (26.7% [10.9%, 52.0%]) | 2/15 (13.3% [3.7%, 37.9%]) | 2/15 (13.3% [3.7%, 37.9%]) | 1/15 (6.7% [1.2%, 29.8%]) | 2/15 (13.3% [3.7%, 37.9%]) | 9/15 (60.0% [35.7%, 80.2%]) | 0/15 (0.0% [0.0%, 20.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/1 |
| chain | 37 | 16/37 (43.2% [28.7%, 59.1%]) | 8/37 (21.6% [11.4%, 37.2%]) | 6/37 (16.2% [7.7%, 31.1%]) | 3/37 (8.1% [2.8%, 21.3%]) | 6/37 (16.2% [7.7%, 31.1%]) | 16/37 (43.2% [28.7%, 59.1%]) | 0/37 (0.0% [0.0%, 9.4%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| duplicateNeedsContext | 31 | 7/31 (22.6% [11.4%, 39.8%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0/31 (0.0% [0.0%, 11.0%]) | 21/31 (67.7% [50.1%, 81.4%]) | 0/31 (0.0% [0.0%, 11.0%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| fixtureRegression | 9 | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 6/9 (66.7% [35.4%, 87.9%]) | 9/9 (100.0% [70.1%, 100.0%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 2/2 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 9/14 (64.3% [38.8%, 83.7%]) | 3/14 (21.4% [7.6%, 47.6%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 3/14 (21.4% [7.6%, 47.6%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/1 |
| labeledField | 14 | 9/14 (64.3% [38.8%, 83.7%]) | 5/14 (35.7% [16.3%, 61.2%]) | 5/14 (35.7% [16.3%, 61.2%]) | 3/14 (21.4% [7.6%, 47.6%]) | 5/14 (35.7% [16.3%, 61.2%]) | 4/14 (28.6% [11.7%, 54.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/1 |
| menuNameDiffers | 12 | 5/12 (41.7% [19.3%, 68.0%]) | 1/12 (8.3% [1.5%, 35.4%]) | 1/12 (8.3% [1.5%, 35.4%]) | 0/12 (0.0% [0.0%, 24.2%]) | 1/12 (8.3% [1.5%, 35.4%]) | 5/12 (41.7% [19.3%, 68.0%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 15/21 (conf. wrong 0) | 0 | 0/0 |
| random | 28 | 16/28 (57.1% [39.1%, 73.5%]) | 6/28 (21.4% [10.2%, 39.5%]) | 6/28 (21.4% [10.2%, 39.5%]) | 4/28 (14.3% [5.7%, 31.5%]) | 5/28 (17.9% [7.9%, 35.6%]) | 9/28 (32.1% [17.9%, 50.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/2 |
| readTarget | 16 | 1/16 (6.3% [1.1%, 28.3%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 13/16 (81.3% [57.0%, 93.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/2 |
| selectCheck | 18 | 7/18 (38.9% [20.3%, 61.4%]) | 5/18 (27.8% [12.5%, 50.9%]) | 5/18 (27.8% [12.5%, 50.9%]) | 3/18 (16.7% [5.8%, 39.2%]) | 5/18 (27.8% [12.5%, 50.9%]) | 8/18 (44.4% [24.6%, 66.3%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/3 |
| uniqueNav | 23 | 19/23 (82.6% [62.9%, 93.0%]) | 10/23 (43.5% [25.6%, 63.2%]) | 10/23 (43.5% [25.6%, 63.2%]) | 6/23 (26.1% [12.5%, 46.5%]) | 10/23 (43.5% [25.6%, 63.2%]) | 3/23 (13.0% [4.5%, 32.1%]) | 0/23 (0.0% [0.0%, 14.3%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/1 |
| visualOnlyField | 13 | 0/13 (0.0% [0.0%, 22.8%]) | 1/13 (7.7% [1.4%, 33.3%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 11/13 (84.6% [57.8%, 95.7%]) | 0/13 (0.0% [0.0%, 22.8%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 230 | 105/230 (45.7% [39.3%, 52.1%]) | 54/230 (23.5% [18.5%, 29.4%]) | 52/230 (22.6% [17.7%, 28.4%]) | 26/230 (11.3% [7.8%, 16.0%]) | 52/230 (22.6% [17.7%, 28.4%]) | 117/230 (50.9% [44.4%, 57.3%]) | 0/230 (0.0% [0.0%, 1.6%]) | 5 | 18/23 (conf. wrong 0) | 3 | 0/0 |
| assertTarget | 15 | 4/15 (26.7% [10.9%, 52.0%]) | 2/15 (13.3% [3.7%, 37.9%]) | 2/15 (13.3% [3.7%, 37.9%]) | 1/15 (6.7% [1.2%, 29.8%]) | 2/15 (13.3% [3.7%, 37.9%]) | 10/15 (66.7% [41.7%, 84.8%]) | 0/15 (0.0% [0.0%, 20.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 37 | 17/37 (45.9% [31.0%, 61.6%]) | 8/37 (21.6% [11.4%, 37.2%]) | 7/37 (18.9% [9.5%, 34.2%]) | 3/37 (8.1% [2.8%, 21.3%]) | 7/37 (18.9% [9.5%, 34.2%]) | 19/37 (51.4% [35.9%, 66.6%]) | 0/37 (0.0% [0.0%, 9.4%]) | 1 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| duplicateNeedsContext | 31 | 7/31 (22.6% [11.4%, 39.8%]) | 1/31 (3.2% [0.6%, 16.2%]) | 1/31 (3.2% [0.6%, 16.2%]) | 0/31 (0.0% [0.0%, 11.0%]) | 1/31 (3.2% [0.6%, 16.2%]) | 24/31 (77.4% [60.2%, 88.6%]) | 0/31 (0.0% [0.0%, 11.0%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| fixtureRegression | 9 | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 9/9 (100.0% [70.1%, 100.0%]) | 6/9 (66.7% [35.4%, 87.9%]) | 9/9 (100.0% [70.1%, 100.0%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 2/2 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 14 | 9/14 (64.3% [38.8%, 83.7%]) | 5/14 (35.7% [16.3%, 61.2%]) | 5/14 (35.7% [16.3%, 61.2%]) | 0/14 (0.0% [0.0%, 21.5%]) | 5/14 (35.7% [16.3%, 61.2%]) | 4/14 (28.6% [11.7%, 54.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| labeledField | 14 | 11/14 (78.6% [52.4%, 92.4%]) | 7/14 (50.0% [26.8%, 73.2%]) | 7/14 (50.0% [26.8%, 73.2%]) | 4/14 (28.6% [11.7%, 54.6%]) | 7/14 (50.0% [26.8%, 73.2%]) | 3/14 (21.4% [7.6%, 47.6%]) | 0/14 (0.0% [0.0%, 21.5%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 12 | 6/12 (50.0% [25.4%, 74.6%]) | 1/12 (8.3% [1.5%, 35.4%]) | 1/12 (8.3% [1.5%, 35.4%]) | 0/12 (0.0% [0.0%, 24.2%]) | 1/12 (8.3% [1.5%, 35.4%]) | 6/12 (50.0% [25.4%, 74.6%]) | 0/12 (0.0% [0.0%, 24.2%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 1 | 16/21 (conf. wrong 0) | 0 | 0/0 |
| random | 28 | 13/28 (46.4% [29.5%, 64.2%]) | 5/28 (17.9% [7.9%, 35.6%]) | 5/28 (17.9% [7.9%, 35.6%]) | 4/28 (14.3% [5.7%, 31.5%]) | 5/28 (17.9% [7.9%, 35.6%]) | 14/28 (50.0% [32.6%, 67.4%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 1 | 0/0 |
| readTarget | 16 | 2/16 (12.5% [3.5%, 36.0%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 13/16 (81.3% [57.0%, 93.4%]) | 0/16 (0.0% [0.0%, 19.4%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 18 | 8/18 (44.4% [24.6%, 66.3%]) | 6/18 (33.3% [16.3%, 56.3%]) | 6/18 (33.3% [16.3%, 56.3%]) | 3/18 (16.7% [5.8%, 39.2%]) | 6/18 (33.3% [16.3%, 56.3%]) | 10/18 (55.6% [33.7%, 75.4%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 23 | 19/23 (82.6% [62.9%, 93.0%]) | 9/23 (39.1% [22.2%, 59.2%]) | 9/23 (39.1% [22.2%, 59.2%]) | 5/23 (21.7% [9.7%, 41.9%]) | 9/23 (39.1% [22.2%, 59.2%]) | 4/23 (17.4% [7.0%, 37.1%]) | 0/23 (0.0% [0.0%, 14.3%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 13 | 0/13 (0.0% [0.0%, 22.8%]) | 1/13 (7.7% [1.4%, 33.3%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 10/13 (76.9% [49.7%, 91.8%]) | 0/13 (0.0% [0.0%, 22.8%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S2

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 460 | 212/460 (46.1% [41.6%, 50.7%]) | 206/460 (44.8% [40.3%, 49.4%]) | 201/460 (43.7% [39.2%, 48.3%]) | 88/460 (19.1% [15.8%, 23.0%]) | 194/460 (42.2% [37.7%, 46.7%]) | 234/460 (50.9% [46.3%, 55.4%]) | 0/460 (0.0% [0.0%, 0.8%]) | 8 | 36/46 (conf. wrong 2) | 4 | 0/0 |
| assertTarget | 30 | 8/30 (26.7% [14.2%, 44.4%]) | 8/30 (26.7% [14.2%, 44.4%]) | 8/30 (26.7% [14.2%, 44.4%]) | 4/30 (13.3% [5.3%, 29.7%]) | 8/30 (26.7% [14.2%, 44.4%]) | 20/30 (66.7% [48.8%, 80.8%]) | 0/30 (0.0% [0.0%, 11.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 74 | 34/74 (45.9% [35.1%, 57.2%]) | 32/74 (43.2% [32.6%, 54.6%]) | 30/74 (40.5% [30.1%, 51.9%]) | 14/74 (18.9% [11.6%, 29.3%]) | 29/74 (39.2% [28.9%, 50.6%]) | 38/74 (51.4% [40.2%, 62.4%]) | 0/74 (0.0% [0.0%, 4.9%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 62 | 9/62 (14.5% [7.8%, 25.3%]) | 6/62 (9.7% [4.5%, 19.5%]) | 6/62 (9.7% [4.5%, 19.5%]) | 0/62 (0.0% [0.0%, 5.8%]) | 6/62 (9.7% [4.5%, 19.5%]) | 52/62 (83.9% [72.8%, 91.0%]) | 0/62 (0.0% [0.0%, 5.8%]) | 1 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| fixtureRegression | 18 | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 12/18 (66.7% [43.7%, 83.7%]) | 18/18 (100.0% [82.4%, 100.0%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 4/4 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 28 | 19/28 (67.9% [49.3%, 82.1%]) | 17/28 (60.7% [42.4%, 76.4%]) | 17/28 (60.7% [42.4%, 76.4%]) | 0/28 (0.0% [0.0%, 12.1%]) | 15/28 (53.6% [35.8%, 70.5%]) | 7/28 (25.0% [12.7%, 43.4%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| labeledField | 28 | 22/28 (78.6% [60.5%, 89.8%]) | 22/28 (78.6% [60.5%, 89.8%]) | 22/28 (78.6% [60.5%, 89.8%]) | 14/28 (50.0% [32.6%, 67.4%]) | 22/28 (78.6% [60.5%, 89.8%]) | 6/28 (21.4% [10.2%, 39.5%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 24 | 13/24 (54.2% [35.1%, 72.1%]) | 13/24 (54.2% [35.1%, 72.1%]) | 13/24 (54.2% [35.1%, 72.1%]) | 0/24 (0.0% [0.0%, 13.8%]) | 13/24 (54.2% [35.1%, 72.1%]) | 11/24 (45.8% [27.9%, 64.9%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 2 | 32/42 (conf. wrong 2) | 0 | 0/0 |
| random | 56 | 30/56 (53.6% [40.7%, 66.0%]) | 30/56 (53.6% [40.7%, 66.0%]) | 30/56 (53.6% [40.7%, 66.0%]) | 12/56 (21.4% [12.7%, 33.8%]) | 30/56 (53.6% [40.7%, 66.0%]) | 24/56 (42.9% [30.8%, 55.9%]) | 0/56 (0.0% [0.0%, 6.4%]) | 0 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| readTarget | 32 | 3/32 (9.4% [3.2%, 24.2%]) | 1/32 (3.1% [0.6%, 15.7%]) | 1/32 (3.1% [0.6%, 15.7%]) | 0/32 (0.0% [0.0%, 10.7%]) | 0/32 (0.0% [0.0%, 10.7%]) | 29/32 (90.6% [75.8%, 96.8%]) | 0/32 (0.0% [0.0%, 10.7%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 36 | 16/36 (44.4% [29.5%, 60.4%]) | 16/36 (44.4% [29.5%, 60.4%]) | 16/36 (44.4% [29.5%, 60.4%]) | 8/36 (22.2% [11.7%, 38.1%]) | 15/36 (41.7% [27.1%, 57.8%]) | 20/36 (55.6% [39.6%, 70.5%]) | 0/36 (0.0% [0.0%, 9.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 46 | 40/46 (87.0% [74.3%, 93.9%]) | 40/46 (87.0% [74.3%, 93.9%]) | 40/46 (87.0% [74.3%, 93.9%]) | 24/46 (52.2% [38.1%, 65.9%]) | 38/46 (82.6% [69.3%, 90.9%]) | 6/46 (13.0% [6.1%, 25.7%]) | 0/46 (0.0% [0.0%, 7.7%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 26 | 0/26 (0.0% [0.0%, 12.9%]) | 3/26 (11.5% [4.0%, 29.0%]) | 0/26 (0.0% [0.0%, 12.9%]) | 0/26 (0.0% [0.0%, 12.9%]) | 0/26 (0.0% [0.0%, 12.9%]) | 21/26 (80.8% [62.1%, 91.5%]) | 0/26 (0.0% [0.0%, 12.9%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S3

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 454 | 389/454 (85.7% [82.2%, 88.6%]) | 388/454 (85.5% [81.9%, 88.4%]) | 379/454 (83.5% [79.8%, 86.6%]) | 269/454 (59.3% [54.7%, 63.7%]) | 373/454 (82.2% [78.4%, 85.4%]) | 44/454 (9.7% [7.3%, 12.8%]) | 2/454 (0.4% [0.1%, 1.6%]) | 17 | 36/46 (conf. wrong 3) | 9 | 0/0 |
| assertTarget | 28 | 20/28 (71.4% [52.9%, 84.7%]) | 24/28 (85.7% [68.5%, 94.3%]) | 20/28 (71.4% [52.9%, 84.7%]) | 11/28 (39.3% [23.6%, 57.6%]) | 20/28 (71.4% [52.9%, 84.7%]) | 1/28 (3.6% [0.6%, 17.7%]) | 2/28 (7.1% [2.0%, 22.6%]) | 5 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 73 | 67/73 (91.8% [83.2%, 96.2%]) | 67/73 (91.8% [83.2%, 96.2%]) | 65/73 (89.0% [79.8%, 94.3%]) | 37/73 (50.7% [39.5%, 61.8%]) | 64/73 (87.7% [78.2%, 93.4%]) | 4/73 (5.5% [2.2%, 13.3%]) | 0/73 (0.0% [0.0%, 5.0%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 62 | 59/62 (95.2% [86.7%, 98.3%]) | 59/62 (95.2% [86.7%, 98.3%]) | 59/62 (95.2% [86.7%, 98.3%]) | 54/62 (87.1% [76.6%, 93.3%]) | 58/62 (93.5% [84.6%, 97.5%]) | 3/62 (4.8% [1.7%, 13.3%]) | 0/62 (0.0% [0.0%, 5.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| fixtureRegression | 18 | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 14/18 (77.8% [54.8%, 91.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 4/4 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 28 | 24/28 (85.7% [68.5%, 94.3%]) | 20/28 (71.4% [52.9%, 84.7%]) | 20/28 (71.4% [52.9%, 84.7%]) | 0/28 (0.0% [0.0%, 12.1%]) | 22/28 (78.6% [60.5%, 89.8%]) | 2/28 (7.1% [2.0%, 22.6%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 7 | 0/0 |
| labeledField | 28 | 26/28 (92.9% [77.4%, 98.0%]) | 26/28 (92.9% [77.4%, 98.0%]) | 26/28 (92.9% [77.4%, 98.0%]) | 20/28 (71.4% [52.9%, 84.7%]) | 26/28 (92.9% [77.4%, 98.0%]) | 2/28 (7.1% [2.0%, 22.6%]) | 0/28 (0.0% [0.0%, 12.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 24 | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 24/24 (100.0% [86.2%, 100.0%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0/24 (0.0% [0.0%, 13.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 4 | 32/42 (conf. wrong 3) | 0 | 0/0 |
| random | 56 | 42/56 (75.0% [62.3%, 84.5%]) | 42/56 (75.0% [62.3%, 84.5%]) | 42/56 (75.0% [62.3%, 84.5%]) | 34/56 (60.7% [47.6%, 72.4%]) | 42/56 (75.0% [62.3%, 84.5%]) | 12/56 (21.4% [12.7%, 33.8%]) | 0/56 (0.0% [0.0%, 6.4%]) | 0 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| readTarget | 32 | 13/32 (40.6% [25.5%, 57.7%]) | 15/32 (46.9% [30.9%, 63.6%]) | 13/32 (40.6% [25.5%, 57.7%]) | 4/32 (12.5% [5.0%, 28.1%]) | 8/32 (25.0% [13.3%, 42.1%]) | 14/32 (43.8% [28.2%, 60.7%]) | 0/32 (0.0% [0.0%, 10.7%]) | 5 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 34 | 31/34 (91.2% [77.0%, 97.0%]) | 32/34 (94.1% [80.9%, 98.4%]) | 31/34 (91.2% [77.0%, 97.0%]) | 22/34 (64.7% [47.9%, 78.5%]) | 30/34 (88.2% [73.4%, 95.3%]) | 2/34 (5.9% [1.6%, 19.1%]) | 0/34 (0.0% [0.0%, 10.2%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 45 | 45/45 (100.0% [92.1%, 100.0%]) | 45/45 (100.0% [92.1%, 100.0%]) | 45/45 (100.0% [92.1%, 100.0%]) | 45/45 (100.0% [92.1%, 100.0%]) | 45/45 (100.0% [92.1%, 100.0%]) | 0/45 (0.0% [0.0%, 7.9%]) | 0/45 (0.0% [0.0%, 7.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 26 | 20/26 (76.9% [57.9%, 89.0%]) | 16/26 (61.5% [42.5%, 77.6%]) | 16/26 (61.5% [42.5%, 77.6%]) | 4/26 (15.4% [6.2%, 33.5%]) | 16/26 (61.5% [42.5%, 77.6%]) | 4/26 (15.4% [6.2%, 33.5%]) | 0/26 (0.0% [0.0%, 12.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

## Paired comparisons (correct-and-executable per step, answerable tasks)

Unit = task step, outcome = majority over reps. McNemar is exact two-sided on discordant units (only-X/only-Y). Sensitivity pairs every rep. Bootstrap = 10,000 task-cluster resamples, seeded, 95% percentile CI of rate(X) - rate(Y).

| X vs Y | units | only X / only Y | McNemar p | all-reps p (b/c) | diff [95% CI] | rates |
|---|---|---|---|---|---|---|
| **PRIMARY** S3 vs S2 | 228 | 93/4 | 0.0000 | 0.0000 (187/8) | 39.4% [33.0%, 46.1%] | 81.6% vs 42.5% |
| S2 vs A1 | 230 | 51/1 | 0.0000 | 0.0000 (53/1) | 23.3% [17.9%, 28.8%] | 42.2% vs 20.4% |
| S1 vs A1 (format effect) | 230 | 7/2 | 0.1797 | 0.1797 (7/2) | 2.2% [-0.4%, 4.8%] | 22.6% vs 20.4% |
| S4 vs S3 on visualOnlyField + iconOnly | - | - | - | - | - | not run |

### Sensitivity (reported, never gating): diff [95% CI] (units)

| comparison | admitted | afterReask | realSitesOnly | heldOutOnly | freshSitesOnly | strictLocators | strictEquality |
|---|---|---|---|---|---|---|---|
| S3 vs S2 | 40.0% [33.6%, 46.6%] (228) | 39.6% [33.3%, 46.1%] (228) | 41.0% [34.3%, 47.8%] (219) | 40.0% [31.9%, 48.1%] (141) | 36.8% [25.0%, 49.1%] (57) | 31.0% [24.4%, 37.9%] (228) | 38.3% [31.5%, 45.2%] (228) |
| S2 vs A1 | 7.8% [4.6%, 11.4%] (230) | 22.2% [17.0%, 27.6%] (230) | 24.2% [18.6%, 30.0%] (221) | 18.9% [12.7%, 25.5%] (143) | 13.2% [5.6%, 21.7%] (57) | 23.3% [17.9%, 28.8%] (230) | 22.8% [17.6%, 28.4%] (230) |
| S1 vs A1 | 0.0% [-1.3%, 1.3%] (230) | 2.6% [0.4%, 5.2%] (230) | 2.3% [-0.4%, 5.0%] (221) | 2.1% [-1.4%, 5.8%] (143) | 3.5% [0.0%, 9.1%] (57) | 2.2% [-0.4%, 4.8%] (230) | 1.3% [-0.9%, 3.6%] (230) |
| S4 vs S3 (visual) | - | - | - | - | - | - | - |

Summed prompt-token ratio S1/A1: 0.380, 95% cluster-bootstrap CI [0.360, 0.402] over 204 tasks.

## Absolute bar

Reference 97.0% per step (D-C 90% workflow completion implies 0.97^5 = 85.9%).

| arm | per-step correct-and-executable | implied 5-step completion | 5-step at Wilson lower bound |
|---|---|---|---|
| A0 | 10.0% | 0.0% | 0.0% |
| A1 | 20.4% | 0.0% | 0.0% |
| S1 | 22.6% | 0.1% | 0.0% |
| S2 | 43.7% | 1.6% | 0.9% |
| S3 | 83.5% | 40.5% | 32.3% |

## Tokens, latency, admission

Tokens are real Gemini `usageMetadata` (first attempt). Admission: production limits and the gateway cap are per observation; the planned-limits column is per request (every S3 request must pass for Stage 3).

| arm | calls | prompt p50 | prompt p95 | prompt mean | out mean | thoughts mean | model ms p50/p95 | observe ms p50/p95 | obs bytes p50/p95 |
|---|---|---|---|---|---|---|---|---|---|
| A0 | 11 | 16558 | 16896 | 16171 | 155 | 76 | 3277/24697 | 26/56 | 400/32241 |
| A1 | 226 | 22338 | 50731 | 25300 | 219 | 41 | 4179/49692 | 26/569 | 48118/686132 |
| S1 | 245 | 9409 | 46782 | 13280 | 194 | 0 | 3479/64190 | 27/526 | 5521/77691 |
| S2 | 490 | 9689 | 57967 | 14210 | 194 | 2 | 3758/63879 | 26/530 | 5886/100898 |
| S3 | 486 | 10992 | 19314 | 11565 | 208 | 21 | 8934/119641 | 82/866 | 12880/36532 |
| SP | 295 | 6159 | 6614 | n/a | n/a | n/a | 3361/36142 | n/a/n/a | n/a/n/a |

| arm | observations | production limits (A0-S2: nodes/bytes/depth + gateway + translation caps) | gateway cap 262,144 | translation cap 65,536 (wire + 2048) | max translation input bytes | requests under planned limits (obs <= 40,000 B and body <= 262,144 B) |
|---|---|---|---|---|---|---|
| A0 | 253 | 79/253 (31.2% [25.8%, 37.2%]) | 79/253 (31.2% [25.8%, 37.2%]) | 79/253 (31.2% [25.8%, 37.2%]) | 58089 | 86/86 (100.0% [95.7%, 100.0%]) |
| A1 | 253 | 76/253 (30.0% [24.7%, 36.0%]) | 233/253 (92.1% [88.1%, 94.8%]) | 95/253 (37.5% [31.8%, 43.7%]) | 1659915 | 111/305 (36.4% [31.2%, 41.9%]) |
| S1 | 253 | 76/253 (30.0% [24.7%, 36.0%]) | 253/253 (100.0% [98.5%, 100.0%]) | 233/253 (92.1% [88.1%, 94.8%]) | 190349 | 284/307 (92.5% [89.0%, 95.0%]) |
| S2 | 253 | 76/253 (30.0% [24.7%, 36.0%]) | 253/253 (100.0% [98.5%, 100.0%]) | 233/253 (92.1% [88.1%, 94.8%]) | 195634 | 534/576 (92.7% [90.3%, 94.6%]) |
| S3 | 251 | 251/251 (100.0% [98.5%, 100.0%]) | 251/251 (100.0% [98.5%, 100.0%]) | 248/251 (98.8% [96.5%, 99.6%]) | 67876 | 577/577 (100.0% [99.3%, 100.0%]) |

## Java verdicts (A1, S1, S2, SOURCE_PLAN)

| arm | ADMITTED | REFUSED | SCORER_ERROR | codes (verdict/stage:code) |
|---|---|---|---|---|
| SP | 263 | 32 | 0 | {"REFUSED/admitPlan:MISSING_SOURCE":19,"REFUSED/admitPlan:INVALID_CONTRACT":13} |
| S2 | 496 | 293 | 0 | {"ADMITTED/parse:UNSUPPORTED":280,"REFUSED/action:INVALID_CONTRACT":293,"ADMITTED/parse:CLARIFICATION":78} |
| S1 | 281 | 142 | 0 | {"ADMITTED/parse:UNSUPPORTED":144,"REFUSED/action:INVALID_CONTRACT":142,"ADMITTED/parse:CLARIFICATION":38} |
| A1 | 254 | 140 | 0 | {"ADMITTED/parse:UNSUPPORTED":118,"REFUSED/action:INVALID_CONTRACT":140,"ADMITTED/parse:CLARIFICATION":43} |

## Durability

One factor at a time per task: 5 baseline contexts (1280x720, en-US, the task's cookie choice), then 1 each for viewport 1920x1080, locale en-GB and the opposite cookie choice where the site has a banner. Outcomes: OK, FAIL_CLOSED, WRONG_UNIQUE (HZ-2), VOID.

### Short-term (<24 h after the run)

| arm/tier | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| S2/role | 815 | 7 | 0 | 60 | 0 |
| S3/role | 847 | 14 | 0 | 42 | 0 |
| S3/filterHas | 196 | 0 | 0 | 28 | 0 |
| A1/hint | 364 | 7 | 0 | 0 | 0 |
| S1/hint | 427 | 14 | 0 | 0 | 0 |
| A0/hint | 196 | 7 | 0 | 0 | 0 |
| S3/scoped | 14 | 0 | 0 | 0 | 0 |
| S3/nth | 119 | 0 | 0 | 7 | 0 |
| S2/placeholder | 14 | 0 | 0 | 0 | 0 |
| S3/label | 14 | 0 | 0 | 0 | 0 |
| S3/attribute | 51 | 0 | 0 | 19 | 0 |
| S2/text | 14 | 0 | 0 | 0 | 0 |

| condition | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| baseline | 2195 | 35 | 0 | 110 | 0 |
| locale | 438 | 7 | 0 | 23 | 0 |
| viewport | 438 | 7 | 0 | 23 | 0 |

| exactness/positional | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| exact/non-positional | 2952 | 49 | 0 | 149 | 0 |
| exact/positional | 119 | 0 | 0 | 7 | 0 |

### Next day (>=24 h after the run)

Not run.

Engine vs public Playwright (HZ-6): A0 0/203, A1 0/371, S1 0/441, S2 0/850, S3 0/1255

## Safety

| check | result |
|---|---|
| leak scan | 0 hits in 315 files (64 canaries) |
| mask test | 0 differences |
| hostile cases | 16/20 |
| F1 conformance | PASS |

## Hard zeros

| hard zero | arm | count | detail |
|---|---|---|---|
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | A0 | 0 | 0 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | A1 | 0 | 8 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S1 | 0 | 9 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S2 | 2 | 12 wrong-element ACTIONs incl. refused; neg-wiki-02|0|S2|1|1, neg-wiki-02|0|S2|2|1 |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S3 | 5 | 28 wrong-element ACTIONs incl. refused; neg-pydocs-01|0|S3|1|1, gut-assert-01|0|S3|2|1, iana-assert-01|0|S3|2|1, dt-neg-02|0|S3|1|1, dt-neg-02|0|S3|2|1 |
| HZ-2 wrong-unique durability | A0 | 0 | 203 resolved trials |
| HZ-2 wrong-unique durability | A1 | 0 | 371 resolved trials |
| HZ-2 wrong-unique durability | S1 | 0 | 441 resolved trials |
| HZ-2 wrong-unique durability | S2 | 0 | 850 resolved trials |
| HZ-2 wrong-unique durability | S3 | 0 | 1255 resolved trials |
| HZ-3 leak | - | 0 | by arm: {"harness":0,"A0":0,"A1":0,"S1":0,"S2":0,"S3":0,"S4":0}; A0/A1 hits are production findings outside gating |
| HZ-4 mask difference | - | 0 |  |
| HZ-5 hostile or injection case not passed | - | 4 | hostile 16/20, injected 15/15 |
| HZ-6 engine vs public mismatch | A0 | 0 | 203 checked |
| HZ-6 engine vs public mismatch | A1 | 0 | 371 checked |
| HZ-6 engine vs public mismatch | S1 | 0 | 441 checked |
| HZ-6 engine vs public mismatch | S2 | 0 | 850 checked |
| HZ-6 engine vs public mismatch | S3 | 0 | 1255 checked |
| F1 conformance (f1-conformance) | - | 0 | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |

## Stage go / no-go (computed)

GO needs every check true. NO-GO = a check failed. INCOMPLETE = evidence missing (cannot be GO). A hard zero blocks a stage until root-caused and re-run.

| stage | verdict |
|---|---|
| 1: Resolver on Playwright semantics (S2) | **NO-GO** |
| 2: Outline rendering (S1) | **NO-GO** |
| 3: Sanitized AI-snapshot perception and synthesis (S3) | **NO-GO** |
| 4: Set-of-Marks screenshot (S4); a GO means taking it to the ADR and Security & Compliance, not into the product | **NO-GO** |

### Stage 1: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 231/298 tasks finished |
| no unresolved infrastructure errors (S2, A1) | MISSING | 8 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S2 > A1: lower bound of the bootstrap CI above 0 | pass | diff 23.3% CI [17.9%, 28.8%], McNemar p=0.0000 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S2) | FAIL | 2 found (12 wrong-element ACTIONs incl. refused); e.g. neg-wiki-02|0|S2|1|1, neg-wiki-02|0|S2|2|1 |
| HZ-2 no wrong-unique durability result (S2) | pass | 0 wrong-unique in 850 resolved trials |
| HZ-3 no leak in harness outputs or the S2 payload | pass | 0 blocking (harness-level 0, S2 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S2) | pass | 0 mismatches in 850 checked trials |

### Stage 2: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 231/298 tasks finished |
| no unresolved infrastructure errors (S1, A1) | MISSING | 4 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S1 not worse than A1: lower bound of the CI for S1 - A1 success >= -3 pp | pass | diff 2.2% CI [-0.4%, 4.8%], McNemar p=0.1797 |
| S1 cheaper: upper bound of the 95% cluster-bootstrap CI of summed prompt tokens S1/A1 below 1 | pass | ratio 0.380 CI [0.360, 0.402] over 204 tasks |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S1) | pass | 0 found (9 wrong-element ACTIONs incl. refused) |
| HZ-2 no wrong-unique durability result (S1) | pass | 0 wrong-unique in 441 resolved trials |
| HZ-3 no leak in harness outputs or the S1 payload | pass | 0 blocking (harness-level 0, S1 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |

### Stage 3: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 231/298 tasks finished |
| no unresolved infrastructure errors (S3, S2) | MISSING | 8 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S3 > S2 (primary): lower bound of the bootstrap CI above 0 | pass | diff 39.4% CI [33.0%, 46.1%], McNemar p=0.0000 |
| chain stratum evidenced for S3 | pass | 73 chain trials |
| every S3 request admitted under planned limits (observation <= 40,000 bytes, request <= 262,144 bytes) | pass | 577/577 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S3) | FAIL | 5 found (28 wrong-element ACTIONs incl. refused); e.g. neg-pydocs-01|0|S3|1|1, gut-assert-01|0|S3|2|1, iana-assert-01|0|S3|2|1 |
| HZ-2 no wrong-unique durability result (S3) | pass | 0 wrong-unique in 1255 resolved trials |
| HZ-3 no leak in harness outputs or the S3 payload | pass | 0 blocking (harness-level 0, S3 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S3) | pass | 0 mismatches in 1255 checked trials |

### Stage 4: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum on the visual strata (>= min(planned, 24)) | pass | 231/298 tasks finished |
| no unresolved infrastructure errors (S4, S3) | MISSING | 2 unresolved rows excluded from the denominators; rerun the same RUN_DIR |
| S4 > S3 on the visual stratum (visualOnlyField + iconOnly): lower bound of the CI above 0 | MISSING | S4 or S3 not run on the visual stratum |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S4) | MISSING | S4 not run |
| HZ-2 no wrong-unique durability result (S4) | MISSING | 0 wrong-unique in 0 resolved trials (no resolved trial for this arm: MISSING) |
| HZ-3 no leak in harness outputs or the S4 payload | pass | 0 blocking (harness-level 0, S4 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |
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

