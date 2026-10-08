---
name: vertex-model-access-epicagentai
description: Which Gemini models the epicagentai Vertex project can actually call (global location), as probed 2026-10-04 for the UI Studio benchmark
metadata:
  type: reference
---

Vertex project `epicagentai`, location `global`, endpoint https://aiplatform.googleapis.com, ADC user token + `x-goog-user-project: epicagentai`:
- gemini-3.8-flash: callable (production default).
- gemini-3.1-pro-preview: callable (only "pro" available).
- gemini-3.5-pro, gemini-3.8-pro: 404 for generateContent (3.5-pro metadata GET returns 200 but generate is denied).

Benchmark results live in docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/ (results.jsonl, summary.json). Key finding there: providerSchema not requiring `message` makes every model refusal end as GATEWAY_PARSE_FAILURE — see [[ui-studio-benchmark]].
