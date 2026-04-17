const INLINE_MOCK_MODE_KEY = '__PUT_CHECKS_INLINE_MOCK_MODE__';

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

