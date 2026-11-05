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

Each component starts with its own Node launcher, `scripts/dev.mjs`, in its own terminal, in this order.
No Docker and no bash: the launchers are plain Node, for Windows, macOS and Linux alike (PowerShell 5.1 has no
`&&`, so there run the `cd` and the `node` command one after the other).

```bash
cd studio-runner && node scripts/dev.mjs   # 1. browser runner (and the shared local setup the backend reads)
cd backend && node scripts/dev.mjs         # 2. Spring Boot on :8080 (--seed for sample data) + Core stand-in
cd frontend && node scripts/dev.mjs        # 3. Vite on :5173, proxying /api/v1 to the backend
```

Each can be restarted on its own; Ctrl+C stops only what that launcher started. See "Run locally" in
[`studio-runner/README.md`](./studio-runner/README.md), [`backend/README.md`](./backend/README.md) and
[`frontend/README.md`](./frontend/README.md) for prerequisites, ports, the shared directory and `.env.local` keys
(including Vertex for Run Test), and each README's "Windows" section for what Windows needs and what stays Linux-only.
Windows: not verified (no Windows run is recorded yet).

Tests: `cd frontend && pnpm exec vitest run` (MSW runs in Node); `cd backend && ./gradlew test` (`gradlew.bat test` on
Windows; embedded Postgres, no Docker).

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
