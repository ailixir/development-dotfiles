---
name: two-context-one-database
description: How to boot a second Spring context against the SAME test database in put-checks — two traps make it silently use a different one
metadata:
  type: project
---

Booting a second `SpringApplication` in an IT to prove cross-replica behaviour needs **two**
command-line overrides, or it silently attaches to a *different* database and the test proves
nothing:

1. `--spring.profiles.active=test` — `SpringApplicationBuilder.profiles("test")` only *adds* a
   profile. `application.yml` sets `spring.profiles.active: local`, which stays on and activates
   `LocalEmbeddedPostgresConfig` → a Zonky embedded Postgres of its own (`.../postgres`).
2. `--spring.datasource.url=<url read off context A's live connection>` plus
   `driver-class-name=org.postgresql.Driver`, `username/password=test`, `spring.flyway.enabled=false`.
   The `jdbc:tc:postgresql:...` URL in `application-test.yml` hands out a **new container** per
   context, not a shared one.

Both must be **command-line args**, not `SpringApplicationBuilder.properties(...)` — those are
*default* properties and sit below `application-test.yml`.

**Why:** both failure modes look identical from the outside — the second context just sees an empty
schema — so a cross-replica assertion built on either one is comparing two unrelated databases
while appearing to pass or fail for plausible reasons.

**How to apply:** use `src/test/java/.../studio/SecondApplicationContext.java` (added in story 10.7)
rather than rebuilding the builder call. Related: [[epic10-falsification-standard]].
