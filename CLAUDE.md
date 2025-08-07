# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PUT Checks Module** is a micro-frontend for centralized operational health monitoring at Citibank. It's designed as an orchestration layer that integrates with existing monitoring tools (ITRS, Splunk, Grafana, AppDynamics) rather than replacing them.

**Architecture**: React 18+ TypeScript SPA using Module Federation, with Citi System Inventory (CSI) as the organizing principle for all checks and data.

## Development Commands

### Primary Development
```bash
# Standalone development (recommended for feature development)
npm run dev          # Vite dev server on port 5173

# Federated module development (for integration testing)
npm run dev:fed      # Webpack dev server on port 3002

# Setup (run once)
./scripts/setup.sh   # Recommended setup script
npm run msw:init     # Initialize Mock Service Worker
```

### Build Commands
```bash
npm run build                # Production build (Module Federation)
npm run build:standalone     # Standalone build
npm run build:dev           # Development build
```

### Code Quality & Testing
```bash
npm run type-check          # TypeScript validation
npm run lint               # ESLint checking
npm run lint:fix           # Auto-fix lint issues
npm run test              # Unit tests with Vitest
npm run test:ui           # Test UI
npm run test:coverage     # Test coverage
npm run test:e2e          # Cypress E2E tests
npm run test:e2e:open     # Open Cypress UI
```

## Architecture & Patterns

### Dual-Mode Deployment
The application supports two deployment modes via adaptive layouts:
- **Standalone Mode** (port 5173): Full sidebar + welcome page
- **Federated Mode** (port 3002): Integrates with Module Federation host

### State Management
- **Redux Toolkit**: Global state management with slices for checks, studio, reports
- **React Query**: API caching and server state management
- **Context API**: Layout and navigation state

### API Strategy
- **Mock-First Development**: All features start with MSW (Mock Service Worker) handlers
- **Centralized API Client**: All HTTP requests go through a unified client
- **TypeScript API Types**: Strict typing for all API interactions

### Component Architecture
```
src/
├── components/
│   ├── layout/              # Adaptive layout system
│   │   ├── LayoutProvider   # Auto-detects deployment context
│   │   ├── ChecksLayout     # Module navigation sidebar
│   │   └── StandaloneLayout # Simple layout
│   └── common/              # Shared components
├── pages/                   # Route components
├── store/                   # Redux Toolkit slices
├── services/
│   └── mocks/              # MSW API mocking
├── types/                  # TypeScript definitions
└── utils/                  # Configuration & utilities
```

### Key Dependencies
- **@put/core-components**: Platform navigation components (PlatformSidebar)
- **@mui/material v7**: UI component library
- **@reduxjs/toolkit**: State management
- **@tanstack/react-query**: Server state management
- **oidc-react**: Authentication
- **msw**: API mocking
- **framer-motion**: Animations

### Path Aliases (configured in tsconfig.json and vite.config.ts)
```typescript
@/* → ./src/*
@/components/* → ./src/components/*
@/services/* → ./src/services/*
@/types/* → ./src/types/*
@/utils/* → ./src/utils/*
@/store/* → ./src/store/*
```

## Development Workflow

### Mock-First Approach
1. **All new features must start with MSW handlers** in `src/services/mocks/handlers/`
2. Create realistic API responses before building UI components
3. MSW allows full frontend development without backend dependencies

### Module Federation Integration
```javascript
// webpack/webpack.common.js exposes:
"./ChecksModule": "./src/bootstrap"

// Shared dependencies include React, MUI, React Router
```

### Navigation System
Uses `PlatformSidebar` from `@put/core-components` for module-level navigation. The platform shell handles global navigation.

### Testing Strategy
- **Unit Tests**: Vitest + React Testing Library
- **E2E Tests**: Cypress
- **Coverage**: Vitest coverage reports
- **MSW**: Enables testing all API states (loading, error, success)

## Important Notes

### Security & Enterprise Standards
- OIDC authentication with JWT tokens
- Role-based access control (RBAC)
- CSI-based data organization
- Enterprise secrets management integration

### Code Style Requirements
- Strict TypeScript (no `any` types)
- MUI components only (no custom styled components)
- Centralized API client (no direct fetch calls)
- React Query for server state
- Redux Toolkit for client state

### CSI Integration
All checks, dashboards, and reports are organized by **Citi System Inventory (CSI)**. This is the primary organizing principle throughout the application.

### Performance Targets
- < 500KB initial bundle size
- < 1.5s First Contentful Paint
- < 3s Time to Interactive
- Optimized chunk splitting for vendor libraries

When working on this codebase, always consider the dual-mode deployment, mock-first development approach, and CSI-centric organization. The application should work seamlessly in both standalone and federated contexts.