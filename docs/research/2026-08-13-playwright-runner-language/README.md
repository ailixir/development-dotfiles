# Playwright runner language (2026-08-13)

**TL;DR:** Isolate Chromium in a new component. Implement that runner in **TypeScript/Node**, not Python or Java. Reuse the existing `parseSteps.ts` IR. Keep Python codegen as an export-only FE feature.

| File | Contents |
|---|---|
| [00-query-original.md](./00-query-original.md) | Ask + constraints |
| [01-deep-research-prompt.md](./01-deep-research-prompt.md) | Sub-queries + sources |
| [02-research-report.md](./02-research-report.md) | Findings |
| [03-recommendations.md](./03-recommendations.md) | Decision + next steps |

Architecture canvas (proposal): `canvases/studio-execution-architecture.canvas.tsx` in the Cursor project.
