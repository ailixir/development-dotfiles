/// <reference types="vite/client" />

// Webpack environment variables
declare var process: {
  env: {
    NODE_ENV: 'development' | 'production' | 'test';
    VITE_API_BASE_URL?: string;
    VITE_ENABLE_MSW?: string;
    VITE_MODULE_NAME?: string;
    VITE_DEBUG_MODE?: string;
  };
};

// Vite import.meta.env interface
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_MSW: string;
  readonly VITE_MODULE_NAME: string;
  readonly VITE_DEBUG_MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

