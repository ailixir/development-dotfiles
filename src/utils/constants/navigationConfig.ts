import { NavigationItem } from '../../types/common/commonTypes';

export const CHECKS_NAVIGATION: NavigationItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: 'home',
    description: 'Attention, CSIs, and upcoming',
  },
  {
    id: 'all-checks',
    label: 'All Checks',
    path: '/checks/all',
    icon: 'checklist',
    description: 'Manage and monitor all checks',
  },
  {
    id: 'create-check',
    label: 'Create Check',
    path: '/checks/create',
    icon: 'add_circle',
    description: 'Build new health checks',
  },
  {
    id: 'checks-studio',
    label: 'Checks Studio',
    path: '/checks/studio',
    icon: 'movie',
    description: 'UI test automation studio',
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/checks/reports',
    icon: 'assessment',
    description: 'Analytics and reporting',
  },
];

// Navigation registration for @put/core-components
export const CHECKS_MODULE_CONFIG = {
  moduleId: 'checks',
  moduleLabel: 'Checks',
  version: '1.0.0',
  navigation: CHECKS_NAVIGATION,
};