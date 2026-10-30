---
name: tooling-live-stack-devtools-db-wipe
description: Live local stack (relaunch.sh) - a Spring DevTools hot restart or a relaunch creates a fresh embedded Postgres (random port) and loses all tests/sessions; recipes to recreate a test, find the port, stop and relaunch cleanly, plus capacity slot sharing
metadata:
  type: project
---

- The embedded Postgres port is random per backend start (`ps aux | grep -o "bin/postgres -D [^ ]* -p [0-9]*"`). A DevTools `restartedMain` (any class/resource change in `backend/build` by anyone's Gradle) re-creates it: **tests and sessions are gone**, GET on an old id answers STUDIO_FORBIDDEN, not 404. Recreate with `POST /studio/tests` (copy configuration/globalContext from `guided/test-ba7b4af6-before.json`); ids cannot be chosen.
- Stop: `kill -TERM $(pgrep -f "guided/dev-guided.sh --seed")` (its trap stops vite, runner, JVM), wait for it to exit; start: `nohup bash guided/relaunch.sh > guided/stack.log 2>&1 & disown`; poll `:8080/actuator/health` and `:5181`. Relaunch also rebuilds the runner dist. A nohup'd job started inside a tool call dies with the call unless disowned; run long vitest via run_in_background instead.
- One learning session per CSI at a time: another agent's session stuck in FINALIZING answers 429 LEARNING_CAPACITY_EXHAUSTED until it EXPIRES (10 min). Check `select session_id,state from studio_guided_sessions` before blaming your change.
- Runner diagnostics are mostly silent: a prepare refusal (TARGET_CHANGED) leaves no log line; read `studio_guided_model_attempts` (rejection_reason, APPLIED vs REJECTED), `studio_guided_actions`, `studio_guided_obligation_admissions`, and the webm in `put-checks-studio-runner.*/objects/studio/<csi>/guided/`. A published learn deletes its own recording.
- Local fixture search page for proof: `scratchpad/search-fixture.mjs` pattern (node http on 48731, `http://localhost:48731/`); no Google CAPTCHA.
