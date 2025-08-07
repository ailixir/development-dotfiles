# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PUT Checks Module** is a React micro-frontend module for the Production Unified Toolkit (PUT) platform at Citibank. It serves as the centralized orchestration and standardization layer for operational health monitoring, integrating with existing tools like ITRS, Splunk, Grafana, and AppDynamics without replacing them.

**Key Organizing Principle:** All checks are associated with the Citi System Inventory (CSI) as the primary categorization system.

## Architecture

### Technology Stack
- **Framework:** React 18 with TypeScript (strict mode)
- **Build Tools:** 
  - Vite for standalone development (`npm run dev`)
  - Webpack with Module Federation for production (`npm run dev:fed`)
- **UI Library:** Material-UI (MUI) v7 with Emotion styling
- **Routing:** React Router v7
- **State Management:** Redux Toolkit + React Context
- **Authentication:** OIDC-React with JWT token handling
- **Testing:** Vitest (unit tests) + Cypress (E2E tests)
- **API Mocking:** Mock Service Worker (MSW) for development

### Deployment Modes
1. **Standalone Mode** (`npm run dev` - port 5173): Full development with welcome page and sidebar
2. **Federated Mode** (`npm run dev:fed` - port 3002): Module Federation integration testing

## Common Development Commands

### Setup and Development
```bash
# Initial setup (recommended)
./scripts/setup.sh

# Manual setup
npm install
npm run msw:init

# Development servers
npm run dev          # Standalone mode (port 5173)
npm run dev:fed      # Federated mode (port 3002)
```

### Code Quality and Testing
```bash
npm run type-check   # TypeScript validation
npm run lint         # ESLint checking
npm run lint:fix     # Auto-fix lint issues

npm run test         # Unit tests with Vitest
npm run test:ui      # Test UI
npm run test:e2e     # Cypress E2E tests
```

## Development Approach

### Mock-First Development
**CRITICAL:** All API interactions use Mock Service Worker (MSW) during development. This enables:
- Independent frontend development without backend dependency
- Full functionality testing with realistic data
- Stakeholder demos before backend completion

Mock handlers are located in `src/services/mocks/` and provide realistic API responses for all check types, CSI data, and execution results.

### Module Federation Integration
The module exposes `./ChecksModule` via Module Federation and integrates with the PUT Platform Shell using:
- `PlatformSidebar` from `@put/core-components` for navigation
- Adaptive layouts that detect standalone vs federated deployment
- Event communication with host application

## Key Features and Components

### Core Check Types
1. **Basic Checks:** HTTP/HTTPS endpoints, TCP port connectivity
2. **Integration Checks:** Splunk queries, Grafana metrics, ITRS samplers, AppDynamics health rules
3. **UI Test Checks:** No-code browser automation with "Checks Studio"

### Checks Studio (UI Testing)
**Philosophy:** "From Checklist to Reality" - users write plain English steps and watch video proof of execution.

**Three-Panel Interface:**
- Left: Test steps in numbered list format
- Middle: Control panel with "Run Test" button and live logs
- Right: Video playback synchronized with test steps

### Navigation Structure
```
📁 Checks Module
├── 🏠 Dashboard - Health overview
├── 📋 All Checks - Check management  
├── ➕ Create Check - New check builder
├── 🎬 Checks Studio - UI testing
└── 📊 Reports - Analytics & reporting
```

## Code Organization

```
src/
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
```

### Environment Configuration
- **Vite dev server** (port 5173) → Standalone mode with full navigation
- **Webpack dev server** (port 3002) → Federated mode for platform integration
- Environment variables in `.env.development` control MSW enablement and API URLs

## Development Rules

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
- **E2E Tests:** Cypress for critical paths like check creation and execution
- **Mock Data:** Comprehensive test scenarios including error states and edge cases