/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEBUG_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** Set by the Vite standalone entry (`main.tsx`) only; the federated host never loads that entry. */
  __CHECKS_STANDALONE__?: boolean
}