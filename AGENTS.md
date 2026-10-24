# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**Project "Checks"** is a monorepo containing a React micro-frontend and a Java 21 / Spring Boot 3 backend for the Production Unified Toolkit (PUT) platform at Citibank. It is the centralized orchestration and standardization layer for operational health monitoring, integrating with ITRS, Splunk, Grafana, and AppDynamics without replacing them.

**Key Organizing Principle:** All checks are associated with the Citi System Inventory (CSI) as the primary categorization system.

### Repository Layout

```
put-checks/
├── frontend/        # React 18 + TypeScript MFE (MSW-mocked; Phase 1)
├── backend/         # Java 21 + Spring Boot 3 + Gradle KTS (Phase 2 — in development)
├── docs/            # AIOX stories, specs, architecture
├── PRD.md           # Product Requirements (v2.2)
├── ARCH.md          # Technical Architecture
└── AGENTS.md        # (this file)
```

Almost all FE commands below must be run from `frontend/`. Backend commands run from `backend/`.

## Architecture

### Technology Stack
- **Framework:** React 18 with TypeScript (strict mode)
- **Build Tools:** 
  - Vite for standalone development (`pnpm run dev:standalone`)
  - Webpack with Module Federation for production (`pnpm run dev`)
- **UI Library:** Material-UI (MUI) v7 with Emotion styling
- **Routing:** React Router v7
- **State Management:** Redux Toolkit + React Context
- **Authentication:** OIDC-React with JWT token handling
- **Testing:** Vitest (unit tests) + Playwright (E2E tests)
- **API Mocking:** Mock Service Worker (MSW) for development

### Deployment Modes
1. **Standalone Mode** (`pnpm run dev:standalone` - port 5173): Full development with welcome page and sidebar
2. **Federated Mode** (`pnpm run dev` - port 3002): Module Federation integration testing

## Common Development Commands

### Frontend (run from `frontend/`)
```bash
cd frontend/

# Setup (pnpm only; frontend/.npmrc sets node-linker=hoisted, which the webpack build needs)
pnpm install
# No msw:init step: there is no browser mock worker and no public/mockServiceWorker.js.
# MSW runs in Node: the Vitest server (src/services/mocks/studio/server.ts) and the
# Playwright proxy (e2e/mswProxy.ts).

# Development servers
pnpm run dev              # Webpack/Module Federation (port 3002)
pnpm run dev:standalone   # Vite standalone (port 5173)

# Quality
pnpm run type-check
pnpm run lint
pnpm run lint:fix

# Tests
pnpm run test             # Vitest
pnpm run test:ui
pnpm run test:e2e         # Playwright, MSW project (CHECKS_E2E_REAL_BACKEND=1 selects real-backend)
```

### Backend (run from `backend/`)
```bash
cd backend/

./gradlew bootRun        # Spring Boot :8080 (local profile → Zonky embedded Postgres)
./gradlew test           # JUnit 5 + Testcontainers
./gradlew check          # Full build gate (spotless, checkstyle, spotbugs, jacoco)
```

## Development Approach

### API Development and Test Mocks
MSW handlers in `frontend/src/services/mocks/` run in Node: the Vitest server
(`frontend/src/services/mocks/studio/server.ts`) and the Playwright `msw` project proxy
(`frontend/e2e/mswProxy.ts`). The browser registers no mock service worker.

Development servers proxy `/api/v1` to the backend. Vite uses `VITE_API_URL`; Webpack
uses `REACT_APP_API_BASE_URL` with `/api` removed. Both default to `http://localhost:8080`.
The Playwright harness points Vite at its Node mock proxy or the selected real backend.

### Module Federation Integration
The module exposes `./ChecksModule` via Module Federation and integrates with the PUT Platform Shell using:
- `PlatformSidebar` from `@put/core-components` for navigation
- Adaptive layouts that detect standalone vs federated deployment
- Event communication with host application

## Key Features and Components

### Core Check Types
1. **Basic Checks:** HTTP/HTTPS endpoints, TCP port connectivity
2. **Integration Checks:** Splunk queries, Grafana metrics, ITRS samplers, AppDynamics health rules
3. **UI Test Checks:** No-code browser automation with "Checks Studio". UI tests are checks: All Checks lists them, Create Check → UI Test creates them, and each has a detail page (Overview and Runs).

### Checks Studio (UI Testing)
**Philosophy:** "From Checklist to Reality" - users write plain English steps and watch video proof of execution.

**Two-Panel Interface** (opened from a UI test):
- Left: Test steps in numbered list format
- Right: Run and proof: "Run Test" button, live logs and video playback synchronized with test steps

### Navigation Structure
```
📁 Checks Module (sidebar)
├── 🏠 Home - Attention, CSIs, and upcoming
├── ✅ Checks - Check management, including UI tests
│   │         (Create Check, including UI Test, opens from this page; it is not a sidebar entry)
│   └── UI test - Overview and Runs; opens Studio
└── 📊 Reports - Reporting checks (hidden only when the REPORTS feature is explicitly disabled)
```

The same registered tree shows in standalone and federated modes. Below 1200 px it opens from the "Navigation" button in standalone mode and comes from the host shell in federated mode.

## Code Organization

```
frontend/src/
├── components/
│   ├── layout/              # Adaptive layouts (LayoutProvider, ChecksLayout)
│   ├── common/              # Shared components
│   └── [features]/          # Feature-specific components
├── pages/                   # Route components
├── store/                   # Redux Toolkit state management
├── services/
│   └── mocks/              # MSW API mocking
├── types/                  # TypeScript definitions
└── utils/                  # Utilities & configuration

backend/src/main/java/com/citi/put/checks/   # bounded contexts (csi, checks, scheduling, …)
backend/src/main/resources/db/migration/     # Flyway forward-only SQL
```

### Environment Configuration
- **Vite dev server** (port 5173) → Standalone mode with full navigation
- **Webpack dev server** (port 3002) → Federated mode for platform integration
- Environment variables in `.env.development` configure API URLs; MSW runs in the Node test harnesses above.

## Development Rules

### Accessibility Scope
- **Functional must-haves only, no WCAG target** (user decision 2026-10-17; `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md`, rule `.claude/rules/accessibility-scope.md`). Do not add screen-reader, live-region, keyboard-shortcut, reduced-motion, axe/contrast or a11y-review work. Keep focus behaviour that is part of a flow, visible labels, and the responsive layout. The WCAG audit regression guard was removed by user decision 2026-10-23; no WCAG or axe work is done.

### Code Quality
- **TypeScript:** Strict mode enabled, no `any` types without justification
- **Components:** Use MUI components and `sx` prop for styling
- **API Calls:** All HTTP requests through centralized API client, no direct `fetch()`
- **Testing:** Unit tests required for business logic, integration tests for components

### Git Workflow
- **Branching:** Feature branches from `develop` (format: `feat/PROJ-123-description`)
- **Commits:** Follow Conventional Commits specification
- **PRs:** Draft PRs early, squash and merge to maintain clean history

### Authentication & Security
- Enterprise SSO integration via OIDC
- Role-based access control based on CSI ownership
- Secrets vault integration for external system credentials
- No hardcoded credentials or API keys

## Important Files and References

### Primary Documentation
- `PRD.md` - Product requirements and user stories
- `ARCH.md` - Technical architecture and implementation plan
- `MFE_GUIDE.md` - Platform shell implementation details  

### Cursor IDE Rules
- `.cursor/rules/project-overview.mdc` - Project context and verification
- `.cursor/rules/development.mdc` - Git workflow and testing requirements
- `.cursor/rules/frontend-react.mdc` - React/TypeScript development standards

## Performance and Integration

### Bundle Optimization
- Module Federation with shared dependencies (React, MUI, etc.)
- Code splitting and lazy loading
- Target: < 500KB initial bundle, < 1.5s First Contentful Paint

### Platform Communication
- Custom events for module change notifications
- Host application integration via `window.dispatchEvent`
- Responsive design with mobile-first approach

## Testing Philosophy

- **Unit Tests:** Vitest + React Testing Library for components and hooks
- **Integration Tests:** Full user flows with MSW API mocking
- **E2E Tests:** Playwright for critical paths like check creation and execution
- **Mock Data:** Comprehensive test scenarios including error states and edge cases

<!-- aiox-lean:begin -->
## AIOX Lean Delivery

The shared Lean workflow is available through this project's
`docs/workflows/lean-delivery.md` and `docs/workflows/lean-delivery.json`.

- Codex: `$aiox-lean` (also available in `/skills`).
- Claude Code and Cursor: `/aiox-lean`.
- Context aliases: `*lean` and `*run-workflow lean-delivery`.
- Terminal: `node tools/aiox-lean.cjs --help` or `node tools/aiox-lean.cjs doctor`.

On explicit Lean selection, require `node tools/aiox-lean.cjs doctor` to succeed,
then read the registration and execute the shared `run-lean-delivery.md` driver
before any generic AIOX workflow/persona dispatch. Do not bypass a failed registration.
Do not route it through a local legacy SDC/spec engine. Loading context or running
help/doctor does not start a feature, create workflow state or migrate active work.
Existing SDC/spec/discovery runs retain their workflow, ownership, status and evidence.
Project requirements, authority, protected-data boundaries and required checks
remain applicable. Lean acceptance is separate from story closure, push and release.
<!-- aiox-lean:end -->
