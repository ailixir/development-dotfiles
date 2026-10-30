/* global Buffer, structuredClone */
// STUDIO-OBS-009 AC-7 corpus pages: a loopback host for the re-authored benchmark fixture pages.
//
// What this is: the page host and the fixture-owned receipts that make the corpus oracle independent
// of the model, the learned plan and the runner (T0 QA B6). Every page view is logged by this server
// (not by the page), every action is a small event the page posts to its own namespace. The oracle
// reads `GET /ns/<ns>/__receipts`. Nothing here talks to a model, a provider or the Studio API.
//
// Namespaces: `/ns/<case>` or `/ns/<case>.<tag>`. A run takes its own tag, so concurrent runs of one
// case never share receipts. The port is ephemeral (never hard-coded, which avoids the P4 loopback
// collision class); the origin is recorded per run by the harness.
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const PAGES_VERSION = '1.0.0';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAMESPACE = /^\/ns\/([a-z0-9-]{1,12})(?:\.([a-z0-9-]{1,32}))?\/([a-z0-9_-]{1,32})$/u;
const EVENT_TYPE = /^[a-z]{1,16}\.[a-z]{1,16}$/u;
const MAX_BODY = 4096;
const MAX_RECEIPTS = 500;

/** Discovers `<key>/<page>.html` once, so only listed pages are ever served (no path traversal). */
export function loadPageTable(root = HERE) {
  const table = new Map();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of readdirSync(join(root, entry.name))) {
      if (!file.endsWith('.html')) continue;
      table.set(`${entry.name}/${file.slice(0, -5)}`, readFileSync(join(root, entry.name, file), 'utf8'));
    }
  }
  return table;
}

const readBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('body limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const scalarFields = (value) => {
  const fields = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('fields');
  for (const [name, item] of Object.entries(value)) {
    if (!/^[a-zA-Z]{1,24}$/u.test(name)) throw new Error('field name');
    if (typeof item === 'string' && item.length <= 200) fields[name] = item;
    else if (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) fields[name] = item;
    else throw new Error('field value');
  }
  return fields;
};

/**
 * @param {{port?: number, root?: string, plantedSecrets?: Record<string, string>}} [options]
 * `plantedSecrets` maps a case key to the secret its login page accepts. The server compares it and
 * stores only `accepted`; the submitted password is never stored, echoed or logged.
 */
export async function startCorpusPages(options = {}) {
  const table = loadPageTable(options.root ?? HERE);
  const knownKeys = new Set([...table.keys()].map((k) => k.split('/')[0]));
  const secrets = new Map(Object.entries(options.plantedSecrets ?? {}));
  const spaces = new Map();
  const space = (ns) => {
    let entry = spaces.get(ns);
    if (!entry) {
      entry = { seq: 0, receipts: [] };
      spaces.set(ns, entry);
    }
    return entry;
  };
  const push = (ns, record) => {
    const entry = space(ns);
    if (entry.receipts.length >= MAX_RECEIPTS) throw new Error('receipt limit');
    entry.receipts.push({ seq: ++entry.seq, ...record });
  };
  const reply = (response, status, body, type = 'application/json') => {
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const match = NAMESPACE.exec(path);
      if (!match) { reply(response, 404, { error: 'NOT_FOUND' }); return; }
      const [, key, tag, name] = match;
      const ns = tag === undefined ? key : `${key}.${tag}`;
      if (name === '__receipts' && request.method === 'GET') {
        reply(response, 200, { ns, receipts: structuredClone(space(ns).receipts) });
        return;
      }
      if (name === '__reset' && request.method === 'POST') {
        spaces.delete(ns);
        reply(response, 200, { ns, reset: true });
        return;
      }
      if (name === '__event' && request.method === 'POST') {
        const body = JSON.parse(await readBody(request));
        const { type, ...rest } = body;
        if (typeof type !== 'string' || !EVENT_TYPE.test(type)) throw new Error('type');
        push(ns, { type, ...scalarFields(rest) });
        reply(response, 200, { ok: true });
        return;
      }
      if (name === '__login' && request.method === 'POST') {
        const body = JSON.parse(await readBody(request));
        const expected = secrets.get(key);
        if (expected === undefined || typeof body.username !== 'string' || typeof body.password !== 'string') throw new Error('login');
        const accepted = body.password === expected;
        push(ns, { type: 'login.submit', username: body.username.slice(0, 80), accepted });
        reply(response, accepted ? 200 : 401, { accepted });
        return;
      }
      const html = table.get(`${key}/${name}`);
      if (request.method !== 'GET' || !knownKeys.has(key)) { reply(response, 404, { error: 'NOT_FOUND' }); return; }
      // A request for a page this case does not have is still a view: a wrong click or a wrong URL must show in the receipts.
      push(ns, { type: 'page.view', page: name, ...(html === undefined ? { known: false } : {}) });
      if (html === undefined) { reply(response, 404, { error: 'NOT_FOUND' }); return; }
      reply(response, 200, html, 'text/html; charset=utf-8');
    })().catch(() => { reply(response, 400, { error: 'BAD_REQUEST' }); });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(undefined); });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('PAGES_PORT');
  const origin = `http://localhost:${String(address.port)}`;
  return {
    pagesVersion: PAGES_VERSION,
    origin,
    /** The value of `${fixtureOrigin}` for one run: the namespace-qualified base URL. */
    fixtureOrigin: (ns) => `${origin}/ns/${ns.replace(/^\//u, '')}`,
    pageKeys: () => [...table.keys()],
    receipts: (ns) => structuredClone(space(ns).receipts),
    reset: (ns) => { spaces.delete(ns); },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => { resolve(undefined); }); }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = await startCorpusPages();
  process.stdout.write(`${JSON.stringify({ origin: host.origin, pagesVersion: PAGES_VERSION })}\n`);
  const stop = () => { void host.close().then(() => { process.exitCode = 0; }); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
