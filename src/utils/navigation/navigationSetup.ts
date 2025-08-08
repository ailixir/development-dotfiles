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
        id: 'checks',
        label: 'Checks',
        path: '/checks/all',
        icon: 'monitor_heart',
        description: 'View and manage checks'
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
  if (pathname.startsWith('/checks/all') || pathname.startsWith('/checks/create')) return 'checks';
  if (pathname.startsWith('/checks/studio')) return 'checks-studio';
  if (pathname.startsWith('/checks/reports')) return 'reports';
  return 'dashboard';
};