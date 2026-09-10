# Original query

**Date:** 2026-08-13  
**Ask:** Isolate the Playwright runner as its own component. Include PUT organization and new repos. Research the best Playwright language (Python vs Node.js vs Java) given Checks Studio requirements.

## Inferred context

- **focus:** comparison + architecture
- **temporal:** recent (Playwright 1.59+ screencast API)
- **domain:** Playwright, Node.js/TypeScript, Python, Java, Kubernetes, Sonic (S3-compatible), PUT Checks

## Product constraints (must honor)

- Priya: plain-English steps → real browser → step results + video proof synced to steps
- CSI-scoped; secrets/variables; no secrets in videos/logs
- Object storage = Sonic, not public AWS
- Isolated runner (not in-process in Spring Boot)
- Prefer decisions we can ship; no video-processing service
