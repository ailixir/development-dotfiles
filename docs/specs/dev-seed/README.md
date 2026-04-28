# Dev Seed Data — Spec Pipeline

Spec Pipeline artifacts for the `dev` Spring profile sample data population (`../../../backend/`).

## Phases (per `.claude/rules/workflow-execution.md`)

| Phase | Owner | Artifact | Status |
|---|---|---|---|
| 1. Gather | @pm | `requirements.json` | DONE |
| 2. Assess complexity | @architect | `complexity.json` | DONE |
| 3. Research | @analyst | `research.json` | DONE |
| 4. Write spec | @pm | `spec.md` | DONE |
| 5. Critique | @qa | `critique.json` | DONE |
| 6. Implementation plan | @architect | `implementation.yaml` | DONE |

## Complexity Classification

**SIMPLE** (score 7/25) — justified by:
- New profile config + 1 repeatable SQL migration only
- No external integrations; purely local developer tooling
- No production code changes
- Reuses existing Zonky embedded Postgres infrastructure

## Constitutional Gate (Article IV — No Invention)

Every statement in `spec.md` traces to:
- A functional/non-functional requirement in `requirements.json`
- The existing schema in `V1__init.sql` through `V5__story_3_schema_additions.sql`
- Flyway documentation findings in `research.json`

No invented features.
