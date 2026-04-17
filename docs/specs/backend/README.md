# Backend Spec Pipeline

Spec Pipeline artifacts for the Java 21 / Spring Boot 3 backend (`../../../backend/`). Every phase output traces to `PRD.md` and `ARCH.md`.

## Phases (per `.claude/rules/workflow-execution.md`)

| Phase | Owner | Artifact | Status |
|---|---|---|---|
| 1. Gather | @pm | `requirements.json` | ⏳ pending |
| 2. Assess complexity | @architect | `complexity.json` | ⏳ pending |
| 3. Research | @analyst | `research.json` | ⏳ pending |
| 4. Write spec | @pm | `spec.md` | ⏳ pending |
| 5. Critique | @qa | `critique.json` | ⏳ pending |
| 6. Implementation plan | @architect | `implementation.yaml` | ⏳ pending |

## Complexity Expectation

**COMPLEX** (score ≥16) — justified by:
- Multi-service integration (ITRS, Splunk, Grafana, AppDynamics, CSI API, Vault, SMTP, Selenium Grid, S3)
- 99.95% uptime SLO + 500 RPS throughput
- Regulated environment (SSO/OIDC, RBAC, secrets vault)
- UI test infrastructure (browser automation, video storage)

## Constitutional Gate (Article IV — No Invention)

Every statement in `spec.md` MUST trace to:
- `PRD.md` FR-*/NFR-*/user-story
- `ARCH.md` §{n}
- A research finding in `research.json`

No invented features.
