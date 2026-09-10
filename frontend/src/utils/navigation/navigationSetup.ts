import { navigationRegistry } from '@put/core-components';
import { store } from '@/store';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  const state = store.getState();
  const sources = state.sources?.data ?? [];
  const features = state.features?.features ?? [];

  const isSourceOn = (type: string) =>
    sources.length === 0 || sources.find((s) => s.type === type)?.enabled !== false;
  const isFeatureOn = (key: string) =>
    features.length === 0 || features.find((f) => f.key === key)?.enabled !== false;

  const studioVisible = isSourceOn('UI_TEST') && isFeatureOn('STUDIO');
  const reportsVisible = isFeatureOn('REPORTS');

  const navigation = [
    { id: 'home', label: 'Home', path: '/checks', icon: 'home', description: 'Attention, CSIs, and upcoming' },
    ...(studioVisible
      ? [
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
        ]
      : []),
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
  if (pathname.startsWith('/checks/create') || pathname.startsWith('/checks/prototype')) return 'checks';
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