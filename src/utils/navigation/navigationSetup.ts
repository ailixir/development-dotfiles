import { navigationRegistry } from '@put/core-components';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  navigationRegistry.register({
    moduleId: 'checks',
    moduleLabel: 'Checks',
    moduleIcon: 'monitor_heart',
    version: '1.0.0',
    navigation: [
      { id: 'home', label: 'Home', path: '/', icon: 'home', description: 'Attention, CSIs, and upcoming' },
      // CSIs entry removed
      
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
        id: 'checks',
        label: 'Checks',
        path: '/checks/all',
        icon: 'checklist',
        description: 'View and manage checks',
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/checks/reports',
        icon: 'assessment',
        description: 'Reporting checks',
      },
      // Activity and Schedules intentionally removed from sidebar
    ]
  });
};

// Helper function to get current page ID from path
export const getCurrentPageId = (pathname: string): string => {
  if (pathname === '/') return 'home';
  // CSIs removed
  // Checks parent should highlight when in checks area
  if (pathname.startsWith('/checks/all')) return 'checks';
  if (pathname.startsWith('/checks/create')) return 'checks';
  // templates removed
  // Studio sub-nav
  if (pathname.startsWith('/checks/studio/runs')) return 'studio-runs';
  if (pathname.startsWith('/checks/studio/tests')) return 'studio-tests';
  if (pathname.startsWith('/checks/studio')) return 'studio-tests';
  // Reports parent should highlight when in reports area
  if (pathname.startsWith('/checks/reports/new')) return 'reports';
  if (pathname.startsWith('/checks/reports/') && pathname.endsWith('/edit')) return 'reports';
  if (pathname.startsWith('/checks/reports')) return 'reports';
  // Standalone (activity and schedules removed)
  return 'dashboard';
};