/**
 * Starts what the Playwright specs run against (STUDIO-OBS-008, P5). Playwright's `webServer` launches
 * this file; it is not a package script and nothing else imports it.
 *
 * Two modes, picked by one environment flag:
 *
 * - MSW (default). The real Vite app is served on 127.0.0.1:4177 with `VITE_API_URL` pointing at
 *   127.0.0.1:4178, where a Node HTTP server answers `/api/v1/**` from the MSW handlers in `src`
 *   (`e2e/mswProxy.ts`, loaded through the Vite server's `ssrLoadModule` so it resolves the app's
 *   `@services/...` aliases and TypeScript). There is no browser service worker and no
 *   `public/mockServiceWorker.js`; the interception happens in this Node process.
 * - Real backend (`CHECKS_E2E_REAL_BACKEND=1`). Only the Vite app is started, and its existing
 *   `/api/v1` proxy forwards to `CHECKS_E2E_BACKEND_URL` (default http://127.0.0.1:8080). The backend
 *   itself is the caller's to run; this script never starts one. The page's origin is
 *   `http://127.0.0.1:4177` and the browser sends it as `Origin` on every POST/PUT, which Vite's proxy
 *   forwards unchanged, so the backend must allow-list it or those calls answer 403 "Invalid CORS
 *   request". Start the backend with `CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177`
 *   (property `checks.cors.allowed-origins`, `application.yml:113`; default is localhost 3000, 3002,
 *   5173). The origin is deliberately not rewritten here, so a real CORS regression still fails D5.
 *   Also needed for D5: a registered CSI (the UI_TEST source is on by default), e.g.
 *   `FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed`.
 *
 * Ports can be moved with `CHECKS_E2E_APP_PORT` and `CHECKS_E2E_API_PORT` (the playwright config reads
 * the same variables). The script binds 127.0.0.1 only. On SIGINT or SIGTERM it closes what it opened.
 */
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const HOST = '127.0.0.1';
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const flagOn = (value) => value === '1' || value === 'true';
const realBackend = flagOn(process.env.CHECKS_E2E_REAL_BACKEND);
const appPort = Number(process.env.CHECKS_E2E_APP_PORT ?? 4177);
const apiPort = Number(process.env.CHECKS_E2E_API_PORT ?? 4178);
const backendUrl = process.env.CHECKS_E2E_BACKEND_URL ?? 'http://127.0.0.1:8080';

for (const [name, port] of [['CHECKS_E2E_APP_PORT', appPort], ['CHECKS_E2E_API_PORT', apiPort]]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[e2e] ${name} must be a TCP port, got ${String(port)}`);
    process.exit(1);
  }
}

const apiUrl = realBackend ? backendUrl : `http://${HOST}:${apiPort}`;
// vite.config.ts reads this through loadEnv (process.env wins over .env.development) for its
// `/api/v1` proxy target. Set before the Vite server is created.
process.env.VITE_API_URL = apiUrl;

const closers = [];
let closing = false;

async function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const close of closers.reverse()) {
    try {
      await close();
    } catch (error) {
      console.error('[e2e] close failed:', error);
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

const vite = await createServer({
  root: frontendRoot,
  configFile: resolve(frontendRoot, 'vite.config.ts'),
  mode: 'development',
  // A cache of its own: other dev servers on this tree share node_modules/.vite and must not see this one.
  cacheDir: resolve(frontendRoot, 'node_modules/.cache/e2e-vite'),
  clearScreen: false,
  server: { host: HOST, port: appPort, strictPort: true, open: false },
  optimizeDeps: { force: false },
});
closers.push(() => vite.close());

if (!realBackend) {
  // Proxy first, app second: the app answering is then the readiness signal for both.
  const { startMswProxy } = await vite.ssrLoadModule('/e2e/mswProxy.ts');
  const proxy = await startMswProxy({ host: HOST, port: apiPort });
  closers.push(() => proxy.close());
  console.log(`[e2e] MSW proxy listening on http://${HOST}:${apiPort}`);
}

await vite.listen();
console.log(
  `[e2e] app on http://${HOST}:${appPort}, /api/v1 -> ${apiUrl} (${realBackend ? 'real backend' : 'MSW proxy'})`,
);
