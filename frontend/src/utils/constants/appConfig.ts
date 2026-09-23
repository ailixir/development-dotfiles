import { AppConfig } from '../../types/common/commonTypes';

type RuntimeChecksConfig = {
  apiBaseUrl?: string;
  debugMode?: boolean;
  studioAuthoringV2?: boolean;
};

declare global {
  interface Window {
    __CHECKS_CONFIG__?: RuntimeChecksConfig;
  }
}

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
  } catch { /* Environment initialization is optional; continue with the configured defaults. */ }
  return fallback;
};


// DefinePlugin replaces literal process.env.X references at build time;
// dynamic access (process.env[key]) is NOT replaced, so we read it directly.
const _reactApiBase: string = process.env.REACT_APP_API_BASE_URL as unknown as string;
const _runtimeApiBase = typeof window !== 'undefined' ? window.__CHECKS_CONFIG__?.apiBaseUrl : undefined;
const _runtimeDebugMode = typeof window !== 'undefined' ? window.__CHECKS_CONFIG__?.debugMode : undefined;

export const APP_CONFIG: AppConfig = {
  apiBaseUrl:
    (typeof _runtimeApiBase === 'string' && _runtimeApiBase.length > 0 ? _runtimeApiBase : null) ||
    (typeof _reactApiBase === 'string' && _reactApiBase.length > 0 ? _reactApiBase : null) ||
    getStringEnv('VITE_API_BASE_URL', '/api/v1') ||
    '/api/v1',
  debugMode: typeof _runtimeDebugMode === 'boolean' ? _runtimeDebugMode : getStringEnv('VITE_DEBUG_MODE') === 'true',
  version: '1.0.0',
  buildDate: new Date().toISOString(),
};

/** Deployment-controlled; enabling the UI requires the compatible v2 API and schema cutover. */
export const STUDIO_AUTHORING_V2 = typeof window !== 'undefined'
  && window.__CHECKS_CONFIG__?.studioAuthoringV2 === true;

export const API_ENDPOINTS = {
  // Check sources (feature flags)
  CHECK_SOURCES: '/checks/sources',

  // Checks endpoints
  CHECKS: '/checks',
  CHECKS_BULK: '/checks/_bulk',
  CHECK_BY_ID: (id: string) => `/checks/${id}`,
  EXECUTE_CHECK: (id: string) => `/checks/${id}/execute`,
  CHECK_EXECUTIONS: (id: string) => `/checks/${id}/executions`,
  CHECK_HISTORY: (id: string) => `/checks/${id}/history`,

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
} as const;

export const WEBSOCKET_EVENTS = {
  EXECUTION_LOGS: 'execution_logs',
  CHECK_STATUS_UPDATES: 'check_status_updates',
  STUDIO_PROGRESS: 'studio_progress',
  REPORT_GENERATION: 'report_generation',
} as const;