# Project "Checks" — Monorepo

Centralized orchestration and standardization layer for operational health monitoring at Citibank. Sits above ITRS, Splunk, Grafana, and AppDynamics — organized by **CSI (Citi System Inventory)**.

See [`PRD.md`](./PRD.md) for product requirements (v2.2) and [`ARCH.md`](./ARCH.md) for the technical architecture.

## Repository Layout

```
put-checks/
├── frontend/          React 18 + TypeScript MFE (Vite + Webpack/Module Federation)
├── backend/           Java 21 + Spring Boot 3 (Gradle KTS) — in development
├── docs/              Stories, specs, architecture docs (AIOX convention)
│   ├── stories/
│   ├── specs/
│   └── architecture/
├── PRD.md             Product Requirements (v2.2)
├── ARCH.md            Technical Architecture
├── CLAUDE.md          Project-level instructions for Claude Code
└── README.md          (this file)
```

## Quick Start

### Frontend
```bash
cd frontend/
npm install
npm run msw:init
npm run dev              # Webpack/MF on :3002
npm run dev:standalone   # Vite standalone on :5173
```
See [`frontend/README.md`](./frontend/README.md) for full details.

### Backend
```bash
cd backend/
./gradlew bootRun        # Spring Boot on :8080, local profile (Zonky embedded Postgres)
./gradlew test           # Unit + Testcontainers integration tests
```
_(Backend scaffold in progress — see [`docs/specs/backend/`](./docs/specs/backend/).)_

## Development Methodology

This repo follows AIOX (Agent-Orchestrated System) conventions:

- **Story-driven development** — work tracked in `docs/stories/`.
- **Agent delegation** — `@pm`, `@architect`, `@sm`, `@po`, `@dev`, `@qa`, `@devops` (see `CLAUDE.md`).
- **Spec Pipeline → SDC** — complex features pass through `gather → assess → research → spec → critique → plan` before implementation.

## Status

| Layer | Phase | Notes |
|---|---|---|
| Frontend | **Phase 1 — Prototype (MSW-mocked)** | Ready for stakeholder demos |
| Backend | **Phase 2 — Spec Pipeline** | See `docs/specs/backend/` |
