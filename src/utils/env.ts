// Environment configuration utility
// Handles both Vite (import.meta.env) and Webpack (process.env) environments

const getEnvValue = (key: string, defaultValue: string = ''): string => {
  // Try Vite first (standalone mode)
  try {
    // @ts-ignore - import.meta may not be available in all environments
    if (import.meta && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key] || defaultValue;
    }
  } catch {
    // import.meta not available, continue to process.env
  }
  
  // Fallback to process.env (webpack/federated mode)
  if (typeof process !== 'undefined' && process.env) {
    return (process.env as any)[key] || defaultValue;
  }
  
  return defaultValue;
};

const getBooleanEnv = (key: string, defaultValue: boolean = false): boolean => {
  const value = getEnvValue(key);
  if (value === '') return defaultValue;
  return value === 'true';
};

export const ENV_CONFIG = {
  apiBaseUrl: getEnvValue('VITE_API_BASE_URL', '/api'),
  enableMSW: getBooleanEnv('VITE_ENABLE_MSW', true),
  debugMode: getBooleanEnv('VITE_DEBUG_MODE', true),
  moduleName: getEnvValue('VITE_MODULE_NAME', 'checks'),
  moduleVersion: getEnvValue('VITE_MODULE_VERSION', '1.0.0'),
  nodeEnv: getEnvValue('NODE_ENV', 'development'),
} as const;

export default ENV_CONFIG;
