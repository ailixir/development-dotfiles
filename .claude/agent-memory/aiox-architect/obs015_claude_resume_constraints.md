---
name: obs015-claude-resume-constraints
description: OBS-015 resume in Claude Code — global source-freeze per collector run, JOIN Core/Vault are in-JVM fakes, durable supervisor recommended DROP, row-85 A/B/C question
metadata:
  type: project
---

OBS-015 resumed in Claude Code on 2026-10-16 UTC. Plan: `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/claude-resume-plan-015.md`.

- The collector `run-backend-tasked.py` → `run-backend.py` hashes the WHOLE repo source+dist before and after the run. An edit to any file during a run turns it RED, so "disjoint file" parallelism applies only between runs, never during them.
- In GuidedPublicationReplayIT, "Core" is an in-JVM HttpServer and "Vault" is FakeStudioVaultProvider. Only Docker (Testcontainers PG15) is external. Whether a "real Core/Vault authority" tier is required is a QA question to settle up front.
- New JOIN methods must also be registered in build.gradle.kts lane sets, or `requireFreshGuidedPartitions` fails the final check.
- I recommended dropping the durable supervisor (no AC needs it; background Bash plus the collector receipt are enough). The coordinator decides.
- Row 85 is still the one user decision: A keep (015 cannot reach strict PASS), B fixture-owned tie amendment (probabilistic), C user-only waiver.

**Why:** these constraints were not obvious from the handoff and drove the wave design.
**How to apply:** when sequencing any later 015/008 runs, alternate source windows with runs. Re-verify these facts against the files before relying on them.
