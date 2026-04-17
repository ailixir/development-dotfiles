/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENABLE_MSW?: string
  readonly VITE_ALLOW_INSECURE_MSW_FALLBACK?: string
  readonly VITE_DEBUG_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}