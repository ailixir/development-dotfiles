// Local stand-in for PUT Core's session identity API (GET /api/v1/users/me[/permissions]) on
// PUT_CHECKS_CORE_PORT (default 8081, loopback only). Started by backend/dev.sh.
// The guided publication and replay-authorization steps re-check the caller against Core with the
// browser's put_session cookie ("fresh Core at the actual commit"). Locally there is no Core, so this
// answers the same developer identity LocalDevAuthFilter injects (bb12345, checks-admin) for exactly
// one fixed, non-secret cookie value. It authorizes nothing else and persists nothing.
// The frontend dev proxy (frontend/vite.config.ts) adds that cookie to /api/v1 requests.
import http from 'node:http';

const COOKIE = 'put_session=local-dev-session';
const ME = { user_id: 'bb12345', email: 'bruno.buger@citi.com', name: 'Bruno Buger', department: null, roles: ['checks-admin'], csi_ownership: [] };
const port = Number(process.env.PUT_CHECKS_CORE_PORT || 8081);

const server = http.createServer((req, res) => {
  const ok = (req.headers.cookie ?? '').split(/;\s*/).includes(COOKIE);
  const path = req.url.split('?')[0];
  if (!ok) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"UNAUTHENTICATED"}'); }
  if (path === '/api/v1/users/me') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(ME)); }
  if (path === '/api/v1/users/me/permissions') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ permissions: [] })); }
  res.writeHead(404); res.end();
});

server.on('error', (failure) => {
  const why = failure.code === 'EADDRINUSE' ? `port ${port} is already in use` : failure.message;
  console.error(`[local-core] cannot start: ${why}. Set PUT_CHECKS_CORE_PORT to another port or stop the process holding it.`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`local-core listening on 127.0.0.1:${port}`));
