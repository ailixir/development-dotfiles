# PUT Checks Module

> **High-Fidelity MFE Prototype** - A React micro-frontend module for operational health monitoring

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue.svg)](https://typescript.org)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev)
[![Material-UI](https://img.shields.io/badge/MUI-5+-blue.svg)](https://mui.com)
[![Module Federation](https://img.shields.io/badge/Module%20Federation-Enhanced-green.svg)](https://module-federation.io)
[![MSW](https://img.shields.io/badge/MSW-Mock%20API-orange.svg)](https://mswjs.io)

## Run locally

Prerequisites: Node.js (24, like the runner), pnpm (never npm or yarn; `.npmrc` sets `node-linker=hoisted`, which the webpack build needs) and a built `@put/core-components` (`cd ../../put-core-components && npm run build`, then `pnpm install` here). No Docker, no bash.

```bash
node scripts/dev.mjs              # Vite standalone on http://localhost:5173 (also: pnpm run dev:local)
node scripts/dev.mjs --port 5190  # or PUT_CHECKS_FRONTEND_PORT=5190
```

`scripts/dev.mjs` installs dependencies when `node_modules` is missing, frees its port only if this checkout's Vite holds it (its PID file is `pids/frontend.json` in `PUT_CHECKS_LOCAL_DIR`, default `~/.put-checks/local`; any other process on the port stops the script), then runs Vite in the foreground. Ctrl+C stops it.

Start order for the whole local stack: the studio-runner, then the backend, then the frontend (`node scripts/dev.mjs` in each). The frontend alone works against any backend listening on `PUT_CHECKS_BACKEND_PORT` (default 8080). With a non-default frontend port, start the backend with the same `PUT_CHECKS_FRONTEND_PORT`: the backend launcher adds that origin to its CORS list.

The dev server proxies `/api/v1` to `http://localhost:$PUT_CHECKS_BACKEND_PORT` and adds the local dev session cookie (`put_session=local-dev-session`, via `VITE_DEV_SESSION_COOKIE`) unless the request already carries one. Guided publication and replay re-check Core with that cookie, and the local Core stand-in started by the backend launcher accepts it. Vite also reads `frontend/.env.local` (not committed).

### Windows

**Windows: not verified.** No Windows run is recorded yet.

Local development only. Prerequisites, natively (no Docker, no WSL): Node 24 and pnpm; Git for Windows with `git config --global core.longpaths true` and a short clone path (for example `C:\src\put-checks`); the sibling `put-core-components` checkout next to this repository (`../../put-core-components` from `frontend/`), built before `pnpm install`; a non-admin shell for the backend's embedded Postgres; and `PLAYWRIGHT_DOWNLOAD_HOST` pointing at the bank Artifactory mirror for `pnpm exec playwright install chromium`. The commands are the same: `node scripts/dev.mjs`, `pnpm run type-check`, `pnpm run lint`, `pnpm exec vitest run`, `pnpm run build` (the build script no longer sets `NODE_ENV` the POSIX way; it passes `--node-env production` to webpack) and `pnpm exec playwright test --project=msw`. The realsite-gate (`e2e/realsite-gate`) needs Docker and stays Linux/macOS-only, like the image build and Helm.

`pnpm run dev` (Webpack Module Federation, port 3002) is for integrating with the PUT platform host shell, not for running the app locally.

```bash
# Unit tests, and browser specs (Playwright, MSW project)
pnpm exec vitest run
pnpm run test:e2e
```

There is no browser Mock Service Worker: no `msw:init` step and no `public/mockServiceWorker.js`.
MSW runs in Node, in the Vitest server (`src/services/mocks/studio/server.ts`) and in the Playwright
proxy (`e2e/mswProxy.ts`). The `real-backend` Playwright project is selected with
`CHECKS_E2E_REAL_BACKEND=1` and needs the backend running (`CHECKS_E2E_BACKEND_URL`, default
`http://127.0.0.1:8080`).

## Environment Variables

These env vars make the module environment-agnostic across local dev, CI/CD, and hosted environments.

- **PUBLIC_PATH**: Base URL from which static assets and `remoteEntry.js` are served.
  - Default: `auto` (Webpack infers at runtime)
  - Example (CDN build):
  ```bash
  PUBLIC_PATH=https://cdn.example.com/checks/ pnpm run build
  ```

- **HOST**: Dev server host for `pnpm start`.
  - Default: `0.0.0.0`
  - Example:
  ```bash
  HOST=0.0.0.0 pnpm start
  ```

- **PORT**: Dev server port for `pnpm start`.
  - Default: `3002`
  - Example:
  ```bash
  PORT=4002 pnpm start
  ```

Notes:
- If `PUBLIC_PATH` is not set, `publicPath` uses `auto`, which works in most hosting setups and Module Federation hosts.
- Set `PUBLIC_PATH` in CI when serving assets from a CDN or non-root path.
 - Both Webpack and Vite load environment variables via dotenv. Create a `.env` file in the project root (not committed) or set vars in your shell/CI.
   - Example `.env`:
   ```bash
   PUBLIC_PATH=https://cdn.example.com/checks/
   HOST=0.0.0.0
   PORT=3002
   ```

## Scope

### Dashboard (Fully Functional)
- **Health Metrics**: Real-time status cards with passing/failing/warning checks
- **System Overview**: Uptime and response time monitoring
- **Recent Activity**: Live activity feed with color-coded status updates
- **Quick Actions**: Navigation shortcuts to other modules

### Navigation (Complete)
- **Adaptive Layout**: Automatically detects standalone vs federated mode
- **Responsive Sidebar**: Collapsible navigation with icons and descriptions
- **Five Main Pages**: Dashboard, All Checks, Create Check, Checks Studio, Reports

### Mock API (Comprehensive)
- **6 Check Types**: HTTP, TCP, Splunk, Grafana, ITRS, AppDynamics, UI Tests
- **CSI Integration**: Mock CSI entities with applications and metadata
- **Execution Results**: Realistic check execution with success/failure scenarios
- **WebSocket Simulation**: Real-time updates for Studio and reports

## Architecture

### Module Federation Ready
```javascript
// Exposed for host consumption
exposes: {
  "./ChecksModule": "./src/bootstrap.tsx"
}

// Shared dependencies with host
shared: ['react', 'react-dom', '@mui/material', ...]
```

### Dual Build System
- **Vite**: Lightning-fast development with HMR
- **Webpack**: Module Federation for production deployment

### State Management
- **Redux Toolkit**: Async operations with proper error handling
- **React Query**: Data fetching and caching layer
- **Context API**: UI state and layout management

## Project Structure

```
src/
├── components/
│   ├── layout/              # LayoutProvider, ChecksLayout
│   └── shared/              # ErrorBoundary, reusable components
├── pages/                   # Route components (5 main pages)
├── store/                   # Redux slices for state management
├── services/
│   ├── api/                 # API client and service functions
│   └── mocks/              # MSW handlers with realistic data
├── types/                   # TypeScript type definitions
└── utils/                  # Constants, helpers, navigation config
```

#### MSW Dev Toggles (via apiClient)
- Set in `localStorage` to simulate scenarios at runtime:
  - `__msw_debug_slow`: number (ms) to delay responses
  - `__msw_debug_fail`: HTTP status to force failure (e.g., `500`)
  - `__msw_debug_empty`: `1` to force empty responses

### Testing Ready
- **Vitest**: Fast unit testing with React Testing Library
- **MSW Integration**: Mock API responses in tests
- **Coverage Reports**: Detailed test coverage analysis

## Getting Started!

When integrated with the PUT Platform Shell:

```typescript
// Host application imports the module
const ChecksModule = React.lazy(() => import('checks/ChecksModule'));

// Module provides routing for /checks/* paths
<Route path="/checks/*" element={<ChecksModule />} />
```

The module automatically detects federated mode and adapts its layout accordingly.

---

This implementation provides a high-fidelity prototype that demonstrates all core concepts and is ready for integration testing with the host application.