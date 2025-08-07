export interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasMore?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface FilterParams {
  search?: string;
  [key: string]: any;
}

export type LoadingState = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface AsyncState<T> {
  data: T;
  loading: LoadingState;
  error: string | null;
  lastFetched: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  teams: string[];
  permissions: string[];
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
  badge?: string | number;
}

export type DeploymentMode = 'standalone' | 'federated';

export interface AppConfig {
  apiBaseUrl: string;
  enableMSW: boolean;
  debugMode: boolean;
  version: string;
  buildDate: string;
}