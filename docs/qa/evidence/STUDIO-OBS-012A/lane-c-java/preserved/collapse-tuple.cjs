// STUDIO-OBS-012A Lane C (Java wave) one-shot tuple collapse + digest reseal (tuple-spec.json).
// Usage: node collapse-tuple.cjs <repoRoot>
// 1. every object deep-equal to the retired nine-pin `versions` or the 17-key replay profile
//    becomes {contract:3};
// 2. every digest string equal to the old hash of an aligned object/array subtree is replaced by
//    the new hash of that subtree, iterated to a fixpoint (one combined document over all files,
//    so cross-file digests move together);
// 3. the publication composites the contract checker and the runner rebuild independently
//    (policyDecisionHash, admissionProvenanceHash, publicationEvidenceHash, learnedPlanHash and the
//    reference-fixture `hashes`) are recomputed from their preimages, then step 2 runs again.
// No browser, database or production code is involved; hashes are canonical-v1 SHA-256.
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const t = require(path.join(root, 'tools/check-studio-observed-contracts.cjs'));
const { hash } = t;
const OLD_VERSIONS = { contract: 3, learnedPlan: 3, observation: 3, guidedPolicy: 3, referencePolicy: 4, lowering: 2, artifact: 3, language: 'observed-3', executor: 'observed-4' };
const OLD_PROFILE = { catalog: 'observed-replay-3', playwright: '1.63.0', browserEngine: 'chromium', ...OLD_VERSIONS, publicationEvidence: 1, validationBasis: 1, validator: 'observed-2', protocol: 3, replayAuthorization: 2 };
const NEW = { contract: 3 };
const files = [
  'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json',
  'docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json',
  'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',
  'studio-runner/fixtures/observed-reference/fresh-order-reference.json',
  'studio-runner/fixtures/observed-reference/control-value-reference.json',
  'studio-runner/fixtures/observed-reference/accepted-observed-choice.json',
];
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) { return Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v; }
const isObj = v => v && typeof v === 'object';
const counts = { versions: 0, profile: 0 };
function transform(v) {
  if (Array.isArray(v)) return v.map(transform);
  if (!isObj(v)) return v;
  if (same(v, OLD_VERSIONS)) { counts.versions++; return { ...NEW }; }
  if (same(v, OLD_PROFILE)) { counts.profile++; return { ...NEW }; }
  return Object.fromEntries(Object.entries(v).map(([k, c]) => [k, transform(c)]));
}
function safeHash(v) { try { return hash(v); } catch { return null; } }
function pairs(before, after, out) {
  if (!isObj(before) || !isObj(after)) return;
  const a = safeHash(before), b = safeHash(after);
  if (a && b && a !== b) {
    if (out.has(a) && out.get(a) !== b) throw Error('AMBIGUOUS_REMAP ' + a);
    out.set(a, b);
  }
  for (const [k, c] of Object.entries(before)) if (after[k] !== undefined) pairs(c, after[k], out);
}
const substitute = (v, m, log) => typeof v === 'string' ? (m.has(v) ? (log.n++, m.get(v)) : v)
  : Array.isArray(v) ? v.map(x => substitute(x, m, log))
  : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, c]) => [k, substitute(c, m, log)])) : v;
function fixpoint(base, seeded, seedMap) {
  // base: document before this round's semantic change; seeded: after it (no digest moved yet).
  let mapping = new Map(seedMap), current = seeded;
  for (let i = 0; i < 64; i++) {
    const log = { n: 0 };
    current = substitute(seeded, mapping, log);
    const next = new Map(seedMap); pairs(base, current, next);
    const stable = next.size === mapping.size && [...next].every(([k, v]) => mapping.get(k) === v);
    mapping = next;
    if (stable) return { current, mapping, substitutions: log.n, iterations: i + 1 };
  }
  throw Error('HASH_CYCLE');
}
// Composite preimages, exactly as tools/check-studio-observed-contracts.cjs runPublication rebuilds.
const sealed = [];
function set(obj, key, value) { if (obj[key] !== value) { if (typeof obj[key] === 'string') sealed.push([obj[key], value]); obj[key] = value; } }
function sealSample(s) {
  if (!isObj(s) || !isObj(s.basis) || !isObj(s.artifact) || !Array.isArray(s.basis.actions)) return;
  const { basis, artifact } = s;
  const prep = new Map(basis.preparations.map(p => [p.preparationId, p]));
  for (const action of basis.actions) {
    const p = prep.get(action.preparationId);
    if (!p) continue;
    const requestDigest = hash(p.proposal);
    set(action.ledger.admission, 'policyDecisionHash', hash({ scopeHash: action.ledger.scopeHash, preparation: p.proof, requestDigest }));
  }
  const ordered = [...basis.actions].sort((a, b) =>
    basis.sourceSteps.findIndex(st => st.stepId === a.ledger.coordinate.stepId)
      - basis.sourceSteps.findIndex(st => st.stepId === b.ledger.coordinate.stepId)
    || a.ledger.coordinate.ordinal - b.ledger.coordinate.ordinal);
  const rp = artifact.replayPolicy;
  set(rp, 'admissionProvenanceHash', hash(ordered.map(({ ledger: l }) => ({ coordinate: l.coordinate, admission: l.admission, operationHash: l.operationHash, scopeHash: l.scopeHash }))));
  set(rp, 'publicationEvidenceHash', hash({ version: 1, basisHash: hash(basis), runAuthorizationHash: hash(basis.runAuthorization),
    translationHash: basis.translationHash, bootstrapHash: hash(basis.bootstrap), sourceManifestHash: basis.sourceManifestHash }));
  if ('runAuthorizationHash' in rp) set(rp, 'runAuthorizationHash', hash(basis.runAuthorization));
  set(artifact, 'learnedPlanHash', hash(artifact.learnedPlan));
  if ('learnedPlanHash' in rp) set(rp, 'learnedPlanHash', artifact.learnedPlanHash);
  if (isObj(s.hashes)) {
    const h = s.hashes;
    for (const [k, v] of Object.entries({ learnedPlanHash: artifact.learnedPlanHash, runAuthorizationHash: hash(basis.runAuthorization),
      admissionProvenanceHash: rp.admissionProvenanceHash, publicationEvidenceHash: rp.publicationEvidenceHash, referencePolicyHash: hash(rp),
      artifactHash: hash(artifact), profileHash: hash(artifact.profile),
      operationEquivalenceHash: hash({ operations: artifact.steps.flatMap(st => st.operations), guards: artifact.guards, inputRecipes: artifact.inputRecipes, bindings: rp.bindings, transfers: rp.transfers }) })) {
      if (k in h) set(h, k, v);
    }
  }
}
const identityFields = ['schemaVersion', 'sessionId', 'workerId', 'ownerFence', 'scopeHash',
  'contextId', 'contextRevision', 'sourceRevision', 'configurationRevision', 'versions'];
const identity = v => Object.fromEntries(identityFields.map(f => [f, v[f]]));
function replaceString(v, from, to) {
  return typeof v === 'string' ? (v === from ? to : v) : Array.isArray(v) ? v.map(x => replaceString(x, from, to))
    : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, c]) => [k, replaceString(c, from, to)])) : v;
}
function seal(doc) {
  let out = structuredClone(doc);
  const fx = 'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json';
  for (const vector of out[fx].hashVectors) { vector.canonical = t.canonical(vector.value); vector.sha256 = hash(vector.value); }
  for (const pick of [f => f.observationRefreshCorrelationVector, f => f.documents.observationRefreshFlow]) {
    const c = pick(out[fx]);
    const preimage = { identity: identity(c.request), idempotencyKey: c.idempotencyKey, requestDigest: hash(c.request) };
    c.requestDigest = preimage.requestDigest;
    if (c.canonical !== undefined) c.canonical = t.canonical(preimage);
    const key = 'oref-' + hash(preimage);
    if (c.callbackKey !== key) { const old = c.callbackKey; out = replaceString(out, old, key); }
  }
  const pub = out['docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json'];
  sealed.length = 0;
  sealSample(pub); sealSample(pub.observedChoice);
  for (const f of files.filter(f => f.startsWith('studio-runner/'))) sealSample(out[f]);
  // Copies of a resealed composite (e.g. validationRequest.validationBasis) move with it.
  for (const [from, to] of sealed) out = replaceString(out, from, to);
  return out;
}
const original = Object.fromEntries(files.map(f => [f, JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))]));
const seedMap = new Map([[hash(OLD_VERSIONS), hash(NEW)], [hash(OLD_PROFILE), hash(NEW)]]);
let base = original, seeded = transform(original), rounds = [];
let result;
for (let round = 0; round < 16; round++) {
  result = fixpoint(base, seeded, round === 0 ? seedMap : new Map());
  const sealed = seal(result.current);
  rounds.push({ round, remapped: result.mapping.size, substitutions: result.substitutions, iterations: result.iterations });
  if (JSON.stringify(sealed) === JSON.stringify(result.current)) break;
  base = result.current; seeded = sealed;
}
// `versions` negative cases that removed a now-retired pin become "refuses the retired pin" cases.
const retired = { learnedPlan: 3, observation: 3, guidedPolicy: 3, referencePolicy: 4, lowering: 2, artifact: 3, language: 'observed-3', executor: 'observed-4' };
const renamed = [];
for (const c of result.current['docs/specs/studio-observed-authoring/contracts/v3/fixtures.json'].cases) {
  const m = /^compatibility requires (\w+)$/.exec(c.name);
  if (!m || !(m[1] in retired)) continue;
  renamed.push([c.name, 'versions refuses retired ' + m[1] + ' pin']);
  c.name = 'versions refuses retired ' + m[1] + ' pin'; c.patches = [{ op: 'add', path: '/' + m[1], value: retired[m[1]] }];
}
for (const f of files) fs.writeFileSync(path.join(root, f), JSON.stringify(result.current[f], null, 2) + '\n');
console.log(JSON.stringify({ renamed, replaced: counts, oldVersionsHash: hash(OLD_VERSIONS), oldProfileHash: hash(OLD_PROFILE), newHash: hash(NEW), rounds }, null, 1));
