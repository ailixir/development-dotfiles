---
name: d5-real-backend-smoke-recipe
description: Running the Playwright real-backend project against a local bootRun - env, seed, CORS 403 on POST, PIDs and clean stop
metadata:
  type: reference
---

D5 recipe (OBS-008 L6, 2026-10-17): bootRun through `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py ./gradlew bootRun --no-daemon` with `CHECKS_SOURCE_UI_TEST=true FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed` and node 24 on PATH. `nohup ... &` survives the Bash call; ready at `/actuator/health` in about 20 s warm. The `db/seed/R__sample_data.sql` applies cleanly on V1..V22 (23 migrations validated, CSIs 178672/285614/396705), so no manual CSI insert is needed.

Trap: the browser adds `Origin` to same-origin POST/PUT and Vite's proxy forwards it, so the backend CORS allow-list (`checks.cors.allowed-origins`, localhost 3000/3002/5173) answers 403 "Invalid CORS request" for port 4177. GETs pass, which hides it (preconditions test green, create fails). Fixed in `frontend/e2e/start-servers.mjs` by rewriting Origin in the real-backend proxy; the env alternative is `CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177`. Read the 403 body from the Playwright trace `resources/*.dat`.

Stop: `kill -TERM` the app JVM (grandchild of the lock python: python > gradlew JVM > Gradle JVM > app JVM on `*:8080`); the others exit on their own. Log ends `BUILD FAILED ... exit value 143`, which is normal. Verify the lock with a non-blocking `fcntl.flock` in `python3 -I`.
