/**
 * Removes the service worker used by older Studio development builds.
 *
 * The production alpha has no runtime mock path. An already-open tab may nevertheless still be
 * controlled by the retired worker until its next navigation, so unregister it and reload that
 * tab once before bootstrapping the application.
 */
export async function retireLegacyStudioWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const legacy = registrations.filter((registration) =>
    [registration.active, registration.waiting, registration.installing].some(
      (worker) => worker?.scriptURL.endsWith('/mockServiceWorker.js') === true,
    ),
  );
  if (legacy.length === 0) return false;

  const controlsThisTab =
    navigator.serviceWorker.controller?.scriptURL.endsWith('/mockServiceWorker.js') === true;
  await Promise.all(legacy.map((registration) => registration.unregister()));
  if (controlsThisTab && sessionStorage.getItem('studio:legacy-worker-retired') !== 'true') {
    sessionStorage.setItem('studio:legacy-worker-retired', 'true');
    window.location.reload();
    return true;
  }
  return false;
}

