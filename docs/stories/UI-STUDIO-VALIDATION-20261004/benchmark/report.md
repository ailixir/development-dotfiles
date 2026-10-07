# Gemini translation strategy benchmark — 2026-10-04

- Run by: @qa (Quinn). Report transcribed by Orion from the agent's final summary, because the agent's harness could not write this file. Raw data: `results.jsonl` (350 judged compiles) and `summary.json`.
- Budget: 473 of 500 model calls, concurrency 4. Vertex `epicagentai` / `global`, ADC user credentials.
- Harness: `scratchpad/bench/` (session scratchpad, not committed).

## Verdict

Today's production config (gemini-3.8-flash, thinking MEDIUM, current provider schema): **NEEDS_WORK**.

## Fidelity

- A Java probe ran the backend's own compiled classes against a loopback capture server. The Node payload builder matched the wire bodies **byte for byte in 91/91 cases**: 13 cases × LOW/MEDIUM/HIGH, systemInstruction off, thinkingConfig off, maxOutputTokens 4096, and the envelope-repair request.
- Writable step IDs matched.
- Only the HTTP headers differ (ADC user credentials vs the production service-account SDK headers).

## Pipeline per compile

Strict parser (closed rejection codes) → server-side assembler → the runner's production validator and executor from `dist` in real Chromium against loopback fixtures → judged by `oracle.mjs` plus a required-operation check.

- Oracle self-test (no model calls): 8/8 gold artifacts judged correct; 5/5 mutants judged wrong, including 3 that PASSed execution but were semantically wrong.
- The secret value never reached a prompt or a response.

## Phases

- **P1** — the original brief: prompt 2.2.0, 60s timeout, first attempt only.
- **A/B** — tuning: 9 configs screened at 1 rep, then the top 3 confirmed at 3 reps. Uses prompt 2.3.0, 150s/240s, and mirrors the envelope repair.
- Not tested: structured output off (production cannot turn it off) and temperature (production never sends it). Validator-rejection repair was not simulated because nothing failed the validator (0/247).
- Caveat: in `results.jsonl` the stage A/B rows (`S1`–`S9`) carry the phase label `X candidate-schema diagnostic`. The rows themselves are intact.

## Findings

1. **HIGH — every correct refusal is lost.** The models omit `message` on UNSUPPORTED/CLARIFICATION steps because `providerSchema` requires only `stepId` and `status` (`GenAiLlmGatewayClient.java:439`). The parser requires `reason` and `message`, so it rejects the response.
   - Both repairs repeat the omission, and the compile ends `GATEWAY_PARSE_FAILURE` instead of NEEDS_REVISION.
   - 52/60 negative compiles ended this way: 170 rejections, each costing 3 calls. Repair fixed 1.
   - A candidate schema (per-status `anyOf` requiring `reason` and `message`) gave **8/8 correct refusals in one attempt**, and the positive cases still passed (3/3). n is small.
2. **thinking LOW ≥ MEDIUM ≥ HIGH on quality, and 3–6× faster.**
   - Positive cases: LOW 21/24 (P1) and 22/27 (A+B); MEDIUM 20/24 (P1) and 6/9 (A); HIGH 15/24 (P1, with 7 timeouts at 60s).
   - Per-attempt latency at LOW: p50 2.8s, p95 18.3s.
   - For `Click the button`, every non-LOW config generated `getByRole('button').click()` (11×; fails at runtime). LOW never did.
3. **maxOutputTokens 4096 truncates.** One MAX_TOKENS at MEDIUM, because thinking counts against the cap. Turning systemInstruction off or thinkingConfig off brought no quality gain and was slower.
4. **The only pro model reachable is gemini-3.1-pro-preview** (3.5-pro and 3.8-pro return 404). It was not better and made 2 false refusals.
5. **Ambiguous locators are unsolved by any config.**
   - Google-like page (C07): every config scored 0. Every model wrote `getByRole('searchbox')`, but the field is a combobox.
   - Wikipedia hidden twin (C13): rule 7 scored 3/3 vs 2/3 without it.
   - Overall, rule 7 scored 23/27 vs 22/27, which is noise, and it adds a role-guessing risk.

## Recommended configuration

| Setting | Current | Recommended | Note |
|---|---|---|---|
| model | gemini-3.8-flash | keep | |
| `studio.compile.gateway.thinking-level` | MEDIUM | **LOW** | no prompt bump, but thinking level is a fingerprint input, so every test recompiles once |
| thinking-config, system-instruction | on | keep on | |
| max-output-tokens | 32768 | keep | 4096 truncates |
| request-timeout | 150s | keep | a LOW success took 126.7s, and timeouts are not retried |
| attempt-budget / repair max-attempts | 240s / 2 | keep | |
| max-concurrency | 4 | keep | |
| provider schema | `stepId`, `status` required | **per-status `anyOf`** | code change; bump `providerSchemaVersion`; R2D2 proxy acceptance of `anyOf` untested |
| rule 7 (VAL-014) | absent | **defer** | would need `PROMPT_VERSION` 2.4.0 |

## Not proven

- n is 3 reps × 13 cases, so differences of 1–2 counts are noise.
- The fixture pages are synthetic, not enterprise apps, and the authoring contexts were empty.
- Cost is null: pricing could not be sourced. Token counts are in `summary.json`.
- The R2D2 proxy path was not tested.
