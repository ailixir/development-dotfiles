import { navigationRegistry } from '@put/core-components';
import { store } from '@/store';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  const state = store.getState();
  const features = state.features?.features ?? [];

  const isFeatureOn = (key: string) =>
    features.length === 0 || features.find((f) => f.key === key)?.enabled !== false;

  const reportsVisible = isFeatureOn('REPORTS');

  const navigation = [
    { id: 'home', label: 'Home', path: '/checks', icon: 'home', description: 'Attention, CSIs, and upcoming' },
    {
      id: 'checks',
      label: 'Checks',
      path: '/checks/all',
      icon: 'checklist',
      description: 'View and manage checks',
    },
    ...(reportsVisible
      ? [
          {
            id: 'reports',
            label: 'Reports',
            path: '/checks/reports',
            icon: 'assessment',
            description: 'Reporting checks',
          },
        ]
      : []),
  ];

  navigationRegistry.register({
    moduleId: 'checks',
    moduleLabel: 'Checks',
    moduleIcon: 'monitor_heart',
    version: '1.0.0',
    navigation,
  });
};

// Helper function to get current page ID from path
export const getCurrentPageId = (pathname: string): string => {
  if (pathname === '/checks' || pathname === '/') return 'home';
  // CSIs removed
  // Checks parent should highlight when in checks area
  if (pathname.startsWith('/checks/all')) return 'checks';
  if (pathname.startsWith('/checks/ui-tests')) return 'checks';
  if (pathname.startsWith('/checks/create') || pathname.startsWith('/checks/prototype')) return 'checks';
  // templates removed
  // Reports parent should highlight when in reports area
  if (pathname.startsWith('/checks/reports/new')) return 'reports';
  if (pathname.startsWith('/checks/reports/') && pathname.endsWith('/edit')) return 'reports';
  if (pathname.startsWith('/checks/reports')) return 'reports';
  // Standalone (activity and schedules removed)
  return 'dashboard';
};