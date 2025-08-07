# PUT Checks Module

> 🎯 **Centralized Operational Health Monitoring** - A micro-frontend module for orchestrating monitoring across enterprise systems without replacing existing tools.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue.svg)](https://typescript.org)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://react.dev)
[![Material-UI](https://img.shields.io/badge/MUI-7+-blue.svg)](https://mui.com)
[![Module Federation](https://img.shields.io/badge/Module%20Federation-Enhanced-green.svg)](https://module-federation.io)

## 🚀 Quick Start

```bash
# Clone and setup
git clone <repository-url>
cd put-checks

# Run setup script (recommended)
chmod +x scripts/setup.sh
./scripts/setup.sh

# OR manual setup
npm install
npm run msw:init

# Start development
npm run dev          # Standalone mode (http://localhost:5173)
npm run dev:fed      # Federated mode (http://localhost:3002)
```

## 🎯 What Is This?

The **PUT Checks Module** is the first micro-frontend in the Production Unified Toolkit platform. It provides:

- **🏥 Health Check Orchestration** - Unified interface for all operational checks
- **🎨 Local Navigation** - PlatformSidebar for module-level navigation
- **🔧 Dual-Mode Deployment** - Works standalone or as federated module
- **📊 CSI-Centric Organization** - Everything organized by Citi System Inventory
- **🎭 Mock-First Development** - Full functionality with MSW before backend

## 🏗️ Architecture

### **Adaptive Layout System**

The module automatically adapts to its deployment context:

```typescript
// Automatically chooses the right layout
<LayoutProvider>
  <Routes>
    <Route path="/dashboard" element={<DashboardPage />} />
    {/* Other routes automatically get proper navigation */}
  </Routes>
</LayoutProvider>
```

### **Deployment Modes**

| Mode | URL | Use Case | Navigation |
|------|-----|----------|------------|
| **Standalone** | `http://localhost:5173` | Development & demos | Full sidebar + welcome page |
| **Federated** | `http://localhost:3002` | Integration testing | Sidebar integrated with host |

### **Navigation Structure**

```
📁 Checks Module
├── 🏠 Dashboard - Health overview
├── 📋 All Checks - Check management
├── ➕ Create Check - New check builder
├── 🎬 Checks Studio - UI testing
└── 📊 Reports - Analytics & reporting
```

## 🛠️ Development

### **Local Development Commands**

```bash
# Development (choose one)
npm run dev          # Vite standalone (recommended for feature dev)
npm run dev:fed      # Webpack federated (for integration testing)

# Code quality
npm run type-check   # TypeScript validation
npm run lint         # ESLint checking
npm run lint:fix     # Auto-fix lint issues

# Testing
npm run test         # Unit tests with Vitest
npm run test:ui      # Test UI
npm run test:e2e     # Cypress E2E tests
```

### **Project Structure**

```
src/
├── components/
│   ├── layout/              # 🔥 Adaptive layouts
│   │   ├── LayoutProvider   # Auto-detects context
│   │   ├── ChecksLayout     # Sidebar navigation
│   │   └── StandaloneLayout # Simple layout
│   ├── common/              # Shared components
│   └── [features]/          # Feature-specific components
├── pages/                   # Route components
├── store/                   # Redux Toolkit state
├── services/
│   └── mocks/              # 🎭 MSW API mocking
├── types/                  # TypeScript definitions
└── utils/                  # Utilities & config
```

## 🎨 UI Components

### **Local Navigation**

Uses `PlatformSidebar` for module-level navigation. The platform shell handles global navigation:

```typescript
import { PlatformSidebar } from '@put/core-components';

// Module provides navigation config, platform renders sidebar
<PlatformSidebar
  currentModule="checks"
  currentPage={currentPage}
  pages={CHECKS_NAVIGATION}
  onPageChange={handlePageChange}
  isCollapsed={sidebarCollapsed}
/>
```

### **Responsive Design**

- **📱 Mobile-First**: Responsive sidebar that collapses automatically
- **🎯 Accessible**: Full keyboard navigation and screen reader support
- **🎨 Consistent**: Citibank design system with Material-UI v7

## 🧪 Mock Service Worker (MSW)

All API interactions are mocked for development:

```typescript
// Realistic API responses
GET /api/checks        → List of health checks
POST /api/checks       → Create new check
GET /api/csi           → CSI catalog
POST /api/execution    → Execute check
```

The mock handlers provide realistic data and simulate network delays for a production-like experience.

## 🔧 Module Federation

### **Exposed Components**

```javascript
// webpack.config.js
exposes: {
  "./ChecksModule": "./src/bootstrap"
}
```

### **Shared Dependencies**

```javascript
shared: {
  react: { singleton: true, eager: true },
  "react-dom": { singleton: true, eager: true },
  "@mui/material": { singleton: true, eager: true },
  // ... other shared deps
}
```

### **Integration with Host**

The module emits events for host communication:

```typescript
// Module change events
window.dispatchEvent(new CustomEvent('checks:moduleChange', {
  detail: { moduleId: 'newModule', from: 'checks' }
}));
```

## 🎯 Features by Phase

### ✅ **Phase 1: Foundation (COMPLETE)**
- [x] Module Federation setup
- [x] Professional navigation with PlatformSidebar
- [x] Adaptive layouts (standalone/federated)
- [x] MSW API mocking
- [x] TypeScript type system
- [x] Redux Toolkit state management

### 🔄 **Phase 2: Check Management (NEXT)**
- [ ] Check Builder with 6 check types
- [ ] Check List with filtering
- [ ] Check Details and execution
- [ ] CSI integration

### 📋 **Phase 3: Checks Studio**
- [ ] Three-panel UI testing interface
- [ ] Plain English test commands
- [ ] Video recording and playback
- [ ] Step-by-step execution

### 📊 **Phase 4: Reports & Analytics**
- [ ] Email report builder
- [ ] Live preview
- [ ] Scheduled delivery
- [ ] Cross-CSI reporting

## 🔍 Environment Configuration

The module uses environment variables for different contexts:

```env
# .env.development
VITE_ENABLE_MSW=true
VITE_API_BASE_URL=http://localhost:3002/api
VITE_DEBUG_MODE=true
```

Environment detection automatically adapts behavior:
- **Vite dev server** (port 5173) → Standalone mode
- **Webpack dev server** (port 3002) → Federated mode
- **Production** → Module federation mode

## 🧩 Dependencies

### **Core Dependencies**
- **React 18+** - Modern concurrent features
- **TypeScript 5.2+** - Strict type safety
- **Material-UI v7** - Enterprise UI components
- **@put/core-components** - Platform navigation components

### **Development Dependencies**
- **@module-federation/enhanced** - Latest Module Federation
- **MSW** - API mocking
- **Vitest** - Fast unit testing
- **Cypress** - E2E testing

## 📚 Documentation

- **[📋 Implementation Plan](./CHECKS_IMPLEMENTATION_PLAN.md)** - Detailed development roadmap
- **[📖 PRD](./PRD.md)** - Product requirements and features
- **[🏗️ Architecture](./ARCH.md)** - Technical architecture overview
- **[🎮 Core Components Demo](./demo/README.md)** - Navigation component examples

## 🤝 Contributing

### **Development Workflow**

1. **Feature Development**: Use `npm run dev` for fast iteration
2. **Integration Testing**: Use `npm run dev:fed` to test Module Federation
3. **Type Safety**: Run `npm run type-check` before committing
4. **Testing**: Write tests for new features

### **Code Standards**

- **TypeScript**: Strict mode enabled
- **ESLint**: React hooks rules enforced
- **Prettier**: Consistent formatting
- **Conventional Commits**: Structured commit messages

## 🎉 Success Metrics

### ✅ **Current Status**
- Clean navigation separation (platform vs module)
- Module Federation ready for platform integration
- Responsive across all devices
- Works offline with MSW
- Local navigation complete for all module pages

### 🎯 **Goals**
- < 500KB initial bundle size
- < 1.5s First Contentful Paint
- < 3s Time to Interactive
- 90%+ code coverage
- Zero accessibility violations

---

## 🚀 Getting Started

Ready to explore the Checks module?

```bash
# Quick start
./scripts/setup.sh && npm run dev
```

Then visit `http://localhost:5173` to see the welcome page with full navigation!

For federated mode testing: `npm run dev:fed` → `http://localhost:3002`

---

**Built with ❤️ for the PUT Platform** | [Documentation](./CHECKS_IMPLEMENTATION_PLAN.md) | [Architecture](./ARCH.md)
