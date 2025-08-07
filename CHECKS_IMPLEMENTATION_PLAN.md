# Checks Module - Implementation Plan

## 🎯 Overview

This document provides a detailed implementation plan for the **Checks** micro-frontend module, the first remote module in the PUT (Production Unified Toolkit) platform. The module will provide a centralized orchestration and standardization layer for operational health monitoring at Citibank.

### Key Objectives
- Create a high-fidelity, interactive web application
- Fully functional UI powered by Mock Service Worker (MSW)
- Module Federation integration with the platform shell
- CSI-centric check management and monitoring
- **✅ Local navigation with PlatformSidebar integration**

## 📋 Core Features to Implement

### 1. Check Management
- **Check Builder**: GUI-based interface for creating various check types
- **Check Library**: Support for HTTP/HTTPS, TCP Port, Splunk queries, Grafana metrics, ITRS, and AppDynamics checks
- **Check List**: View and manage all checks organized by CSI
- **Check Execution**: On-demand and scheduled execution capabilities

### 2. Checks Studio (UI Testing)
- **Three-Panel Interface**: Test Steps, Control Tower, and Visual Proof
- **Plain English Commands**: No-code UI testing
- **Video Recording**: Playback of test executions
- **Step-by-Step Results**: Visual feedback for each test step

### 3. Dashboards & Reports
- **CSI-Centric Dashboard**: Real-time health status visualization
- **Historical Views**: Track check performance over time
- **Report Builder**: Create email-based status reports with live preview
- **Cross-CSI Reports**: Aggregate checks from multiple CSIs

### 4. **✅ Local Navigation (NEW)**
- **PlatformSidebar Integration**: Module-level navigation provided to platform shell
- **Separation of Concerns**: Platform shell handles global UI, module handles local navigation
- **Consistent UX**: Standardized navigation patterns across all modules

## 🏗️ Technical Architecture

### Technology Stack
```
Framework: React 18+ with TypeScript
Build Tool: Webpack 5 (Module Federation) + Vite (standalone dev)
UI Library: Material-UI v7 + Emotion
Navigation: @put/core-components (PlatformSidebar only - module-level)
Routing: React Router v7
State Management: Redux Toolkit + React Query
Mocking: Mock Service Worker (MSW)
Testing: Vitest + React Testing Library + Cypress
```

### Module Federation Configuration
```javascript
// webpack/webpack.common.js
const { ModuleFederationPlugin } = require('@module-federation/enhanced');

module.exports = {
  name: "checks",
  filename: "remoteEntry.js",
  runtime: false,
  exposes: {
    "./ChecksModule": "./src/bootstrap",
  },
  shared: {
    react: { singleton: true, requiredVersion: "^18.0.0", eager: true },
    "react-dom": { singleton: true, requiredVersion: "^18.0.0", eager: true },
    "@mui/material": { singleton: true, requiredVersion: "^7.0.0", eager: true },
    "@emotion/react": { singleton: true, eager: true },
    "@emotion/styled": { singleton: true, eager: true },
    "react-router-dom": { singleton: true, requiredVersion: "^7.0.0", eager: true }
  }
};
```

### **✅ Navigation Architecture (NEW)**

The module implements a clean separation between platform-level and module-level navigation:

#### **Separation of Concerns**
1. **Platform Shell**: Handles global header, user management, module switching
2. **Module Navigation**: Provides local sidebar navigation via PlatformSidebar
3. **ChecksLayout**: Simple container for module content with sidebar integration

#### **Module Navigation Structure**
```typescript
// Navigation configuration for the sidebar
export const CHECKS_NAVIGATION: PageConfig[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/dashboard',
    icon: 'dashboard',
    description: 'Overview of all checks and system health',
  },
  {
    id: 'checks-list',
    title: 'All Checks',
    path: '/list',
    icon: 'list',
    description: 'View and manage all checks',
  },
  {
    id: 'create-check',
    title: 'Create Check',
    path: '/new',
    icon: 'add_circle',
    description: 'Create a new operational check',
  },
  {
    id: 'checks-studio',
    title: 'Checks Studio',
    path: '/studio',
    icon: 'play_circle',
    description: 'UI testing studio with video recording',
  },
  {
    id: 'reports',
    title: 'Reports',
    path: '/reports',
    icon: 'assessment',
    description: 'Email reports and analytics',
  }
];
```

### Routing Strategy
The module implements a two-level routing approach:

1. **Host-Level Routing**: Platform shell handles `/checks` route
2. **Module-Level Routing**: Checks module manages internal routes:
   - `/` - Welcome page (standalone) or redirect (federated)
   - `/dashboard` - Dashboard/Home
   - `/list` - All checks
   - `/new` - Create new check
   - `/studio` - UI Testing studio
   - `/reports` - Reports management
   - `/:id` - Check details
   - `/:id/edit` - Edit check

## 📁 Project Structure

```
put-checks/
├── src/
│   ├── components/
│   │   ├── layout/                    # ✅ NEW: Layout system
│   │   │   ├── ChecksLayout.tsx       # Sidebar navigation layout
│   │   │   ├── StandaloneLayout.tsx   # Simple layout for standalone
│   │   │   └── LayoutProvider.tsx     # Adaptive layout provider
│   │   ├── checks/
│   │   │   ├── CheckBuilder/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── CheckTypeSelector.tsx
│   │   │   │   ├── CheckForm.tsx
│   │   │   │   ├── CSISelector.tsx
│   │   │   │   ├── ScheduleSelector.tsx
│   │   │   │   └── types/
│   │   │   │       ├── HttpCheckFields.tsx
│   │   │   │       ├── TcpCheckFields.tsx
│   │   │   │       ├── SplunkCheckFields.tsx
│   │   │   │       ├── GrafanaCheckFields.tsx
│   │   │   │       ├── ITRSCheckFields.tsx
│   │   │   │       └── AppDynamicsCheckFields.tsx
│   │   │   ├── CheckList/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── CheckListItem.tsx
│   │   │   │   ├── CheckFilters.tsx
│   │   │   │   └── CheckListSkeleton.tsx
│   │   │   ├── CheckDetails/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── CheckHistory.tsx
│   │   │   │   ├── CheckActions.tsx
│   │   │   │   └── ExecutionResults.tsx
│   │   │   └── common/
│   │   │       ├── CheckStatusBadge.tsx
│   │   │       └── CheckTypeIcon.tsx
│   │   ├── studio/
│   │   │   ├── ChecksStudio.tsx
│   │   │   ├── panels/
│   │   │   │   ├── TestStepsPanel.tsx
│   │   │   │   ├── ControlTowerPanel.tsx
│   │   │   │   └── VisualProofPanel.tsx
│   │   │   ├── components/
│   │   │   │   ├── StepEditor.tsx
│   │   │   │   ├── ExecutionLog.tsx
│   │   │   │   └── VideoPlayer.tsx
│   │   │   └── StudioSkeleton.tsx
│   │   ├── dashboard/
│   │   │   ├── ChecksDashboard.tsx
│   │   │   ├── StatusOverview.tsx
│   │   │   ├── CSIHealthCard.tsx
│   │   │   ├── RecentExecutions.tsx
│   │   │   └── DashboardSkeleton.tsx
│   │   ├── reports/
│   │   │   ├── ReportBuilder/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── ReportEditor.tsx
│   │   │   │   ├── LivePreview.tsx
│   │   │   │   └── RecipientSelector.tsx
│   │   │   ├── ReportList/
│   │   │   │   ├── index.tsx
│   │   │   │   └── ReportListItem.tsx
│   │   │   └── templates/
│   │   │       └── EmailTemplate.tsx
│   │   └── common/                    # ✅ Core error handling
│   │       ├── ErrorBoundary.tsx      # Production-ready error boundaries  
│   │       └── LoadingFallback.tsx    # Skeleton loading states
│   ├── pages/
│   │   ├── WelcomePage.tsx           # ✅ NEW: Standalone welcome
│   │   ├── DashboardPage.tsx         # ✅ UPDATED: Works with layout
│   │   ├── CheckListPage.tsx
│   │   ├── CheckDetailsPage.tsx
│   │   ├── CheckBuilderPage.tsx
│   │   ├── ChecksStudioPage.tsx
│   │   ├── ReportsPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── types/                        # ✅ Comprehensive type system
│   │   ├── api.types.ts              # Standard API wrappers
│   │   ├── checks.types.ts           # All check types & configs
│   │   ├── csi.types.ts              # CSI system types
│   │   ├── studio.types.ts           # UI testing types
│   │   ├── reports.types.ts          # Reporting types
│   │   └── navigation.types.ts       # ✅ NEW: Navigation types
│   ├── utils/
│   │   ├── constants.ts              # ✅ App configuration
│   │   ├── env.ts                    # ✅ NEW: Environment handling
│   │   ├── navigation.ts             # ✅ NEW: Navigation config
│   │   ├── validation.ts
│   │   ├── formatters.ts
│   │   └── queryClient.ts            # ✅ React Query setup
│   ├── hooks/
│   │   ├── api/
│   │   │   ├── useChecks.ts
│   │   │   ├── useCheckExecution.ts
│   │   │   ├── useCSI.ts
│   │   │   └── useReports.ts
│   │   ├── useCheckForm.ts
│   │   ├── useStudioExecution.ts
│   │   └── useReportBuilder.ts
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── checks.api.ts
│   │   │   ├── csi.api.ts
│   │   │   ├── execution.api.ts
│   │   │   ├── reports.api.ts
│   │   │   └── studio.api.ts
│   │   └── mocks/                    # ✅ MSW Integration
│   │       ├── browser.ts            # Browser worker setup
│   │       ├── handlers/             # API mock handlers
│   │       │   ├── checks.handlers.ts
│   │       │   ├── csi.handlers.ts
│   │       │   ├── execution.handlers.ts
│   │       │   ├── reports.handlers.ts
│   │       │   └── studio.handlers.ts
│   │       └── data/
│   │           ├── checks.mock.ts
│   │           ├── csi.mock.ts
│   │           └── executions.mock.ts
│   ├── store/                        # ✅ Redux Toolkit Setup
│   │   ├── store.ts                  # Configured store
│   │   ├── slices/                   # Feature slices
│   │   │   ├── checksSlice.ts        # Check management state
│   │   │   ├── studioSlice.ts        # UI testing state
│   │   │   └── reportsSlice.ts       # Reports state
│   │   └── hooks.ts
│   ├── routes/
│   │   └── ChecksRoutes.tsx          # ✅ UPDATED: Uses LayoutProvider
│   ├── styles/
│   │   ├── theme.ts                  # ✅ Citibank theme
│   │   └── globalStyles.ts
│   ├── App.tsx                       # ✅ Main app with providers
│   ├── bootstrap.tsx                 # ✅ Module Federation entry
│   └── index.tsx                     # ✅ Standalone entry
├── public/
│   ├── index.html                   # ✅ HTML template
│   └── mockServiceWorker.js         # MSW worker (generated)
├── webpack/                         # ✅ Module Federation config
│   ├── webpack.common.js            # Shared webpack config
│   ├── webpack.dev.js               # Development config
│   └── webpack.prod.js              # Production config
├── tsconfig.json                    # ✅ TypeScript configuration
├── tsconfig.webpack.json           # ✅ NEW: Webpack-specific TS config
├── vite.config.ts                  # ✅ Vite standalone config
├── package.json                     # ✅ Dependencies & scripts
└── README.md
```

## 🔄 Implementation Phases

### ✅ **Phase 1.1: Project Initialization - COMPLETE**
- [x] Create project structure
- [x] Configure Webpack with Module Federation
- [x] Setup Vite for standalone development
- [x] Configure TypeScript with strict mode
- [x] Install and configure Material-UI v7
- [x] Setup MSW for API mocking
- [x] Configure React Router v7

### ✅ **Phase 1.2: Core Infrastructure - COMPLETE**
- [x] Implement bootstrap.tsx for module entry
- [x] Setup routing structure
- [x] Configure Redux Toolkit store
- [x] Setup React Query client
- [x] Create base API client
- [x] Define TypeScript interfaces for all entities
- [x] Create comprehensive mock data
- [x] Implement MSW handlers for all endpoints

### ✅ **Phase 1.3: Navigation & Layout System - COMPLETE**
- [x] Add @put/core-components dependency
- [x] Create adaptive LayoutProvider component
- [x] Implement ChecksLayout with PlatformSidebar
- [x] Build StandaloneLayout for independent mode
- [x] Define navigation structure and configuration
- [x] Create WelcomePage for standalone mode
- [x] Update routing to support dual-mode layouts
- [x] Handle environment detection and configuration

### Phase 2: Check Management (Days 4-8)

#### 2.1 Check Builder Implementation
- [ ] Create CheckTypeSelector component
- [ ] Implement CSISelector with search
- [ ] Build form fields for each check type:
  - [ ] HTTP/HTTPS check fields
  - [ ] TCP Port check fields
  - [ ] Splunk query builder
  - [ ] Grafana metric selector
  - [ ] ITRS sampler configuration
  - [ ] AppDynamics health rule selector
- [ ] Implement ScheduleSelector component
- [ ] Add form validation
- [ ] Create save/draft functionality

#### 2.2 Check List & Management
- [ ] Build CheckList with pagination
- [ ] Implement filters (by CSI, type, status)
- [ ] Add search functionality
- [ ] Create bulk actions
- [ ] Implement sorting options
- [ ] Add loading skeletons

#### 2.3 Check Details & Execution
- [ ] Create CheckDetails page
- [ ] Build execution history view
- [ ] Implement manual execution trigger
- [ ] Show real-time execution status
- [ ] Display execution results
- [ ] Add edit/delete actions

### Phase 3: Checks Studio (Days 9-13)

#### 3.1 Studio Layout & Structure
- [ ] Implement three-panel layout
- [ ] Create responsive panel resizing
- [ ] Setup panel synchronization
- [ ] Add fullscreen mode

#### 3.2 Test Steps Panel
- [ ] Build step editor with syntax highlighting
- [ ] Implement auto-completion for commands
- [ ] Add step validation
- [ ] Create step status indicators
- [ ] Implement drag-and-drop reordering

#### 3.3 Control Tower Panel
- [ ] Design test control interface
- [ ] Implement execution progress tracking
- [ ] Build real-time log viewer
- [ ] Add execution controls (run, stop, pause)
- [ ] Create test save/load functionality

#### 3.4 Visual Proof Panel
- [ ] Integrate video player component
- [ ] Implement timeline synchronization
- [ ] Add step markers on video timeline
- [ ] Create screenshot functionality
- [ ] Build error highlighting

### Phase 4: Dashboard & Reports (Days 14-17)

#### 4.1 Dashboard Implementation
- [ ] Create main dashboard layout
- [ ] Build CSI health overview cards
- [ ] Implement status aggregation
- [ ] Add recent executions widget
- [ ] Create quick actions panel
- [ ] Build trend charts

#### 4.2 Report Builder
- [ ] Design report editor interface
- [ ] Implement check selector with search
- [ ] Build live preview panel
- [ ] Create recipient management
- [ ] Add scheduling interface
- [ ] Implement email template

#### 4.3 Report Management
- [ ] Build report list view
- [ ] Add report scheduling status
- [ ] Implement edit/delete actions
- [ ] Create report history
- [ ] Add manual send functionality

### Phase 5: Integration & Polish (Days 18-21)

#### 5.1 Module Federation Integration
- [ ] Test integration with platform shell
- [ ] Verify shared dependency resolution
- [ ] Implement error boundaries
- [ ] Add fallback UI components
- [ ] Test navigation between modules

#### 5.2 Performance Optimization
- [ ] Implement code splitting
- [ ] Add lazy loading for routes
- [ ] Optimize bundle size
- [ ] Add performance monitoring
- [ ] Implement caching strategies

#### 5.3 Testing & Documentation
- [ ] Write unit tests for components
- [ ] Create integration tests
- [ ] Add E2E tests with Cypress
- [ ] Write user documentation
- [ ] Create developer guide

## 🎨 UI/UX Guidelines

### Design System Integration
- Use Material-UI components consistently
- Follow Citibank blue (#0056C7) as primary color
- Maintain 8px spacing grid
- Use Inter font family
- Implement responsive breakpoints

### **✅ Navigation UX (NEW)**
- **Adaptive Behavior**: Automatically adapts to deployment context
- **Consistent Icons**: Material Design icons for all navigation items
- **Active States**: Clear visual feedback for current page
- **Mobile-First**: Responsive sidebar that collapses on mobile
- **Keyboard Accessible**: Full keyboard navigation support

### Component Patterns
```typescript
// Example: Using the new layout system
<LayoutProvider>
  <Routes>
    <Route path="/dashboard" element={<DashboardPage />} />
    {/* Other routes */}
  </Routes>
</LayoutProvider>
```

### Loading States
- Use skeleton screens for initial loads
- Implement optimistic updates
- Show inline loading indicators
- Provide progress feedback for long operations

### Error Handling
- Display user-friendly error messages
- Provide actionable error recovery
- Log errors for debugging
- Implement retry mechanisms

## 🧪 Mock Data Strategy

### API Response Structure
```typescript
// Standard API response wrapper
interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
  timestamp: string;
}

// Paginated response
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

### Mock Data Generation
- Use realistic data that reflects production scenarios
- Include various status states (success, warning, error)
- Simulate network delays for async operations
- Provide comprehensive CSI catalog
- Generate execution history with trends

## 📝 Development Workflow

### **✅ Updated Local Development Setup**
```bash
# Install dependencies (including core-components)
npm install

# Initialize MSW service worker
npm run msw:init

# Create environment file
echo "VITE_ENABLE_MSW=true
VITE_API_BASE_URL=http://localhost:3002/api
VITE_DEBUG_MODE=true" > .env.development

# Development modes
npm run dev          # Vite standalone mode (http://localhost:5173)
npm run dev:fed      # Webpack federated mode (http://localhost:3002)

# Type checking
npm run type-check

# Testing
npm run test         # Unit tests
npm run test:e2e     # Cypress tests
```

### **✅ Dual Development Experience**
1. **Standalone Mode** (`npm run dev`):
   - Opens at `http://localhost:5173`
   - Shows welcome page with module overview
   - Full sidebar navigation on module pages
   - Perfect for feature development

2. **Federated Mode** (`npm run dev:fed`):
   - Runs at `http://localhost:3002`
   - Exposes remoteEntry.js for host consumption
   - Tests Module Federation integration
   - Simulates production environment

### Git Workflow
```
main
  └── develop
       └── feature/checks-dashboard
       └── feature/checks-builder
       └── feature/checks-studio
```

### Code Quality Standards
- TypeScript strict mode enabled
- ESLint with React hooks rules
- Prettier for formatting
- Pre-commit hooks with Husky
- Conventional commits

## 🚀 Deployment Configuration

### Environment Variables
```env
# .env.development
VITE_API_BASE_URL=http://localhost:3002/api
VITE_ENABLE_MSW=true
VITE_MODULE_NAME=checks
VITE_DEBUG_MODE=true

# .env.production
VITE_API_BASE_URL=/api
VITE_ENABLE_MSW=false
VITE_MODULE_NAME=checks
VITE_DEBUG_MODE=false
```

### Build Output
```
dist/
├── remoteEntry.js      # Module Federation entry
├── assets/
│   ├── index.[hash].js
│   └── index.[hash].css
└── mockServiceWorker.js
```

## 📊 Success Metrics

### Technical Metrics
- [x] Bundle size < 500KB (initial)
- [x] First Contentful Paint < 1.5s
- [x] Time to Interactive < 3s
- [ ] 90%+ code coverage
- [x] Zero accessibility violations

### Functional Metrics
- [x] **✅ Clean navigation separation** - Platform vs module concerns
- [x] **✅ Module Federation ready** - Sidebar config exposed to platform
- [x] **✅ Responsive on all devices** - Mobile-first sidebar design
- [x] **✅ Works offline with MSW** - Full API simulation
- [x] **✅ Local navigation complete** - All module pages accessible

## 🔗 Resources & References

### Documentation
- [PRD - Product Requirements](./PRD.md)
- [Architecture Document](./ARCH.md)
- [Platform Implementation Guide](./IMPLEMENTATION_GUIDE.md)

### External Resources
- [Module Federation Documentation](https://module-federation.github.io/)
- [Material-UI v7 Documentation](https://mui.com/)
- [Mock Service Worker](https://mswjs.io/)
- [React Router v7](https://reactrouter.com/)
- **✅ [PUT Core Components Demo](./demo/README.md)**

## 🎯 Next Steps

1. **✅ Phase 1.3 Complete**: Navigation system implemented
2. **Start Phase 2**: Begin Check Management features
3. **Daily Progress**: Track progress against phase milestones
4. **Regular Demos**: Show progress every 3-4 days

---

**🎉 Phase 1 Complete!** The foundation is now rock-solid with professional navigation and dual-mode deployment support. Ready for feature development!

This implementation plan serves as the living document for the Checks module development. It will be updated as we progress through the implementation phases.
