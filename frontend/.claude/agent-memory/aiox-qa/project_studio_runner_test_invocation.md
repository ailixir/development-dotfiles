---
name: studio-runner-test-invocation
description: How to run narrow studio-runner vitest files without pnpm install (pnpm exec refuses; coverage gate and deployment config quirks)
metadata:
  type: project
---

In `studio-runner/`, `pnpm exec vitest` fails with "This project is configured to use npm" (packageManager field), even though plans claim `pnpm exec` works. User rule forbids npm, so run the local binary: `./node_modules/.bin/vitest run --coverage.enabled=false <files>`.

**Why:** a narrow run with coverage on fails the global thresholds (0% on untouched dirs), and `test/deployment/**` is excluded from the default config.

**How to apply:** for helm-render tests use `--config vitest.deployment.config.ts test/deployment/<file>` (needs `helm` on PATH, present at /opt/homebrew/bin). `frontend/` accepts `pnpm exec vitest run` fine.
