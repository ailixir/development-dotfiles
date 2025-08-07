# 🏛️ PUT Core Components Demo

Simple examples showing how to use `@put/core-components` in your applications.

## Quick Start

```bash
# Run the demo
npm run dev
# Visit http://localhost:3010
```

## Usage Examples

### 1. PlatformHeader (for Platform Shell)

Use **PlatformHeader** in your main app shell for global navigation:

```jsx
import { PlatformHeader } from '@put/core-components';

function AppShell() {
  const [currentModule, setCurrentModule] = useState('home');
  
  return (
    <div>
      <PlatformHeader
        currentModule={currentModule}
        onModuleChange={setCurrentModule}
        notifications={3}
        user={{ 
          name: 'John Doe', 
          role: 'Senior Engineer' 
        }}
        platformTitle="Production Unified Toolkit"
      />
      <main style={{ paddingTop: '88px' }}>
        {/* Your app content */}
      </main>
    </div>
  );
}
```

**Key Props:**
- `currentModule` - Active module ID (e.g., 'health', 'dns')
- `onModuleChange` - Callback when user switches modules
- `notifications` - Badge count for notifications
- `user` - User info object with name and role

### 2. PlatformSidebar (for Modules)

Use **PlatformSidebar** inside individual modules for page navigation:

```jsx
import { PlatformSidebar, navigationRegistry } from '@put/core-components';

// First, register your module's navigation
navigationRegistry.register({
  moduleId: 'health',
  moduleLabel: 'Health Monitoring',
  version: '1.0.0',
  navigation: [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/health',
      icon: 'dashboard',
      description: 'Overview & analytics'
    },
    {
      id: 'monitors',
      label: 'Monitors', 
      path: '/health/monitors',
      icon: 'monitor_heart',
      description: 'System monitoring'
    }
  ]
});

// Then use the sidebar in your module
function HealthModule() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  return (
    <div style={{ display: 'flex' }}>
      <PlatformSidebar
        currentModule="health"
        currentPage={currentPage}
        onPageChange={(pageId, path) => {
          setCurrentPage(pageId);
          // Handle routing to path
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={setSidebarCollapsed}
      />
      <main className={`module-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Your module pages */}
      </main>
    </div>
  );
}
```

**Key Props:**
- `currentModule` - Module ID that matches your registered navigation
- `currentPage` - Active page ID within the module
- `onPageChange` - Callback with (pageId, path) when user navigates
- `isCollapsed` - Sidebar collapsed state
- `onToggleCollapse` - Callback when user toggles sidebar

### 3. Complete Layout Example

```jsx
import { PlatformHeader, PlatformSidebar } from '@put/core-components';

function App() {
  const [currentModule, setCurrentModule] = useState('health');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Global header */}
      <PlatformHeader
        currentModule={currentModule}
        onModuleChange={setCurrentModule}
        notifications={5}
        user={{ name: 'Jane Smith', role: 'DevOps Engineer' }}
      />
      
      {/* Module sidebar */}
      <PlatformSidebar
        currentModule={currentModule}
        currentPage={currentPage}
        onPageChange={(pageId, path) => {
          setCurrentPage(pageId);
          // Your routing logic here
          window.history.pushState({}, '', path);
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={setSidebarCollapsed}
      />
      
      {/* Page content */}
      <main className={`module-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <YourPageComponent />
      </main>
    </div>
  );
}
```

## Required CSS

Add this CSS for proper layout:

```css
.module-content {
  padding-top: 114px;    /* Account for header */
  margin-left: 200px;    /* Account for sidebar */
  padding: 114px 24px 24px 24px;
  transition: margin-left 300ms ease;
}

.module-content.sidebar-collapsed {
  margin-left: 80px;     /* Collapsed sidebar width */
}

@media (max-width: 1024px) {
  .module-content {
    margin-left: 0;
    padding: 114px 16px 24px 16px;
  }
}
```

## Navigation Registration

Register your module's navigation before using PlatformSidebar:

```jsx
import { navigationRegistry } from '@put/core-components';

navigationRegistry.register({
  moduleId: 'dns',
  moduleLabel: 'DNS Management', 
  version: '1.0.0',
  navigation: [
    { id: 'dashboard', label: 'DNS Dashboard', path: '/dns', icon: 'dashboard' },
    { id: 'domains', label: 'Domains', path: '/dns/domains', icon: 'public' },
    { id: 'records', label: 'DNS Records', path: '/dns/records', icon: 'dns' }
  ]
});
```

## Material Icons

The components use Material Icons. Include in your HTML:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
```

Available icons: `dashboard`, `monitor_heart`, `notifications_active`, `settings`, `public`, `dns`, `security`, etc.

## Demo Files

- **`public/working-demo.html`** - Complete working example
- **`server.js`** - Demo server

## Getting Started

1. Install: `npm install @put/core-components`
2. Import components as shown above
3. Register navigation for your modules
4. Add required CSS
5. Include Material Icons

That's it! 🚀