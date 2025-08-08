import { navigationRegistry } from '@put/core-components';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  navigationRegistry.register({
    moduleId: 'checks',
    moduleLabel: 'Checks',
    moduleIcon: 'health_and_safety',
    version: '1.0.0',
    navigation: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: '/checks',
        icon: 'dashboard',
        description: 'Overview & analytics'
      },
      {
        id: 'all-checks',
        label: 'All Checks',
        path: '/checks/all',
        icon: 'monitor_heart',
        description: 'View all health checks'
      },
      {
        id: 'create-check',
        label: 'Create Check',
        path: '/checks/create',
        icon: 'add_circle',
        description: 'Create new health check'
      },
      {
        id: 'checks-studio',
        label: 'Checks Studio',
        path: '/checks/studio',
        icon: 'science',
        description: 'UI testing environment'
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/checks/reports',
        icon: 'assessment',
        description: 'Generate and view reports'
      }
    ]
  });
};

// Helper function to get current page ID from path
export const getCurrentPageId = (pathname: string): string => {
  if (pathname === '/checks' || pathname === '/') return 'dashboard';
  if (pathname.startsWith('/checks/all')) return 'all-checks';
  if (pathname.startsWith('/checks/create')) return 'create-check';
  if (pathname.startsWith('/checks/studio')) return 'checks-studio';
  if (pathname.startsWith('/checks/reports')) return 'reports';
  return 'dashboard';
};