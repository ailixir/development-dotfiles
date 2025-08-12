import { navigationRegistry } from '@put/core-components';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  navigationRegistry.register({
    moduleId: 'checks',
    moduleLabel: 'Checks',
    moduleIcon: 'health_and_safety',
    version: '1.0.0',
    navigation: [
      { id: 'home', label: 'Home', path: '/', icon: 'home', description: 'Attention, CSIs, and upcoming' },
      // CSIs entry removed
      {
        id: 'checks',
        label: 'Checks',
        path: '/checks/all',
        icon: 'monitor_heart',
        description: 'View and manage checks',
        children: [
          { id: 'checks-catalog', label: 'Catalog', path: '/checks/all', icon: 'view_list' },
          { id: 'checks-create', label: 'Create', path: '/checks/create', icon: 'add_circle' },
          { id: 'checks-templates', label: 'Templates', path: '/checks/templates', icon: 'category' },
        ],
      },
      {
        id: 'studio',
        label: 'Studio',
        path: '/checks/studio/tests',
        icon: 'science',
        description: 'UI testing studio',
        children: [
          { id: 'studio-tests', label: 'Tests', path: '/checks/studio/tests', icon: 'science' },
          { id: 'studio-runs', label: 'Runs', path: '/checks/studio/runs', icon: 'movie' },
        ],
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/checks/reports',
        icon: 'assessment',
        description: 'Reporting tools',
        children: [
          { id: 'reports-builder', label: 'Builder', path: '/checks/reports', icon: 'build' },
          { id: 'reports-scheduled', label: 'Scheduled', path: '/checks/reports/scheduled', icon: 'schedule' },
          { id: 'reports-analytics', label: 'Analytics', path: '/checks/reports/analytics', icon: 'analytics' },
        ],
      },
      { id: 'activity', label: 'Activity', path: '/checks/activity', icon: 'dynamic_feed', description: 'Recent changes & executions' },
      { id: 'schedules', label: 'Schedules', path: '/checks/schedules', icon: 'event', description: 'Upcoming schedules' },
    ]
  });
};

// Helper function to get current page ID from path
export const getCurrentPageId = (pathname: string): string => {
  if (pathname === '/') return 'home';
  // CSIs removed
  // Checks sub-nav
  if (pathname.startsWith('/checks/all')) return 'checks-catalog';
  if (pathname.startsWith('/checks/create')) return 'checks-create';
  if (pathname.startsWith('/checks/templates')) return 'checks-templates';
  // Studio sub-nav
  if (pathname.startsWith('/checks/studio/runs')) return 'studio-runs';
  if (pathname.startsWith('/checks/studio/tests')) return 'studio-tests';
  if (pathname.startsWith('/checks/studio')) return 'studio-tests';
  // Reports sub-nav
  if (pathname.startsWith('/checks/reports/scheduled')) return 'reports-scheduled';
  if (pathname.startsWith('/checks/reports/analytics')) return 'reports-analytics';
  if (pathname.startsWith('/checks/reports')) return 'reports-builder';
  // Standalone
  if (pathname.startsWith('/checks/activity')) return 'activity';
  if (pathname.startsWith('/checks/schedules')) return 'schedules';
  return 'dashboard';
};