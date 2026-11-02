# SPK-07 grounding benchmark report

**POST-HOC**: this run was decided and assembled after earlier results were seen; it is not a pre-registered confirmatory run.

> **Screening evidence — not ADR-SC-005 D-C evidence**

## Run

| Field | Value |
|---|---|
| runId | final-s3v2-fresh-20261027 |
| seed | 20261026 |
| arms | A0, A1, S1, S2, S3 |
| reps | 3 |
| started | 2026-10-27T00:13:40.902Z |
| node / playwright | v24.20.0 / 1.63.0 |
| model versions seen | gemini-3.8-flash |
| caps | {"SPK07_MAX_CALLS":"2000","SPK07_MAX_PROMPT_TOKENS_TOTAL":"15000000","maxPromptTokensPerCall":"gateway input cap 262144 bytes"} |
| rows (attempt 1 / all) | 455 / 540 |
| VOID entries | 0 by reason {}; by stratum {} |
| run ended (durability next-day clock) | 2026-10-27T04:13:25.519Z |
| seeds | run seed 20261026; arm order: per task: shuffle seeded by sha256(runSeed|taskId); bootstrap seeds {"primary":1379507090,"s2VsA1":1314839406,"s1VsA1":1037629093,"s4VsS3Visual":null,"tokenRatioS1A1":3476672992} |
| EMPTIED / errors | 42 / 0 |
| postHoc | true |
| assembledFrom | {"base":null,"s3v2":null,"wave2":"wave2-20261027","freshOnly":true,"note":"post-hoc S3 v2: wave-1 A0/A1/S1/S2 from base, S3 re-run on wave-1 tasks, all arms (no S4) on wave-2 tasks; neg-gov-02 taken from the wave-2 run only; safety.json/leakscan.json are from the s3v2 run"} |

## Freeze

| Field | Value |
|---|---|
| freeze ok at run time | true |
| corpus sha256 | 9fe9b0ff9867a3f67031535796ae36f158897d947d632c3c37beedc677d9e938 |
| contracts sha256 | c01e091d84834af8ec9239205a254397ab6d3c49d305c278cbcee6d589ee1b1c |
| harness files sha256 | c46e72077cae491c919254b961571842919b4bb80b3dcad963b141b34f8b6388 |
| errors / warnings | none / none |
| re-verified now | matches |
| current harness drift | none |

## Coverage and arm reps

58 of 58 planned tasks finished; rows of unfinished tasks are excluded from every denominator. Minimum for a stage verdict: every stratum min(planned, 8) finished tasks and the visual strata together min(planned, 24).

| stratum | planned | finished |
|---|---|---|
| uniqueNav | 9 | 9 |
| visualOnlyField | 3 | 3 |
| duplicateNeedsContext | 11 | 11 |
| selectCheck | 5 | 5 |
| readTarget | 5 | 5 |
| assertTarget | 5 | 5 |
| iconOnly | 4 | 4 |
| menuNameDiffers | 2 | 2 |
| negative | 8 | 8 |
| chain | 3 | 3 |
| labeledField | 3 | 3 |

No unfinished tasks.

| arm | reps used | steps with rows | tasks |
|---|---|---|---|
| A0 | 1 | 65 | 58 |
| A1 | 1 | 65 | 58 |
| S1 | 1 | 65 | 58 |
| S2 | 2 | 65 | 58 |
| S3 | 2 | 65 | 58 |

4-hour profile (preregistration section 14, entry 6): McNemar unit = success only if ALL of that arm's reps succeed; A0 is derived from A1 (23 derived, 42 emptied, 0 own calls because the request bodies differed, 0 unresolved of 65); PRODUCT_REFUSED_GATEWAY_CAP rows (request over 262,144 bytes): {"A0":0,"A1":0,"S1":0,"S2":0,"S3":0}.

## Unresolved infrastructure errors (excluded from every denominator)

None: every model call resolved.

## Per arm and stratum (answerable steps; rep-level trials, first attempt)

Cells are k/n (rate [Wilson 95%]). Success = ACTION on the GT element with an executable locator, first attempt, no gate required (primary metric). Product-admitted success also needs the arm's gates (harness gate codes, Java verdict where scored). Descriptive per stratum; decisions use the paired comparisons below.

### A0 (derived from A1 when the request bodies are byte-identical; EMPTIED when emptied)

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 57 | 12/57 (21.1% [12.5%, 33.3%]) | 6/57 (10.5% [4.9%, 21.1%]) | 6/57 (10.5% [4.9%, 21.1%]) | 6/57 (10.5% [4.9%, 21.1%]) | 6/57 (10.5% [4.9%, 21.1%]) | 9/57 (15.8% [8.5%, 27.4%]) | 0/57 (0.0% [0.0%, 6.3%]) | 0 | 2/8 (conf. wrong 0) | 0 | 36/0 |
| assertTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 5/0 |
| chain | 10 | 4/10 (40.0% [16.8%, 68.7%]) | 2/10 (20.0% [5.7%, 51.0%]) | 2/10 (20.0% [5.7%, 51.0%]) | 2/10 (20.0% [5.7%, 51.0%]) | 2/10 (20.0% [5.7%, 51.0%]) | 3/10 (30.0% [10.8%, 60.3%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 3/0 |
| duplicateNeedsContext | 11 | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 3/11 (27.3% [9.7%, 56.6%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 8/0 |
| iconOnly | 4 | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 4/0 |
| labeledField | 3 | 3/3 (100.0% [43.9%, 100.0%]) | 2/3 (66.7% [20.8%, 93.9%]) | 2/3 (66.7% [20.8%, 93.9%]) | 2/3 (66.7% [20.8%, 93.9%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 2 | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 1/2 (50.0% [9.5%, 90.5%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 1/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 2/8 (conf. wrong 0) | 0 | 0/0 |
| readTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 5/0 |
| selectCheck | 5 | 2/5 (40.0% [11.8%, 76.9%]) | 1/5 (20.0% [3.6%, 62.4%]) | 1/5 (20.0% [3.6%, 62.4%]) | 1/5 (20.0% [3.6%, 62.4%]) | 1/5 (20.0% [3.6%, 62.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 3/0 |
| uniqueNav | 9 | 3/9 (33.3% [12.1%, 64.6%]) | 1/9 (11.1% [2.0%, 43.5%]) | 1/9 (11.1% [2.0%, 43.5%]) | 1/9 (11.1% [2.0%, 43.5%]) | 1/9 (11.1% [2.0%, 43.5%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 6/0 |
| visualOnlyField | 3 | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 1/0 |

### A1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 57 | 24/57 (42.1% [30.2%, 55.0%]) | 16/57 (28.1% [18.1%, 40.8%]) | 16/57 (28.1% [18.1%, 40.8%]) | 8/57 (14.0% [7.3%, 25.3%]) | 16/57 (28.1% [18.1%, 40.8%]) | 30/57 (52.6% [39.9%, 65.0%]) | 0/57 (0.0% [0.0%, 6.3%]) | 1 | 8/8 (conf. wrong 0) | 0 | 0/0 |
| assertTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 4/5 (80.0% [37.6%, 96.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 10 | 5/10 (50.0% [23.7%, 76.3%]) | 3/10 (30.0% [10.8%, 60.3%]) | 3/10 (30.0% [10.8%, 60.3%]) | 2/10 (20.0% [5.7%, 51.0%]) | 3/10 (30.0% [10.8%, 60.3%]) | 4/10 (40.0% [16.8%, 68.7%]) | 0/10 (0.0% [0.0%, 27.8%]) | 1 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 11 | 1/11 (9.1% [1.6%, 37.7%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 10/11 (90.9% [62.3%, 98.4%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 4 | 3/4 (75.0% [30.1%, 95.4%]) | 3/4 (75.0% [30.1%, 95.4%]) | 3/4 (75.0% [30.1%, 95.4%]) | 0/4 (0.0% [0.0%, 49.0%]) | 3/4 (75.0% [30.1%, 95.4%]) | 1/4 (25.0% [4.6%, 69.9%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| labeledField | 3 | 3/3 (100.0% [43.9%, 100.0%]) | 2/3 (66.7% [20.8%, 93.9%]) | 2/3 (66.7% [20.8%, 93.9%]) | 1/3 (33.3% [6.1%, 79.2%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 2 | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 2/2 (100.0% [34.2%, 100.0%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 8/8 (conf. wrong 0) | 0 | 0/0 |
| readTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 5/5 (100.0% [56.6%, 100.0%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 5 | 4/5 (80.0% [37.6%, 96.4%]) | 3/5 (60.0% [23.1%, 88.2%]) | 3/5 (60.0% [23.1%, 88.2%]) | 2/5 (40.0% [11.8%, 76.9%]) | 3/5 (60.0% [23.1%, 88.2%]) | 1/5 (20.0% [3.6%, 62.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 9 | 8/9 (88.9% [56.5%, 98.0%]) | 5/9 (55.6% [26.7%, 81.1%]) | 5/9 (55.6% [26.7%, 81.1%]) | 3/9 (33.3% [12.1%, 64.6%]) | 5/9 (55.6% [26.7%, 81.1%]) | 1/9 (11.1% [2.0%, 43.5%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 3 | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S1

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 57 | 23/57 (40.4% [28.6%, 53.3%]) | 18/57 (31.6% [21.0%, 44.5%]) | 18/57 (31.6% [21.0%, 44.5%]) | 8/57 (14.0% [7.3%, 25.3%]) | 18/57 (31.6% [21.0%, 44.5%]) | 32/57 (56.1% [43.3%, 68.2%]) | 0/57 (0.0% [0.0%, 6.3%]) | 0 | 8/8 (conf. wrong 0) | 0 | 0/0 |
| assertTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 4/5 (80.0% [37.6%, 96.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 10 | 4/10 (40.0% [16.8%, 68.7%]) | 3/10 (30.0% [10.8%, 60.3%]) | 3/10 (30.0% [10.8%, 60.3%]) | 2/10 (20.0% [5.7%, 51.0%]) | 3/10 (30.0% [10.8%, 60.3%]) | 6/10 (60.0% [31.3%, 83.2%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 11 | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0/11 (0.0% [0.0%, 25.9%]) | 11/11 (100.0% [74.1%, 100.0%]) | 0/11 (0.0% [0.0%, 25.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 4 | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| labeledField | 3 | 3/3 (100.0% [43.9%, 100.0%]) | 2/3 (66.7% [20.8%, 93.9%]) | 2/3 (66.7% [20.8%, 93.9%]) | 1/3 (33.3% [6.1%, 79.2%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 2 | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0/2 (0.0% [0.0%, 65.8%]) | 2/2 (100.0% [34.2%, 100.0%]) | 0/2 (0.0% [0.0%, 65.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 8/8 (conf. wrong 0) | 0 | 0/0 |
| readTarget | 5 | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 5/5 (100.0% [56.6%, 100.0%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 5 | 4/5 (80.0% [37.6%, 96.4%]) | 4/5 (80.0% [37.6%, 96.4%]) | 4/5 (80.0% [37.6%, 96.4%]) | 2/5 (40.0% [11.8%, 76.9%]) | 4/5 (80.0% [37.6%, 96.4%]) | 1/5 (20.0% [3.6%, 62.4%]) | 0/5 (0.0% [0.0%, 43.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 9 | 8/9 (88.9% [56.5%, 98.0%]) | 5/9 (55.6% [26.7%, 81.1%]) | 5/9 (55.6% [26.7%, 81.1%]) | 3/9 (33.3% [12.1%, 64.6%]) | 5/9 (55.6% [26.7%, 81.1%]) | 1/9 (11.1% [2.0%, 43.5%]) | 0/9 (0.0% [0.0%, 29.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 3 | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0/3 (0.0% [0.0%, 56.1%]) | 2/3 (66.7% [20.8%, 93.9%]) | 0/3 (0.0% [0.0%, 56.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S2

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 114 | 47/114 (41.2% [32.6%, 50.4%]) | 47/114 (41.2% [32.6%, 50.4%]) | 47/114 (41.2% [32.6%, 50.4%]) | 24/114 (21.1% [14.6%, 29.4%]) | 46/114 (40.4% [31.8%, 49.5%]) | 63/114 (55.3% [46.1%, 64.1%]) | 0/114 (0.0% [0.0%, 3.3%]) | 0 | 16/16 (conf. wrong 0) | 0 | 0/0 |
| assertTarget | 10 | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 8/10 (80.0% [49.0%, 94.3%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 20 | 8/20 (40.0% [21.9%, 61.3%]) | 8/20 (40.0% [21.9%, 61.3%]) | 8/20 (40.0% [21.9%, 61.3%]) | 6/20 (30.0% [14.5%, 51.9%]) | 8/20 (40.0% [21.9%, 61.3%]) | 12/20 (60.0% [38.7%, 78.1%]) | 0/20 (0.0% [0.0%, 16.1%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 22 | 0/22 (0.0% [0.0%, 14.9%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0/22 (0.0% [0.0%, 14.9%]) | 22/22 (100.0% [85.1%, 100.0%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 8 | 7/8 (87.5% [52.9%, 97.8%]) | 7/8 (87.5% [52.9%, 97.8%]) | 7/8 (87.5% [52.9%, 97.8%]) | 0/8 (0.0% [0.0%, 32.4%]) | 7/8 (87.5% [52.9%, 97.8%]) | 1/8 (12.5% [2.2%, 47.1%]) | 0/8 (0.0% [0.0%, 32.4%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| labeledField | 6 | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 4/6 (66.7% [30.0%, 90.3%]) | 6/6 (100.0% [61.0%, 100.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 4 | 1/4 (25.0% [4.6%, 69.9%]) | 1/4 (25.0% [4.6%, 69.9%]) | 1/4 (25.0% [4.6%, 69.9%]) | 0/4 (0.0% [0.0%, 49.0%]) | 1/4 (25.0% [4.6%, 69.9%]) | 3/4 (75.0% [30.1%, 95.4%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 0 | 16/16 (conf. wrong 0) | 0 | 0/0 |
| readTarget | 10 | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0/10 (0.0% [0.0%, 27.8%]) | 10/10 (100.0% [72.2%, 100.0%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 10 | 9/10 (90.0% [59.6%, 98.2%]) | 9/10 (90.0% [59.6%, 98.2%]) | 9/10 (90.0% [59.6%, 98.2%]) | 4/10 (40.0% [16.8%, 68.7%]) | 8/10 (80.0% [49.0%, 94.3%]) | 1/10 (10.0% [1.8%, 40.4%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 18 | 16/18 (88.9% [67.2%, 96.9%]) | 16/18 (88.9% [67.2%, 96.9%]) | 16/18 (88.9% [67.2%, 96.9%]) | 10/18 (55.6% [33.7%, 75.4%]) | 16/18 (88.9% [67.2%, 96.9%]) | 2/18 (11.1% [3.1%, 32.8%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 6 | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 4/6 (66.7% [30.0%, 90.3%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

### S3

| stratum | trials | correct | executable | success (correct + executable) | product-admitted success | after re-ask | clarification on answerable | HZ-1 confident wrong | wrong-element ACTIONs (incl. refused) | negatives handled | click-equivalent descendants (counted in success) | emptied / observe, plan or cap failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ALL | 114 | 89/114 (78.1% [69.6%, 84.7%]) | 96/114 (84.2% [76.4%, 89.8%]) | 89/114 (78.1% [69.6%, 84.7%]) | 72/114 (63.2% [54.0%, 71.4%]) | 88/114 (77.2% [68.7%, 83.9%]) | 13/114 (11.4% [6.8%, 18.5%]) | 1/114 (0.9% [0.2%, 4.8%]) | 10 | 14/16 (conf. wrong 2) | 2 | 0/0 |
| assertTarget | 10 | 5/10 (50.0% [23.7%, 76.3%]) | 8/10 (80.0% [49.0%, 94.3%]) | 5/10 (50.0% [23.7%, 76.3%]) | 2/10 (20.0% [5.7%, 51.0%]) | 5/10 (50.0% [23.7%, 76.3%]) | 0/10 (0.0% [0.0%, 27.8%]) | 1/10 (10.0% [1.8%, 40.4%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| chain | 20 | 14/20 (70.0% [48.1%, 85.5%]) | 16/20 (80.0% [58.4%, 91.9%]) | 14/20 (70.0% [48.1%, 85.5%]) | 12/20 (60.0% [38.7%, 78.1%]) | 14/20 (70.0% [48.1%, 85.5%]) | 4/20 (20.0% [8.1%, 41.6%]) | 0/20 (0.0% [0.0%, 16.1%]) | 2 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| duplicateNeedsContext | 22 | 22/22 (100.0% [85.1%, 100.0%]) | 22/22 (100.0% [85.1%, 100.0%]) | 22/22 (100.0% [85.1%, 100.0%]) | 20/22 (90.9% [72.2%, 97.5%]) | 22/22 (100.0% [85.1%, 100.0%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0/22 (0.0% [0.0%, 14.9%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| iconOnly | 8 | 8/8 (100.0% [67.6%, 100.0%]) | 8/8 (100.0% [67.6%, 100.0%]) | 8/8 (100.0% [67.6%, 100.0%]) | 0/8 (0.0% [0.0%, 32.4%]) | 8/8 (100.0% [67.6%, 100.0%]) | 0/8 (0.0% [0.0%, 32.4%]) | 0/8 (0.0% [0.0%, 32.4%]) | 0 | 0/0 (conf. wrong 0) | 2 | 0/0 |
| labeledField | 6 | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 6/6 (100.0% [61.0%, 100.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| menuNameDiffers | 4 | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 4/4 (100.0% [51.0%, 100.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0/4 (0.0% [0.0%, 49.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| negative | 0 | - | - | - | - | - | - | - | 2 | 14/16 (conf. wrong 2) | 0 | 0/0 |
| readTarget | 10 | 4/10 (40.0% [16.8%, 68.7%]) | 6/10 (60.0% [31.3%, 83.2%]) | 4/10 (40.0% [16.8%, 68.7%]) | 4/10 (40.0% [16.8%, 68.7%]) | 4/10 (40.0% [16.8%, 68.7%]) | 3/10 (30.0% [10.8%, 60.3%]) | 0/10 (0.0% [0.0%, 27.8%]) | 3 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| selectCheck | 10 | 8/10 (80.0% [49.0%, 94.3%]) | 8/10 (80.0% [49.0%, 94.3%]) | 8/10 (80.0% [49.0%, 94.3%]) | 6/10 (60.0% [31.3%, 83.2%]) | 7/10 (70.0% [39.7%, 89.2%]) | 2/10 (20.0% [5.7%, 51.0%]) | 0/10 (0.0% [0.0%, 27.8%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| uniqueNav | 18 | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 18/18 (100.0% [82.4%, 100.0%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0/18 (0.0% [0.0%, 17.6%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |
| visualOnlyField | 6 | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0/6 (0.0% [0.0%, 39.0%]) | 4/6 (66.7% [30.0%, 90.3%]) | 0/6 (0.0% [0.0%, 39.0%]) | 0 | 0/0 (conf. wrong 0) | 0 | 0/0 |

## Paired comparisons (correct-and-executable per step, answerable tasks)

Unit = task step, outcome = majority over reps. McNemar is exact two-sided on discordant units (only-X/only-Y). Sensitivity pairs every rep. Bootstrap = 10,000 task-cluster resamples, seeded, 95% percentile CI of rate(X) - rate(Y).

| X vs Y | units | only X / only Y | McNemar p | all-reps p (b/c) | diff [95% CI] | rates |
|---|---|---|---|---|---|---|
| **PRIMARY** S3 vs S2 | 57 | 24/2 | 0.0000 | 0.0000 (46/4) | 36.8% [25.0%, 49.1%] | 77.2% vs 38.6% |
| S2 vs A1 | 57 | 6/0 | 0.0313 | 0.0156 (7/0) | 13.2% [5.6%, 21.7%] | 38.6% vs 28.1% |
| S1 vs A1 (format effect) | 57 | 2/0 | 0.5000 | 0.5000 (2/0) | 3.5% [0.0%, 9.1%] | 31.6% vs 28.1% |
| S4 vs S3 on visualOnlyField + iconOnly | - | - | - | - | - | not run |

### Sensitivity (reported, never gating): diff [95% CI] (units)

| comparison | admitted | afterReask | realSitesOnly | heldOutOnly | freshSitesOnly | strictLocators | strictEquality |
|---|---|---|---|---|---|---|---|
| S3 vs S2 | 42.1% [29.6%, 54.8%] (57) | 36.8% [25.0%, 49.1%] (57) | 36.8% [25.0%, 49.1%] (57) | 36.8% [25.0%, 49.1%] (57) | 36.8% [25.0%, 49.1%] (57) | 23.7% [10.5%, 37.1%] (57) | 35.1% [22.6%, 48.1%] (57) |
| S2 vs A1 | 7.0% [1.7%, 13.8%] (57) | 12.3% [4.8%, 20.8%] (57) | 13.2% [5.6%, 21.7%] (57) | 13.2% [5.6%, 21.7%] (57) | 13.2% [5.6%, 21.7%] (57) | 13.2% [5.6%, 21.7%] (57) | 13.2% [5.6%, 21.7%] (57) |
| S1 vs A1 | 0.0% [0.0%, 0.0%] (57) | 3.5% [0.0%, 9.1%] (57) | 3.5% [0.0%, 9.1%] (57) | 3.5% [0.0%, 9.1%] (57) | 3.5% [0.0%, 9.1%] (57) | 3.5% [0.0%, 9.1%] (57) | 3.5% [0.0%, 9.1%] (57) |
| S4 vs S3 (visual) | - | - | - | - | - | - | - |

Summed prompt-token ratio S1/A1: 0.492, 95% cluster-bootstrap CI [0.469, 0.519] over 56 tasks.

## Absolute bar

Reference 97.0% per step (D-C 90% workflow completion implies 0.97^5 = 85.9%).

| arm | per-step correct-and-executable | implied 5-step completion | 5-step at Wilson lower bound |
|---|---|---|---|
| A0 | 10.5% | 0.0% | 0.0% |
| A1 | 28.1% | 0.2% | 0.0% |
| S1 | 31.6% | 0.3% | 0.0% |
| S2 | 41.2% | 1.2% | 0.4% |
| S3 | 78.1% | 29.0% | 16.4% |

## Tokens, latency, admission

Tokens are real Gemini `usageMetadata` (first attempt). Admission: production limits and the gateway cap are per observation; the planned-limits column is per request (every S3 request must pass for Stage 3).

| arm | calls | prompt p50 | prompt p95 | prompt mean | out mean | thoughts mean | model ms p50/p95 | observe ms p50/p95 | obs bytes p50/p95 |
|---|---|---|---|---|---|---|---|---|---|
| A0 | 0 | n/a | n/a | n/a | n/a | n/a | n/a/n/a | 16/32 | 397/27889 |
| A1 | 63 | 17810 | 23309 | 17420 | 239 | 58 | 11327/126515 | 17/32 | 34413/48754 |
| S1 | 63 | 8598 | 9609 | 8572 | 215 | 0 | 10622/151259 | 16/30 | 3702/5020 |
| S2 | 126 | 8775 | 9615 | 8708 | 205 | 0 | 14947/142377 | 16/29 | 4140/5020 |
| S3 | 126 | 9488 | 13688 | 10523 | 226 | 0 | 8350/111976 | 65/96 | 8368/17865 |
| SP | 58 | 6167 | 6716 | n/a | n/a | n/a | 12939/103268 | n/a/n/a | n/a/n/a |

| arm | observations | production limits (A0-S2: nodes/bytes/depth + gateway + translation caps) | gateway cap 262,144 | translation cap 65,536 (wire + 2048) | max translation input bytes | requests under planned limits (obs <= 40,000 B and body <= 262,144 B) |
|---|---|---|---|---|---|---|
| A0 | 65 | 23/65 (35.4% [24.9%, 47.5%]) | 23/65 (35.4% [24.9%, 47.5%]) | 23/65 (35.4% [24.9%, 47.5%]) | 53316 | 27/27 (100.0% [87.5%, 100.0%]) |
| A1 | 65 | 23/65 (35.4% [24.9%, 47.5%]) | 65/65 (100.0% [94.4%, 100.0%]) | 42/65 (64.6% [52.5%, 75.1%]) | 76722 | 50/72 (69.4% [58.0%, 78.9%]) |
| S1 | 65 | 23/65 (35.4% [24.9%, 47.5%]) | 65/65 (100.0% [94.4%, 100.0%]) | 65/65 (100.0% [94.4%, 100.0%]) | 28627 | 70/70 (100.0% [94.8%, 100.0%]) |
| S2 | 65 | 23/65 (35.4% [24.9%, 47.5%]) | 65/65 (100.0% [94.4%, 100.0%]) | 65/65 (100.0% [94.4%, 100.0%]) | 28627 | 133/133 (100.0% [97.2%, 100.0%]) |
| S3 | 65 | 65/65 (100.0% [94.4%, 100.0%]) | 65/65 (100.0% [94.4%, 100.0%]) | 65/65 (100.0% [94.4%, 100.0%]) | 42774 | 134/134 (100.0% [97.2%, 100.0%]) |

## Java verdicts (A1, S1, S2, SOURCE_PLAN)

| arm | ADMITTED | REFUSED | SCORER_ERROR | codes (verdict/stage:code) |
|---|---|---|---|---|
| SP | 51 | 7 | 0 | {"REFUSED/admitPlan:MISSING_SOURCE":5,"REFUSED/admitPlan:INVALID_CONTRACT":2} |
| S2 | 104 | 45 | 0 | {"ADMITTED/parse:CLARIFICATION":19,"ADMITTED/parse:UNSUPPORTED":61,"REFUSED/action:INVALID_CONTRACT":45} |
| A1 | 57 | 23 | 0 | {"ADMITTED/parse:UNSUPPORTED":28,"ADMITTED/parse:CLARIFICATION":11,"REFUSED/action:INVALID_CONTRACT":23} |
| S1 | 56 | 22 | 0 | {"ADMITTED/parse:UNSUPPORTED":31,"ADMITTED/parse:CLARIFICATION":9,"REFUSED/action:INVALID_CONTRACT":22} |

## Durability

One factor at a time per task: 5 baseline contexts (1280x720, en-US, the task's cookie choice), then 1 each for viewport 1920x1080, locale en-GB and the opposite cookie choice where the site has a banner. Outcomes: OK, FAIL_CLOSED, WRONG_UNIQUE (HZ-2), VOID.

### Short-term (<24 h after the run)

| arm/tier | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| S1/hint | 126 | 0 | 0 | 0 | 0 |
| S2/role | 168 | 0 | 0 | 0 | 0 |
| A1/hint | 112 | 0 | 0 | 0 | 0 |
| S3/role | 210 | 0 | 0 | 0 | 0 |
| S3/filterHas | 56 | 0 | 0 | 0 | 0 |
| S3/attribute | 7 | 0 | 0 | 0 | 0 |
| S3/nth | 42 | 0 | 0 | 0 | 0 |
| A0/hint | 42 | 0 | 0 | 0 | 0 |

| condition | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| baseline | 545 | 0 | 0 | 0 | 0 |
| viewport | 109 | 0 | 0 | 0 | 0 |
| locale | 109 | 0 | 0 | 0 | 0 |

| exactness/positional | OK | FAIL_CLOSED | WRONG_UNIQUE | VOID | UNSUPPORTED_SHAPE |
|---|---|---|---|---|---|
| exact/non-positional | 721 | 0 | 0 | 0 | 0 |
| exact/positional | 42 | 0 | 0 | 0 | 0 |

### Next day (>=24 h after the run)

Not run.

Engine vs public Playwright (HZ-6): A0 0/42, A1 0/112, S1 0/126, S2 0/168, S3 0/315

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
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | A1 | 0 | 2 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S1 | 0 | 0 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S2 | 0 | 0 wrong-element ACTIONs incl. refused;  |
| HZ-1 confident wrong (gate-admitted, executable) / COMPLETE | S3 | 3 | 17 wrong-element ACTIONs incl. refused; iana-assert-01|0|S3|2|1, dt-neg-02|0|S3|1|1, dt-neg-02|0|S3|2|1 |
| HZ-2 wrong-unique durability | A0 | 0 | 42 resolved trials |
| HZ-2 wrong-unique durability | A1 | 0 | 112 resolved trials |
| HZ-2 wrong-unique durability | S1 | 0 | 126 resolved trials |
| HZ-2 wrong-unique durability | S2 | 0 | 168 resolved trials |
| HZ-2 wrong-unique durability | S3 | 0 | 315 resolved trials |
| HZ-3 leak | - | 0 | by arm: {"harness":0,"A0":0,"A1":0,"S1":0,"S2":0,"S3":0,"S4":0}; A0/A1 hits are production findings outside gating |
| HZ-4 mask difference | - | 0 |  |
| HZ-5 hostile or injection case not passed | - | 4 | hostile 16/20, injected 15/15 |
| HZ-6 engine vs public mismatch | A0 | 0 | 42 checked |
| HZ-6 engine vs public mismatch | A1 | 0 | 112 checked |
| HZ-6 engine vs public mismatch | S1 | 0 | 126 checked |
| HZ-6 engine vs public mismatch | S2 | 0 | 168 checked |
| HZ-6 engine vs public mismatch | S3 | 0 | 315 checked |
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
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 58/58 tasks finished |
| no unresolved infrastructure errors (S2, A1) | pass | none |
| S2 > A1: lower bound of the bootstrap CI above 0 | pass | diff 13.2% CI [5.6%, 21.7%], McNemar p=0.0313 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S2) | pass | 0 found (0 wrong-element ACTIONs incl. refused) |
| HZ-2 no wrong-unique durability result (S2) | pass | 0 wrong-unique in 168 resolved trials |
| HZ-3 no leak in harness outputs or the S2 payload | pass | 0 blocking (harness-level 0, S2 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S2) | pass | 0 mismatches in 168 checked trials |

### Stage 2: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 58/58 tasks finished |
| no unresolved infrastructure errors (S1, A1) | pass | none |
| S1 not worse than A1: lower bound of the CI for S1 - A1 success >= -3 pp | pass | diff 3.5% CI [0.0%, 9.1%], McNemar p=0.5000 |
| S1 cheaper: upper bound of the 95% cluster-bootstrap CI of summed prompt tokens S1/A1 below 1 | pass | ratio 0.492 CI [0.469, 0.519] over 56 tasks |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S1) | pass | 0 found (0 wrong-element ACTIONs incl. refused) |
| HZ-2 no wrong-unique durability result (S1) | pass | 0 wrong-unique in 126 resolved trials |
| HZ-3 no leak in harness outputs or the S1 payload | pass | 0 blocking (harness-level 0, S1 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |

### Stage 3: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum per stratum (>= min(planned, 8) in every stratum) | pass | 58/58 tasks finished |
| no unresolved infrastructure errors (S3, S2) | pass | none |
| S3 > S2 (primary): lower bound of the bootstrap CI above 0 | pass | diff 36.8% CI [25.0%, 49.1%], McNemar p=0.0000 |
| chain stratum evidenced for S3 | pass | 20 chain trials |
| every S3 request admitted under planned limits (observation <= 40,000 bytes, request <= 262,144 bytes) | pass | 134/134 |
| HZ-1 no gate-admitted executable wrong-element ACTION or COMPLETE (S3) | FAIL | 3 found (17 wrong-element ACTIONs incl. refused); e.g. iana-assert-01|0|S3|2|1, dt-neg-02|0|S3|1|1, dt-neg-02|0|S3|2|1 |
| HZ-2 no wrong-unique durability result (S3) | pass | 0 wrong-unique in 315 resolved trials |
| HZ-3 no leak in harness outputs or the S3 payload | pass | 0 blocking (harness-level 0, S3 0); other S-arm hits 0; A0/A1 production findings 0 (outside SPK-07 gating); 315 files scanned |
| HZ-4 no mask difference | pass | 0 differences |
| HZ-5 all hostile and injection cases passed | FAIL | hostile 16/20, injected 15/15 |
| F1 conformance recorded PASS | pass | /Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/evaluation/grounding/runs/f1-20261026-1126 |
| HZ-6 no engine/public mismatch on the corpus (S3) | pass | 0 mismatches in 315 checked trials |

### Stage 4: NO-GO

| check | result | detail |
|---|---|---|
| finished-task minimum on the visual strata (>= min(planned, 24)) | pass | 58/58 tasks finished |
| no unresolved infrastructure errors (S4, S3) | pass | none |
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

