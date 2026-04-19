const INLINE_MOCK_MODE_KEY = '__PUT_CHECKS_INLINE_MOCK_MODE__';

export type MockDomain =
  | 'csi'
  | 'checks'
  | 'studio'
  | 'reports'
  | 'dashboard'
  | 'tags'
  | 'secrets'
  | 'templates';

function getMockGlobal(): Record<string, unknown> | null {
  if (typeof globalThis === 'undefined') return null;
  return globalThis as Record<string, unknown>;
}

export function isInlineMockModeEnabled(): boolean {
  const store = getMockGlobal();
  if (!store) return false;
  return store[INLINE_MOCK_MODE_KEY] === true;
}

export function enableInlineMockMode(reason: string): void {
  const store = getMockGlobal();
  if (!store) return;
  if (store[INLINE_MOCK_MODE_KEY] === true) return;

  store[INLINE_MOCK_MODE_KEY] = true;
  // eslint-disable-next-line no-console
  console.warn(`⚠️ Using inline API mocks (MSW worker unavailable): ${reason}`);
}

export function getDisabledMswDomains(): Set<MockDomain> {
  const raw =
    typeof import.meta !== 'undefined'
      ? (import.meta as any).env?.VITE_DISABLE_MSW_DOMAINS
      : undefined;
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean) as MockDomain[]
  );
}

export function isDomainDisabled(domain: MockDomain): boolean {
  return getDisabledMswDomains().has(domain);
}

