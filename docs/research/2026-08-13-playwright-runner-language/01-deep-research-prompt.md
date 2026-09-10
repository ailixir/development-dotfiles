# Research prompt

## Main topic

Best Playwright language and repo shape for an isolated Checks Studio runner.

## Sub-queries

1. Official Playwright language support: what is shared vs what differs (Node / Python / Java)?
2. Video + `page.screencast` (v1.59+) availability and chapter markers per language.
3. Threading / concurrency model per binding (service, not test-runner).
4. Official Docker images and Chromium-in-K8s constraints.
5. Devil’s advocate: keep Java because the backend team is Java.
6. Project-specific fit: existing `parseSteps.ts` IR vs existing Python codegen.

## Sources used

- https://playwright.dev/docs/languages
- https://playwright.dev/docs/api/class-screencast
- https://playwright.dev/docs/docker + `/python/docs/docker` + `/java/docs/docker`
- https://playwright.dev/java/docs/multithreading
- https://playwright.dev/python/docs/library (threading: not thread-safe)
- Context7: `/microsoft/playwright`, `/microsoft/playwright-python`, `/microsoft/playwright-java`
- In-repo: `frontend/src/utils/studio/ir/parseSteps.ts`, `frontend/src/utils/studio/codegen/pythonGenerator.ts`, spec.md §9, research.json PW-*
