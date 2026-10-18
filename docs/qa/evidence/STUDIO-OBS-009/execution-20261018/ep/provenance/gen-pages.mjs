// Scratch generator (NOT committed): emits pages/<key>/{*.html,step-text.json,expected-outcome.json}.
// The emitted files are the committed artifacts; this script only keeps them consistent while authoring.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const AUTHOR = '@dev (Dex) EP lane draft; @qa (Quinn) review PENDING';

const uuid = (caseId, index) => {
  const h = createHash('sha256').update(`${caseId}:${String(index)}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const CONFIG = { environment: 'controlled-fixture', browser: 'chromium', viewport: { width: 1280, height: 720 }, timeoutSeconds: 30, waitStrategy: 'domcontentloaded' };
const ctx = { entries: [], evidenceReferences: [] };

const REC = `const rec=(type,fields)=>fetch('__event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,...fields}),keepalive:true});`;
const page = (title, body, script = '') => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
${body}
${script ? `<script>\n${REC}\n${script}\n</script>` : ''}
</body>
</html>
`;

const cases = [];
const add = (c) => cases.push(c);

// ---- C01 -------------------------------------------------------------------------------------
add({
  key: 'c01', id: 'C01-rf-example-url',
  steps: ['Open <var homeUrl>.', 'Check that the heading says Example Domain.'],
  variables: [{ name: 'homeUrl', kind: 'plain', value: '${fixtureOrigin}/home' }],
  pages: { home: page('Example Domain', `<main><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p><a href="more">More information</a></main>`) },
  expected: { class: 'P', phases: { run: { actions: [] } }, views: { required: ['home'], allowed: ['home'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Example Domain', elementKind: 'h1' }] },
});
// ---- C02 -------------------------------------------------------------------------------------
add({
  key: 'c02', id: 'C02-rf-wiki-url',
  steps: ['Open <var wikiUrl>.', 'Check that the page address contains /wiki.'],
  variables: [{ name: 'wikiUrl', kind: 'plain', value: '${fixtureOrigin}/wiki' }],
  pages: { wiki: page('Wiki main', `<main><h1>Wiki main page</h1><p>Welcome to the wiki.</p></main>`) },
  expected: { class: 'P', phases: { run: { actions: [] } }, views: { required: ['wiki'], allowed: ['wiki'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: '/wiki', elementKind: 'address-bar' }] },
});
// ---- C03 -------------------------------------------------------------------------------------
add({
  key: 'c03', id: 'C03-rf-wiki-search-var',
  steps: ['Open <var wikiUrl>.', 'Fill Search Wikipedia with <var SEARCH_TERM>.', 'Press Enter in the Search Wikipedia field.', 'Check that the page address contains /wiki.'],
  variables: [{ name: 'wikiUrl', kind: 'plain', value: '${fixtureOrigin}/wiki' }, { name: 'SEARCH_TERM', kind: 'plain', value: 'observability' }],
  pages: {
    wiki: page('Wiki search', `<main><h1>Wiki</h1><form id="s"><label>Search Wikipedia <input name="q" type="search"></label><button type="submit">Search</button></form><p id="r" role="status"></p></main>`,
      `const q=new URLSearchParams(location.search).get('q');if(q!==null)document.getElementById('r').textContent='Results for '+q;
document.getElementById('s').addEventListener('submit',async(e)=>{e.preventDefault();await rec('search.submit',{term:e.target.q.value});location.search='?q='+encodeURIComponent(e.target.q.value);});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'search.submit', fields: { term: 'observability' } }] } }, views: { required: ['wiki'], allowed: ['wiki'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: '/wiki', elementKind: 'address-bar' }] },
});
// ---- C04 -------------------------------------------------------------------------------------
add({
  key: 'c04', id: 'C04-account-save',
  steps: ['Open <var trialUrl>.', 'Click Log in.', 'Click Save target.', 'Check that the page shows Saved target.'],
  variables: [{ name: 'trialUrl', kind: 'plain', value: '${fixtureOrigin}/trial' }],
  pages: {
    trial: page('Account review', `<main><h1>Account review</h1><button id="login">Log in</button>
<button id="t" disabled>Save target</button><button id="o" disabled>Save other</button><p id="status" role="status">Not saved</p></main>`,
      `let on=false;document.getElementById('login').onclick=async()=>{await rec('login.accepted',{account:'synthetic-user'});on=true;document.getElementById('t').disabled=false;document.getElementById('o').disabled=false;document.getElementById('status').textContent='Logged in';};
for(const [id,acct] of [['t','target'],['o','other']])document.getElementById(id).onclick=async()=>{if(!on)return;await rec('form.saved',{account:acct});document.getElementById('status').textContent='Saved '+acct;};`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'login.accepted', fields: { account: 'synthetic-user' } }, { type: 'form.saved', fields: { account: 'target' } }] } }, views: { required: ['trial'], allowed: ['trial'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Saved target', elementKind: 'p[role=status]' }] },
});
// ---- C05 -------------------------------------------------------------------------------------
add({
  key: 'c05', id: 'C05-login-var-secret',
  steps: ['Open <var loginUrl>.', 'Fill User with <var USERNAME>.', 'Fill Password with <secret LOGIN_PW>.', 'Click Sign in.', 'Check that the heading says Dashboard.'],
  variables: [{ name: 'loginUrl', kind: 'plain', value: '${fixtureOrigin}/login' }, { name: 'USERNAME', kind: 'plain', value: 'pilot-user' }, { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'LOGIN_PW' }],
  secret: 'LOGIN_PW',
  pages: {
    login: page('Sign in', `<main><h1>Sign in</h1><form id="f"><label>User <input name="u" autocomplete="off"></label><label>Password <input name="p" type="password" autocomplete="off"></label><button type="submit">Sign in</button></form></main>`,
      `document.getElementById('f').addEventListener('submit',async(e)=>{e.preventDefault();const r=await fetch('__login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:e.target.u.value,password:e.target.p.value})});if(r.ok)location.href='dashboard';});`),
    dashboard: page('Dashboard', `<main><h1>Dashboard</h1><p>Signed in.</p></main>`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'login.submit', fields: { username: 'pilot-user', accepted: true } }] } }, views: { required: ['login', 'dashboard'], allowed: ['login', 'dashboard'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Dashboard', elementKind: 'h1' }] },
});
// ---- C06 -------------------------------------------------------------------------------------
add({
  key: 'c06', id: 'C06-forms-fill-save',
  steps: ['Open <var formsUrl>.', 'Select GBP from Currency.', 'Tick Remember me.', 'Fill Notes with urgent.', 'Click Save.', 'Check that the page shows Saved.'],
  variables: [{ name: 'formsUrl', kind: 'plain', value: '${fixtureOrigin}/forms' }],
  pages: {
    forms: page('Forms', `<main><h1>Payment form</h1><form id="f"><label for="cur">Currency</label><select id="cur" name="c"><option>EUR</option><option>GBP</option><option>USD</option></select>
<label><input type="checkbox" name="r"> Remember me</label><label>Notes <textarea name="n"></textarea></label><button type="submit">Save</button></form><p id="s" role="status"></p></main>`,
      `document.getElementById('f').addEventListener('submit',async(e)=>{e.preventDefault();await rec('form.save',{currency:e.target.c.value,remember:e.target.r.checked,notes:e.target.n.value});document.getElementById('s').textContent='Saved';});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'form.save', fields: { currency: 'GBP', remember: true, notes: 'urgent' } }] } }, views: { required: ['forms'], allowed: ['forms'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Saved', elementKind: 'p[role=status]' }] },
});
// ---- C07 -------------------------------------------------------------------------------------
add({
  key: 'c07', id: 'C07-ambiguous-search-locator',
  steps: ['Open <var searchUrl>.', 'Type hosting in the search box and press Enter.'],
  variables: [{ name: 'searchUrl', kind: 'plain', value: '${fixtureOrigin}/search' }],
  pages: {
    search: page('Search', `<main><h1>Search the web</h1><input role="combobox" aria-label="Search" aria-expanded="false" aria-autocomplete="list" id="q" autocomplete="off"><p id="s" role="status"></p></main>`,
      `document.getElementById('q').addEventListener('keydown',async(e)=>{if(e.key==='Enter'){e.preventDefault();await rec('search.submit',{term:e.target.value});document.getElementById('s').textContent='Searched';}});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'search.submit', fields: { term: 'hosting' } }] } }, views: { required: ['search'], allowed: ['search'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [] },
});
// ---- C08 -------------------------------------------------------------------------------------
add({
  key: 'c08', id: 'C08-intended-assertion-fail',
  steps: ['Open <var ordersUrl>.', 'Check that the page shows Order rejected.'],
  variables: [{ name: 'ordersUrl', kind: 'plain', value: '${fixtureOrigin}/orders' }],
  pages: { orders: page('Orders', `<main><h1>Orders</h1><table><tr><th>Order</th><th>Status</th></tr><tr><td>ORD-1001</td><td>Order accepted</td></tr></table></main>`) },
  expected: { class: 'F', phases: { run: { actions: [] } }, views: { required: [], allowed: ['orders'] }, session: { terminal: ['FAILED'], failureCodes: ['ASSERTION_FAILED'], failedStepNumber: 2, published: false, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Order rejected', elementKind: 'absent' }] },
});
// ---- C09 -------------------------------------------------------------------------------------
add({
  key: 'c09', id: 'C09-negation-trap',
  steps: ['Open <var formsUrl>.', 'Check that the Delete button is not visible.'],
  variables: [{ name: 'formsUrl', kind: 'plain', value: '${fixtureOrigin}/forms' }],
  pages: {
    forms: page('Forms', `<main><h1>Records</h1><button id="d">Delete</button><button id="e">Edit</button><p id="s" role="status"></p></main>`,
      `document.getElementById('d').onclick=async()=>{await rec('record.delete',{id:'1'});document.getElementById('s').textContent='Deleted';};document.getElementById('e').onclick=async()=>{await rec('record.edit',{id:'1'});};`),
  },
  expected: { class: 'N', phases: { run: { actions: [] } }, views: { required: [], allowed: ['forms'] }, session: { terminal: ['FAILED', 'AWAITING_CLARIFICATION', 'CANCELLED', 'EXPIRED'], published: false, clarifications: 'ANY' } },
  rs1: { reads: [], asserts: [] },
});
// ---- C10 -------------------------------------------------------------------------------------
add({
  key: 'c10', id: 'C10-unsupported-cpu',
  steps: ['Check that the server CPU utilization is below 80 percent.'],
  variables: [],
  pages: {},
  expected: { class: 'N', phases: { run: { actions: [] } }, views: { required: [], allowed: [] }, session: { terminal: ['FAILED', 'AWAITING_CLARIFICATION', 'CANCELLED', 'EXPIRED'], published: false, clarifications: 'ANY' } },
  rs1: { reads: [], asserts: [] },
  noPageReason: 'text-only instruction about host state; it names no page, and the expected outcome allows no page view',
});
// ---- C11 -------------------------------------------------------------------------------------
add({
  key: 'c11', id: 'C11-unsupported-second-tab',
  steps: ['Open <var homeUrl>.', 'Open a second browser tab and compare its contents with the first tab.'],
  variables: [{ name: 'homeUrl', kind: 'plain', value: '${fixtureOrigin}/home' }],
  pages: { home: page('Home', `<main><h1>Home</h1><a href="other">Other page</a></main>`), other: page('Other', `<main><h1>Other page</h1></main>`) },
  expected: { class: 'N', phases: { run: { actions: [] } }, views: { required: [], allowed: ['home'] }, session: { terminal: ['FAILED', 'AWAITING_CLARIFICATION', 'CANCELLED', 'EXPIRED'], published: false, clarifications: 'ANY' } },
  rs1: { reads: [], asserts: [] },
});
// ---- C12 -------------------------------------------------------------------------------------
add({
  key: 'c12', id: 'C12-clarify-click-button',
  steps: ['Open <var formsUrl>.', 'Click the button.'],
  variables: [{ name: 'formsUrl', kind: 'plain', value: '${fixtureOrigin}/forms' }],
  pages: {
    forms: page('Toolbar', `<main><h1>Toolbar</h1><button data-k="submit">Submit</button><button data-k="save">Save</button><button data-k="account">Account</button><button data-k="menu">Menu</button></main>`,
      `for(const b of document.querySelectorAll('button'))b.onclick=async()=>{await rec('toolbar.click',{button:b.dataset.k});};`),
  },
  expected: { class: 'N', phases: { run: { actions: [] } }, views: { required: [], allowed: ['forms'] }, session: { terminal: ['AWAITING_CLARIFICATION', 'CANCELLED', 'EXPIRED', 'FAILED'], mustObserve: ['AWAITING_CLARIFICATION'], published: false, clarifications: 'ANY' } },
  rs1: { reads: [], asserts: [] },
  script: { answerClarifications: false, note: 'the harness counts the clarification and cancels the session; it never answers (class N is not in the completion denominator)' },
});
// ---- C13 -------------------------------------------------------------------------------------
add({
  key: 'c13', id: 'C13-ambiguous-wiki-placeholder',
  steps: ['Open <var wikiUrl>.', 'Type Alan Turing in the search box and press Enter.'],
  variables: [{ name: 'wikiUrl', kind: 'plain', value: '${fixtureOrigin}/wikimain' }],
  pages: {
    wikimain: page('Wiki main', `<main><h1>Wiki main page</h1>
<input type="search" id="vis" placeholder="Search Wikipedia" aria-label="Search Wikipedia">
<input type="search" id="hid" placeholder="Search Wikipedia" aria-label="Search Wikipedia" hidden style="display:none"></main>`,
      `for(const [id,field] of [['vis','visible'],['hid','hidden']])document.getElementById(id).addEventListener('keydown',async(e)=>{if(e.key==='Enter'){e.preventDefault();await rec('search.submit',{term:e.target.value,field});}});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'search.submit', fields: { term: 'Alan Turing', field: 'visible' } }] } }, views: { required: ['wikimain'], allowed: ['wikimain'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [] },
});
// ---- E2 --------------------------------------------------------------------------------------
add({
  key: 'e2', id: 'E2-shadow-dom-open',
  steps: ['Open <var shadowUrl>.', 'Fill Reference with ORD-42.', 'Click Apply.', 'Check that the page shows Applied ORD-42.'],
  variables: [{ name: 'shadowUrl', kind: 'plain', value: '${fixtureOrigin}/shadow' }],
  pages: {
    shadow: page('Shadow DOM', `<main><h1>Open shadow root</h1><div id="host"></div><p id="s" role="status"></p></main>`,
      `const root=document.getElementById('host').attachShadow({mode:'open'});root.innerHTML='<label>Reference <input name="ref"></label><button type="button">Apply</button>';
root.querySelector('button').addEventListener('click',async()=>{const v=root.querySelector('input').value;await rec('shadow.apply',{value:v});document.getElementById('s').textContent='Applied '+v;});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'shadow.apply', fields: { value: 'ORD-42' } }] } }, views: { required: ['shadow'], allowed: ['shadow'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Applied ORD-42', elementKind: 'p[role=status]' }] },
});
// ---- E3 --------------------------------------------------------------------------------------
add({
  key: 'e3', id: 'E3-iframe',
  steps: ['Open <var frameUrl>.', 'Type Looks good in the Comment field and click Post.'],
  variables: [{ name: 'frameUrl', kind: 'plain', value: '${fixtureOrigin}/frame' }],
  pages: {
    frame: page('Frame host', `<main><h1>Embedded form</h1><iframe src="inner" title="Comment form" width="400" height="160"></iframe></main>`),
    inner: page('Comment form', `<main><label>Comment <input id="c"></label><button id="p">Post</button></main>`,
      `document.getElementById('p').onclick=async()=>{await rec('frame.post',{value:document.getElementById('c').value});};`),
  },
  expected: { class: 'N', phases: { run: { actions: [] } }, views: { required: [], allowed: ['frame', 'inner'] }, session: { terminal: ['FAILED', 'AWAITING_CLARIFICATION', 'CANCELLED', 'EXPIRED'], published: false, clarifications: 'ANY' } },
  rs1: { reads: [], asserts: [] },
  ruling: 'B3: recommended class N (collector treats iframe as an unsupported surface); NOT ruled by @po/@architect',
});
// ---- E4 --------------------------------------------------------------------------------------
add({
  key: 'e4', id: 'E4-virtualised-list',
  steps: ['Open <var listUrl>.', 'Click Item 0420 in the list, scrolling the list if needed.'],
  variables: [{ name: 'listUrl', kind: 'plain', value: '${fixtureOrigin}/list' }],
  pages: {
    list: page('Virtual list', `<main><h1>Orders</h1><div id="v" role="region" aria-label="Orders list" style="height:240px;overflow:auto;position:relative"><div id="sp"></div></div></main>`,
      `const N=500,H=24,v=document.getElementById('v'),sp=document.getElementById('sp');sp.style.height=(N*H)+'px';
function paint(){for(const e of [...v.querySelectorAll('button')])e.remove();const first=Math.floor(v.scrollTop/H);
for(let i=first;i<Math.min(N,first+12);i++){const b=document.createElement('button');b.style.cssText='position:absolute;left:0;height:'+H+'px;top:'+(i*H)+'px';
const id=String(i+1).padStart(4,'0');b.textContent='Item '+id;b.onclick=()=>rec('item.pick',{id});v.appendChild(b);}}
v.addEventListener('scroll',paint);paint();`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'item.pick', fields: { id: '0420' } }] } }, views: { required: ['list'], allowed: ['list'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [] },
});
// ---- Q1 --------------------------------------------------------------------------------------
add({
  key: 'q1', id: 'Q1-focus-time-helper-autocomplete',
  steps: ['Open <var formUrl>.', 'Fill City with London.', 'Click Save.'],
  variables: [{ name: 'formUrl', kind: 'plain', value: '${fixtureOrigin}/form' }],
  pages: {
    form: page('Address', `<main><h1>Address</h1><form id="f"><label>City <input id="c" name="c" autocomplete="off"></label><div id="hint-slot"></div><button type="submit">Save</button></form><p id="s" role="status"></p></main>`,
      `const c=document.getElementById('c');
c.addEventListener('focus',()=>{const h=document.createElement('p');h.className='hint';h.textContent='Start typing to see suggestions';document.getElementById('hint-slot').replaceChildren(h);
const box=document.createElement('ul');box.setAttribute('role','listbox');box.id='portal';box.style.cssText='position:fixed;top:0;right:0;margin:0';for(const t of ['London','Lyon','Lisbon']){const li=document.createElement('li');li.setAttribute('role','option');li.textContent=t;box.appendChild(li);}document.body.appendChild(box);});
document.getElementById('f').addEventListener('submit',async(e)=>{e.preventDefault();await rec('form.save',{city:c.value});document.getElementById('s').textContent='Saved';});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'form.save', fields: { city: 'London' } }] } }, views: { required: ['form'], allowed: ['form'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [] },
});
// ---- Q2 --------------------------------------------------------------------------------------
add({
  key: 'q2', id: 'Q2-authored-echo-assert-same-name',
  steps: ['Open <var homeUrl>.', 'Click Reports.', 'Check that the heading says Reports.'],
  variables: [{ name: 'homeUrl', kind: 'plain', value: '${fixtureOrigin}/home' }],
  pages: {
    home: page('Home', `<main><h1>Home</h1><a href="reports">Reports</a></main>`),
    reports: page('Reports', `<main><h1>Reports</h1><p>Protected report</p></main>`),
  },
  expected: { class: 'P', phases: { run: { actions: [] } }, views: { required: ['home', 'reports'], allowed: ['home', 'reports'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Reports', elementKind: 'h1' }] },
  reusedAsset: 'test/fixtures/secret-login/server.ts (/home link Reports, /reports h1 Reports) re-expressed without the login so AE-01 is isolated',
});
// ---- Q3 --------------------------------------------------------------------------------------
add({
  key: 'q3', id: 'Q3-authored-echo-select-option',
  steps: ['Open <var cityUrl>.', 'Select London from City.', 'Click Save.', 'Check that the page shows Saved London.'],
  variables: [{ name: 'cityUrl', kind: 'plain', value: '${fixtureOrigin}/city' }],
  pages: {
    city: page('City', `<main><h1>Delivery city</h1><form id="f"><label for="city">City</label><select id="city" name="c"><option>Paris</option><option>London</option><option>Berlin</option></select><button type="submit">Save</button></form><p id="s" role="status"></p></main>`,
      `document.getElementById('f').addEventListener('submit',async(e)=>{e.preventDefault();await rec('city.save',{city:e.target.c.value});document.getElementById('s').textContent='Saved '+e.target.c.value;});`),
  },
  expected: { class: 'P', phases: { run: { actions: [{ type: 'city.save', fields: { city: 'London' } }] } }, views: { required: ['city'], allowed: ['city'] }, session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } },
  rs1: { reads: [], asserts: [{ value: 'Saved London', elementKind: 'p[role=status]' }] },
});

// ---- emit --------------------------------------------------------------------------------------
const index = {};
for (const c of cases) {
  const dir = join(OUT, c.key);
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(c.pages)) writeFileSync(join(dir, `${name}.html`), html);
  const stepText = {
    schemaVersion: 1, caseId: c.id, authoredBy: AUTHOR,
    authoring: { authoringSchemaVersion: 2, globalContext: { entries: [], evidenceReferences: [] }, steps: c.steps.map((text, i) => ({ id: uuid(c.id, i + 1), text, context: ctx })) },
    configuration: CONFIG,
    variables: c.variables,
  };
  writeFileSync(join(dir, 'step-text.json'), JSON.stringify(stepText, null, 2) + '\n');
  const expected = {
    schemaVersion: 1, caseId: c.id, kind: 'EXPECTED_OUTCOME', authoredBy: AUTHOR,
    note: 'Written before any run. Receipts are the fixture-owned app-side record (page views and posted events), not the model or runner result.',
    class: c.expected.class,
    receipts: { phases: c.expected.phases, views: c.expected.views },
    session: c.expected.session,
    ...(c.script === undefined ? {} : { script: c.script }),
  };
  writeFileSync(join(dir, 'expected-outcome.json'), JSON.stringify(expected, null, 2) + '\n');
  index[c.id] = { key: c.key, class: c.expected.class, pages: Object.keys(c.pages), steps: c.steps.length, rs1: c.rs1, secret: c.secret ?? null, noPageReason: c.noPageReason ?? null, reusedAsset: c.reusedAsset ?? null, ruling: c.ruling ?? null };
}
writeFileSync(process.argv[3], JSON.stringify(index, null, 2));
console.log(Object.keys(index).length, 'cases emitted');
