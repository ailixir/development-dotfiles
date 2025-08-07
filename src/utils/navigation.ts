import type { PageConfig } from '@/types/navigation.types';

// Navigation configuration for the Checks module
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
  },
];

// Module information for the header
export const CHECKS_MODULE_INFO = {
  id: 'checks',
  name: 'Checks',
  description: 'Operational Health Monitoring',
  version: '1.0.0',
  icon: 'health_and_safety',
};

// Helper function to get current page from path
export const getCurrentPageFromPath = (pathname: string): string => {
  // Remove leading slash and any trailing slashes
  const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
  
  // Handle root path
  if (!cleanPath || cleanPath === '') {
    return 'dashboard';
  }
  
  // Handle dynamic routes (e.g., /123/edit -> edit)
  const pathSegments = cleanPath.split('/');
  
  // Check for exact matches first
  const exactMatch = CHECKS_NAVIGATION.find(page => 
    page.path === `/${cleanPath}` || page.path === `/${pathSegments[0]}`
  );
  
  if (exactMatch) {
    return exactMatch.id;
  }
  
  // Handle special cases
  if (pathSegments.length > 1) {
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment === 'edit') {
      return 'create-check'; // Edit uses the same page as create
    }
  }
  
  // Check if it's a check details page (ID only)
  if (pathSegments.length === 1 && /^[a-zA-Z0-9-_]+$/.test(pathSegments[0])) {
    return 'checks-list'; // Details page belongs to checks list
  }
  
  // Default to dashboard
  return 'dashboard';
};

// Helper function to get page title
export const getPageTitle = (pageId: string): string => {
  const page = CHECKS_NAVIGATION.find(p => p.id === pageId);
  return page?.title || 'Dashboard';
};

// Helper function to check if a path is active
export const isPathActive = (currentPath: string, targetPath: string): boolean => {
  if (currentPath === targetPath) return true;
  
  // Handle nested routes
  if (targetPath !== '/dashboard' && currentPath.startsWith(targetPath)) {
    return true;
  }
  
  return false;
};
