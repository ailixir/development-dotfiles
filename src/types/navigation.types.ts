// Navigation types for the Checks module
export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
  badge?: number | string;
  children?: NavigationItem[];
}

export interface NavigationSection {
  id: string;
  title: string;
  items: NavigationItem[];
}

export interface ChecksModuleNavigation {
  sections: NavigationSection[];
}

// Navigation state management
export interface NavigationState {
  currentPage: string;
  sidebarCollapsed: boolean;
  activePath: string;
}

// Page configuration for PlatformSidebar
export interface PageConfig {
  id: string;
  title: string;
  path: string;
  icon: string;
  description?: string;
  badge?: number | string;
  disabled?: boolean;
}
