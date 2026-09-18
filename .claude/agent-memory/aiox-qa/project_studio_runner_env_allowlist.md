---
name: studio-runner-env-allowlist
description: studio-runner's browser-child env allowlist is a recurring attack surface — two distinct classes of key defeat the sandbox, and the second is still open
metadata:
  type: project
---

`studio-runner/src/run/launcher.ts` builds the browser child's environment from an enumerated
allowlist (`INHERITED_ENV_KEYS`). Two *classes* of key on it can produce an unsandboxed Chromium,
and the epic's sandbox gates (one literal launch site, an eslint `no-restricted-syntax` rule, a
repo-wide flag scan) see only the repository, so neither leaves a diff to catch.

1. **Code-loading keys** — `NODE_OPTIONS` ran a `--require`/`--import` preload inside the child and
   rewrote `chromiumSandbox: true`. **Closed** in story 10.12 by dropping it, adding a prefix-class
   guard over `NODE_`/`LD_`/`DYLD_`/`OPENSSL_` re-checked on every launch, and setting
   `execArgv: []` (`fork` otherwise replays the *runner's own* interpreter flags into the child).
2. **Registry-redirecting keys** — `PLAYWRIGHT_BROWSERS_PATH` and `HOME` choose where the browser
   binary comes from, so a shim registry launches an attacker-chosen Chromium. **Still open**
   (SEC-2, medium), assigned to AC-6b / 10.18. `chromiumBuild` is recorded at build time and
   nothing reads the running browser's identity.

**Why:** class 2 cannot be closed the way class 1 was — ADR-001 §4.2 makes
`PLAYWRIGHT_BROWSERS_PATH` the mechanism by which the pinned image locates its browsers.

**How to apply:** when any story touches `launcher.ts`, `main.ts` wiring or the Dockerfile,
re-check `INHERITED_ENV_KEYS` against *both* classes, and check `execArgv` is still explicitly
empty. When a story claims "no key, env, field or path can unset X", attack the runtime surface,
not only the diff — see [[qa-review-verification-depth]].
