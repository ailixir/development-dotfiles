# Recommendations

1. **Create an isolated Studio runner** — no Chromium in `put-checks` API or check-worker pods.
2. **Language: TypeScript/Node** (Playwright ≥ 1.59). Interpret IR; do not exec codegen.
3. **New repo:** `put-checks-studio-runner`. Optional bootstrap: `studio-runner/` inside `put-checks` until the repo exists.
4. **Shared IR:** extract `packages/studio-ir` (or `@put/studio-ir`) from `parseSteps.ts` + types. Frontend and runner depend on it. **Do not port IR to Java.**
5. **Job protocol:** Spring Boot owns auth, CSI, secrets, DB. Runner owns browser + local webm + Sonic put. No user cookies, no Postgres, no Vault on the runner.
6. **Python codegen stays in the MFE** (already shipped). A BE codegen endpoint is not on the V1 path.
7. **Do not build** Selenium Grid, a video-processing service, or Playwright-in-the-Spring-JAR.

## Next steps

- **@architect / PO:** sign off language + new repo vs monorepo folder.
- **@pm:** split stories: IR package, runner skeleton, claim/job API, Sonic, FE seek.
- **@dev:** implement only after that sign-off. This folder is research, not an implementation spec.
