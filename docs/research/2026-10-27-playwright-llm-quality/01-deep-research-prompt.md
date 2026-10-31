# Research questions and method

1. What does the current LLM actually produce, and which component creates Playwright operations?
2. Which prompt, schema, page evidence and Playwright references reach inference?
3. How are page context, request size, output size and repair bounded?
4. Which runtime behaviors differ materially from recommended Playwright behavior?
5. What does an official Playwright skill require, and would it improve this custom gateway?
6. What evidence distinguishes semantic accuracy, gate admission and replay durability?
7. Which incremental changes have the strongest practical case, and how should their benefit be tested?

Method: read current source rather than rely on historical architecture; inspect existing local benchmark summaries; research official Playwright and Google documentation. External Playwright research was delegated under the tech-search workflow. Its specified Haiku worker was unavailable, so the worker inherited the available model. Context7 and Exa tools were unavailable; web search/open supplied primary sources. No live credentials or environment secrets were inspected.

Coverage is sufficient for an architectural assessment and change proposal. Remaining gaps: actual deployed environment overrides, current production token distributions, a fresh full-stack benchmark, and next-day evidence for the exact reviewed build. No quantitative improvement from a proposed skill is claimed.
