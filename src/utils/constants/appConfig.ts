import { AppConfig } from '../../types/common/commonTypes';

// Safe access to Vite env in both Vite and Webpack builds
const viteEnv: Record<string, any> = (() => {
  try {
    return (import.meta as any)?.env ?? {};
  } catch {
    return {};
  }
})();

const getStringEnv = (key: string, fallback?: string): string | undefined => {
  const val = viteEnv[key];
  if (typeof val === 'string' && val.length > 0) return val;
  // Fallback to process.env only when available (e.g., SSR/build tools)
  try {
    if (typeof process !== 'undefined' && (process as any).env) {
      const p = (process as any).env[key];
      if (typeof p === 'string' && p.length > 0) return p;
    }
  } catch {}
  return fallback;
};

const getBoolEnv = (key: string, defaultTrue = true): boolean => {
  const raw = getStringEnv(key);
  if (raw === undefined) return defaultTrue;
  return !(raw === 'false' || raw === '0');
};

export const APP_CONFIG: AppConfig = {
  apiBaseUrl: getStringEnv('VITE_API_BASE_URL', '/api') || '/api',
  enableMSW: getBoolEnv('VITE_ENABLE_MSW', true),
  debugMode: getStringEnv('VITE_DEBUG_MODE') === 'true',
  version: '1.0.0',
  buildDate: new Date().toISOString(),
};

export const API_ENDPOINTS = {
  // Checks endpoints
  CHECKS: '/checks',
  CHECK_BY_ID: (id: string) => `/checks/${id}`,
  EXECUTE_CHECK: (id: string) => `/checks/${id}/execute`,
  CHECK_EXECUTIONS: (id: string) => `/checks/${id}/executions`,

  // CSI endpoints
  CSI: '/csi',
  CSI_BY_ID: (id: string) => `/csi/${id}`,
  CSI_APPLICATIONS: (id: string) => `/csi/${id}/applications`,
  CSI_HEALTH: (id: string) => `/csi/${id}/health`,
  CSI_SEARCH: '/csi/search',
  CSI_BUSINESS_UNITS: '/csi/business-units',
  CSI_USER_PERMISSIONS: '/csi/user-permissions',

  // Reports endpoints
  REPORTS: '/reports',
  REPORT_BY_ID: (id: string) => `/reports/${id}`,
  REPORT_PREVIEW: (id: string) => `/reports/${id}/preview`,
  REPORT_EXECUTIONS: (id: string) => `/reports/${id}/executions`,

  // Studio endpoints
  STUDIO_TESTS: '/studio/tests',
  STUDIO_TEST_BY_ID: (id: string) => `/studio/tests/${id}`,
  STUDIO_EXECUTE: (id: string) => `/studio/tests/${id}/execute`,
  STUDIO_EXECUTION: (id: string) => `/studio/executions/${id}`,
  STUDIO_VALIDATE_STEPS: '/studio/validate-steps',
} as const;

export const WEBSOCKET_EVENTS = {
  EXECUTION_LOGS: 'execution_logs',
  CHECK_STATUS_UPDATES: 'check_status_updates',
  STUDIO_PROGRESS: 'studio_progress',
  REPORT_GENERATION: 'report_generation',
} as const;