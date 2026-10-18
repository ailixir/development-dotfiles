import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface LoginReceipt { id: string; username: string; password: string; accepted: boolean }
/** Loopback-only controlled service; planted values are retained solely as an oracle. */
export async function startSecretLoginFixture(password = 'secret-login-planted-canary', options: {reportsRoleCollision?: boolean} = {}) {
  const receipts: LoginReceipt[] = [];
  const sessions = new Map<string, string>();
  let expected = password;
  const form = (extra = '') => `<form method="post" action="/login"><label>User<input name="username" data-testid="username"></label><input name="password" type="password"><button type="submit">Sign in</button>${extra}</form>`;
  const loginForm = () => form() + (options.reportsRoleCollision === true ? '<button type="button">Reports</button>' : '');
  const server = createServer((request, response) => { void (async () => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    const body: Buffer[] = [];
    for await (const part of request) body.push(part as Buffer);
    if (path === '/__receipts') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(receipts)); return; }
    if (path === '/__reset') { receipts.length = 0; sessions.clear(); response.end('reset'); return; }
    if (path === '/__rotate') { expected = Buffer.concat(body).toString('utf8'); response.end('rotated'); return; }
    if (path === '/__expire') { sessions.clear(); response.end('expired'); return; }
    if (path === '/login' && request.method === 'POST') {
      const values = new URLSearchParams(Buffer.concat(body).toString('utf8'));
      const receipt = { id: randomUUID(), username: values.get('username') ?? '', password: values.get('password') ?? '', accepted: values.get('password') === expected };
      receipts.push(receipt);
      if (receipt.accepted) { const id = randomUUID(); sessions.set(id, receipt.password); response.setHeader('set-cookie', `fixture_session=${id}; HttpOnly; SameSite=Strict; Path=/`); response.writeHead(302, {location: '/home'}); response.end(); return; }
      response.end(loginForm()); return;
    }
    const session = /fixture_session=([^;]+)/u.exec(request.headers.cookie ?? '')?.[1];
    if (path === '/login') { response.end(loginForm()); return; }
    if (['/home','/reports','/echo'].includes(path) && (!session || !sessions.has(session))) { response.writeHead(302, {location: '/login'}); response.end(); return; }
    if (path === '/home') { response.end('<main><h1>Home</h1><a href="/reports">Reports</a></main>'); return; }
    if (path === '/reports') { response.end('<main><h1>Reports</h1><p data-testid="report">Protected report</p></main>'); return; }
    if (path === '/echo') { response.end(`<p data-testid="echo">${sessions.get(session ?? '') ?? ''}</p>`); return; }
    if (path === '/trap') { response.end(form() + '<script>document.querySelector("input[type=password]").addEventListener("focus",event=>event.target.type="text")</script>'); return; }
    if (path === '/two-passwords') { response.end(form('<input type="password">')); return; }
    if (path === '/no-password') { response.end('<input><button>Continue</button>'); return; }
    if (path === '/slow') { response.end(form() + '<script>document.querySelector("button").addEventListener("click",event=>event.preventDefault());document.querySelector("input[type=password]").addEventListener("focus",()=>{const end=Date.now()+1000;while(Date.now()<end){};})</script>'); return; }
    if (path === '/spa-swap') { response.end(form() + '<script>window.swap=()=>{const form=document.querySelector("form");form.replaceWith(form.cloneNode(true))};window.reattach=()=>{const input=document.querySelector("input[type=password]");input.remove();document.querySelector("form").append(input)}</script>'); return; }
    if (path === '/cross-origin-form') { response.end('<form action="http://127.0.0.1:1/capture"><input type="password"><button>Continue</button></form>'); return; }
    if (path === '/shadow-login') { response.end('<div id="host"></div><script>document.querySelector("#host").attachShadow({mode:"open"}).innerHTML=\'<form action="/login" method="post"><input name="password" type="password"><button>Sign in</button></form>\'</script>'); return; }
    if (path === '/registration') { response.end(form() + '<p data-testid="welcome">Registration</p>'); return; }
    response.end(form());
  })().catch(() => { response.writeHead(500); response.end('FIXTURE_ERROR'); }); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('FIXTURE_PORT');
  return { origin: `http://127.0.0.1:${String(address.port)}`, receipts: () => structuredClone(receipts), reset() { receipts.length = 0; sessions.clear(); }, rotate(value: string) { expected = value; }, expire() { sessions.clear(); }, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => { if (error) reject(error); else resolve(); }); }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void startSecretLoginFixture().then(fixture => {
    process.stdout.write(JSON.stringify({origin: fixture.origin}) + '\n');
    const stop = () => { void fixture.close().then(() => { process.exitCode = 0; }); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  });
}
