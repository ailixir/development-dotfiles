# `docs/` — Project "Checks" Documentation

AIOS-conventional documentation tree. All agent-driven artifacts (stories, specs, epics) live here.

## Layout

| Path | Purpose | Owner |
|---|---|---|
| `stories/` | SDC stories (`{epic}.{story}.story.md`) | @sm drafts → @po validates → @dev implements |
| `epics/` | Epic manifests (`EPIC-{id}-EXECUTION.yaml`) | @pm |
| `specs/backend/` | Spec Pipeline artifacts for backend (requirements, complexity, research, spec, critique, implementation plan) | @pm + @architect + @analyst + @qa |
| `architecture/` | Sharded architecture docs (may supplement `../ARCH.md`) | @architect |
| `prd/` | Sharded PRD sections (may supplement `../PRD.md`) | @pm / @po |

## Cross-references

- Product requirements source of truth → [`../PRD.md`](../PRD.md)
- Architecture source of truth → [`../ARCH.md`](../ARCH.md)
- Agent authority + workflow rules → `../.claude/rules/`

## Current Status

- [ ] Backend spec pipeline — see [`specs/backend/`](./specs/backend/)
- [ ] First epic (M1 Walking Skeleton) — pending spec approval
