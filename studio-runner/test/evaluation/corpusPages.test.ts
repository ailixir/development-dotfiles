/**
 * STUDIO-OBS-009 AC-7: the committed corpus pages and their loopback host. The host logs page views itself
 * (the app-side record that makes the oracle independent), accepts only small typed events, never stores a
 * submitted password, and isolates concurrent runs by namespace. Harness self-test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../../evaluation/fixture-server.mjs';
import { scanCanaries, startCorpusPages, type CorpusPagesHost } from '../../evaluation/observed-authoring/evaluate.mjs';
import { expectedOf, frozenManifest } from './observedCorpus.js';

const PLANTED = 'planted-page-test-secret-90210';
let host: CorpusPagesHost;
beforeAll(async () => { host = await startCorpusPages({ plantedSecrets: { c05: PLANTED } }); });
afterAll(async () => { await host.close(); });

const post = (url: string, body: unknown): Promise<Response> => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('corpus page host', () => {
  it('binds an ephemeral loopback port (no hard-coded port, no collision class)', () => {
    const url = new URL(host.origin);
    expect(url.hostname).toBe('127.0.0.1');
    expect(Number(url.port)).toBeGreaterThan(1024);
    expect([4100, 4101, 4102]).not.toContain(Number(url.port));
  });

  it('serves every page the manifest pins, and the page set equals the manifest pages exactly', async () => {
    const manifest = frozenManifest();
    const pinned = manifest.cases.flatMap((c) => c.pages.map((p) => p.path.replace(/^pages\//u, '').replace(/\.html$/u, '')));
    expect([...host.pageKeys()].sort()).toEqual([...pinned].sort());
    for (const path of pinned) {
      const [key, page] = path.split('/');
      const response = await fetch(`${host.fixtureOrigin(`${key ?? ''}.serve`)}/${page ?? ''}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect((await response.text()).length).toBeGreaterThan(40);
    }
  });

  it('logs the view itself, in the namespace of the run', async () => {
    const base = host.fixtureOrigin('c01.viewlog');
    await fetch(`${base}/home`);
    expect(host.receipts('c01.viewlog').map(({ seq, ...rest }) => ({ seq, ...rest }))).toEqual([{ seq: 1, type: 'page.view', page: 'home' }]);
    expect(host.receipts('c01.other')).toEqual([]);
  });

  it('records a request for a page the case does not have as a view with known:false (a wrong click shows up)', async () => {
    const base = host.fixtureOrigin('c01.unknown');
    const response = await fetch(`${base}/more`);
    expect(response.status).toBe(404);
    expect(host.receipts('c01.unknown')).toEqual([expect.objectContaining({ type: 'page.view', page: 'more', known: false })]);
    expect((await fetch(`${host.origin}/ns/zz99/home`)).status).toBe(404);
    expect(host.receipts('zz99')).toEqual([]);
  });

  it('keeps concurrent runs of one case apart and resets one namespace only', async () => {
    const a = host.fixtureOrigin('c04.runa');
    const b = host.fixtureOrigin('c04.runb');
    await post(`${a}/__event`, { type: 'login.accepted', account: 'synthetic-user' });
    await post(`${b}/__event`, { type: 'form.saved', account: 'target' });
    expect(host.receipts('c04.runa').map((r) => r.type)).toEqual(['login.accepted']);
    expect(host.receipts('c04.runb').map((r) => r.type)).toEqual(['form.saved']);
    expect((await post(`${a}/__reset`, {})).status).toBe(200);
    expect(host.receipts('c04.runa')).toEqual([]);
    expect(host.receipts('c04.runb')).toHaveLength(1);
  });

  it('serves the receipts as JSON at /__receipts', async () => {
    const base = host.fixtureOrigin('c06.json');
    await post(`${base}/__event`, { type: 'form.save', currency: 'GBP', remember: true, notes: 'urgent' });
    const body = await (await fetch(`${base}/__receipts`)).json() as { ns: string; receipts: { type: string; currency: string; remember: boolean }[] };
    expect(body.ns).toBe('c06.json');
    expect(body.receipts[0]).toMatchObject({ type: 'form.save', currency: 'GBP', remember: true });
  });

  it.each([
    ['a type that is not noun.verb', { type: 'Bad_Type' }],
    ['a nested field', { type: 'form.save', nested: { a: 1 } }],
    ['an over-long field value', { type: 'form.save', notes: 'x'.repeat(201) }],
    ['a bad field name', { type: 'form.save', 'a b': 'x' }],
  ])('refuses %s', async (_label, body) => {
    const base = host.fixtureOrigin('c06.refuse');
    expect((await post(`${base}/__event`, body)).status).toBe(400);
    expect(host.receipts('c06.refuse')).toEqual([]);
  });

  it('refuses an oversized body and a path-traversal attempt, and answers 404 for a namespace shape it does not know', async () => {
    const base = host.fixtureOrigin('c06.big');
    expect((await post(`${base}/__event`, { type: 'form.save', blob: 'x'.repeat(6000) })).status).toBe(400);
    expect((await fetch(`${host.origin}/ns/c01/..%2f..%2fserver`)).status).toBe(404);
    expect((await fetch(`${host.origin}/etc/passwd`)).status).toBe(404);
  });

  it('answers login with accepted only; the submitted password is never stored, echoed or logged', async () => {
    const base = host.fixtureOrigin('c05.login');
    const bad = await post(`${base}/__login`, { username: 'pilot-user', password: 'wrong-password-value' });
    expect(bad.status).toBe(401);
    const good = await post(`${base}/__login`, { username: 'pilot-user', password: PLANTED });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ accepted: true });
    const receipts = host.receipts('c05.login');
    expect(receipts.map(({ seq, ...rest }) => { void seq; return rest; })).toEqual([
      { type: 'login.submit', username: 'pilot-user', accepted: false },
      { type: 'login.submit', username: 'pilot-user', accepted: true },
    ]);
    const scan = scanCanaries({ texts: { receipts: JSON.stringify(receipts), response: JSON.stringify(await (await fetch(`${base}/__receipts`)).json()) }, secretCanaries: [PLANTED, 'wrong-password-value'] });
    expect(scan.leaks).toBe(0);
  });

  it('refuses a login for a case that has no planted secret', async () => {
    expect((await post(`${host.fixtureOrigin('c04.nologin')}/__login`, { username: 'a', password: 'b' })).status).toBe(400);
  });

  it('gives each page an app-side event the oracle can read, rather than relying on the DOM', async () => {
    const wiki = await (await fetch(`${host.fixtureOrigin('c03.dom')}/wiki`)).text();
    expect(wiki).toContain("rec('search.submit'");
    const list = await (await fetch(`${host.fixtureOrigin('e4.dom')}/list`)).text();
    expect(list).toContain("rec('item.pick'");
  });
});

describe('C04 port fidelity: the re-authored page keeps the event vocabulary of the existing evaluation fixture', () => {
  it('login.accepted and form.saved come from evaluation/fixture-server.mjs, so the expected outcome names events that asset really emits', async () => {
    const token = 'synthetic-fixture-token';
    const fixture = await startFixtureServer({ token, targetPort: 0, controlPort: 0 });
    try {
      const namespace = '6f1c2b8e-0000-4000-8000-00000000c004';
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      const created = await fetch(`${fixture.controlUrl}/trials`, { method: 'POST', headers, body: JSON.stringify({ namespace }) });
      expect(created.status).toBe(201);
      const act = (action: string): Promise<Response> => fetch(`${fixture.targetOrigin}/trials/${namespace}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      await act('login');
      await act('target');
      const snapshot = await (await fetch(`${fixture.controlUrl}/trials/${namespace}`, { headers })).json() as { events: { type: string; account: string }[] };
      const c04 = expectedOf(frozenManifest().cases.find((c) => c.id === 'C04-account-save') ?? (() => { throw new Error('C04'); })());
      const wanted = c04.receipts.phases.run?.actions.map((a) => ({ type: a.type, account: (a.fields as { account: string }).account }));
      expect(snapshot.events).toEqual(wanted);
    } finally {
      await fixture.close();
    }
  });
});
