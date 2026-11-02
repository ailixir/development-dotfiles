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

Each component starts with its own `dev.sh`, in its own terminal, in this order. No Docker.

```bash
cd studio-runner && ./dev.sh   # 1. browser runner (and the shared local setup the backend reads)
cd backend && ./dev.sh         # 2. Spring Boot on :8080 (--seed for sample data) + Core stand-in
cd frontend && ./dev.sh        # 3. Vite on :5173, proxying /api/v1 to the backend
```

Each can be restarted on its own. See "Run locally" in [`studio-runner/README.md`](./studio-runner/README.md),
[`backend/README.md`](./backend/README.md) and [`frontend/README.md`](./frontend/README.md) for
prerequisites, ports, the shared directory and `.env.local` keys (including Vertex for Run Test).

Tests: `cd frontend && pnpm exec vitest run` (MSW runs in Node); `cd backend && ./gradlew test`.

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
