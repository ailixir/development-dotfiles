// D5 probe: real Chromium + studio-runner dist collector (read-only import). Fixture = ReplayIT /flow markup.
import http from 'node:http';
const RUNNER = process.argv[2];
const { chromium } = await import(RUNNER + '/node_modules/playwright/index.mjs').catch(() => import(RUNNER + '/node_modules/playwright-core/index.mjs'));
const { installObservationCollector } = await import(RUNNER + '/dist/run/observationCollector.js');
const { observationOptions } = await import(RUNNER + '/dist/run/observationSanitizer.js');
const fresh = '  fresh-1-00000000-0000-0000-0000-000000000000-é😀  ';
const page = (trigger) => "<!doctype html><html><head><title>Operations</title></head><body><main aria-label='Operations'><output aria-label='Order reference'>" + fresh +
  "</output><label for='destination'>Destination</label><textarea id='destination'></textarea><output id='done' aria-label='Confirmation' hidden>Submitted</output><button id='submit'>Submit</button></main>" +
  (trigger ? "<script>document.getElementById('destination').addEventListener('" + trigger + "',()=>{document.querySelector('output[aria-label=\"Order reference\"]').textContent='changed-after-read';});</script>" : '') + "</body></html>";
let current = '';
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(current); });
await new Promise(res => server.listen(0, '127.0.0.1', res));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const results = {};
for (const trigger of [null, 'focus', 'input', 'change']) {
  current = page(trigger);
  const p = await browser.newPage(); await p.goto(ORIGIN + '/flow');
  const cdp = await p.context().newCDPSession(p);
  const tree = await cdp.send('Page.getFrameTree');
  const world = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'd5', grantUniveralAccess: false });
  const opts = observationOptions({ sessionId: 's', scopeHash: 'a'.repeat(64), approvedOrigins: [ORIGIN], rules: [], knownSecrets: [],
    applicationPolicy: { policyRuleId: 'p', allowStructuralDiscovery: true, readGrants: [{ policyRuleId: 'g', origin: ORIGIN, region: { kind: 'application' }, visibleText: { classification: 'permittedBusinessData' } }] } });
  const inst = await cdp.send('Runtime.callFunctionOn', { executionContextId: world.executionContextId, functionDeclaration: installObservationCollector.toString(), arguments: [{ value: opts }, { value: [] }], returnByValue: false });
  if (inst.exceptionDetails) { results[String(trigger)] = { install: inst.exceptionDetails.exception?.description }; continue; }
  const id = inst.result.objectId;
  const call = async (fn, args) => { const r = await cdp.send('Runtime.callFunctionOn', { objectId: id, functionDeclaration: fn, arguments: args.map(value => ({ value })), returnByValue: true }); return r.exceptionDetails ? { threw: (r.exceptionDetails.exception?.description ?? '').split('\n')[0] } : { value: r.result.value }; };
  const collect = async (g) => (await call('function(i){return this.collect(i)}', [{ documentId: 'doc' + g, generation: g, observedAt: new Date().toISOString() }])).value;
  let obs = await collect(1);
  const node = (o, name) => o.nodes.find(n => n.name === name && n.locatorHints?.length && n.locatorHints[0].exact === true);
  if (trigger === null) console.error(JSON.stringify(obs.nodes.map(n => [n.name, n.role, n.locatorHints])));
  const inv = (o, name, operation, resolvedValue) => { const n = node(o, name); return { target: { nodeId: n.nodeId, documentId: n.documentId, generation: n.generation, locator: n.locatorHints[0] }, operation, resolvedValue, origin: ORIGIN, maxValueBytes: 4096 }; };
  const out = {};
  out.readNode = !!node(obs, 'Order reference'); out.destNode = !!node(obs, 'Destination');
  const read = await call('function(i){return this.invoke(i)}', [inv(obs, 'Order reference', { kind: 'read', bindingId: 'b', recipe: { kind: 'visibleText', policyRuleId: node(obs,'Order reference').policyRuleId, classification: node(obs,'Order reference').classification } }, null)]);
  out.read = read.threw ?? (read.value?.value === fresh ? 'byte-exact' : JSON.stringify(read.value));
  const fill = await call('function(i){return this.invoke(i)}', [inv(obs, 'Destination', { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'x' } }, fresh)]);
  out.fill = fill.threw ?? JSON.stringify(fill.value);
  out.textAfterFill = await p.evaluate(() => document.querySelector('output[aria-label="Order reference"]').textContent);
  out.destValue = await p.evaluate(() => document.getElementById('destination').value === '  fresh-1-00000000-0000-0000-0000-000000000000-é😀  ');
  if (!fill.threw) {
    obs = await collect(2);
    const a = await call('function(i){return this.invoke(i)}', [inv(obs, 'Order reference', { kind: 'assert', predicate: 'containsText', expected: { kind: 'binding', bindingId: 'b' } }, fresh)]);
    out.assertContainsText = a.threw ?? JSON.stringify(a.value);
  }
  results[String(trigger)] = out; await p.close();
}
await browser.close(); server.close();
console.log(JSON.stringify(results, null, 1));
