/** Independent, bounded fixture migration; never imports the production validator/lowerer.
 * Takes the original manual v2 fixture and preserves its operations and read recipes. */
import {createHash} from 'node:crypto';
const tuple = {contract:3,learnedPlan:3,observation:3,guidedPolicy:3,referencePolicy:4,lowering:2,artifact:3,language:'observed-3',executor:'observed-4'};
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function bounded(value) {
  let count = 0;
  function visit(item, depth) {
    if (depth > 32 || ++count > 1000000) throw Error('FIXTURE_BOUND');
    if (item && typeof item === 'object') for (const child of Object.values(item)) visit(child, depth+1);
  }
  visit(value,0);
}
function transform(value) {
  if (Array.isArray(value)) return value.map(transform);
  if (!value || typeof value !== 'object') return value;
  let next = {};
  for (const [key, child] of Object.entries(value)) {
    if (['accountRef','accountHandle','accountAuthorization','accountGrantId','accountAbi','authConnection'].includes(key)) continue;
    next[key] = transform(child);
  }
  if (next.schemaVersion === 2) next.schemaVersion = 3;
  if (next.contract === 2 && next.learnedPlan === 2) Object.assign(next, tuple);
  if (next.catalog === 'observed-replay-1') Object.assign(next, tuple, {catalog:'observed-replay-3',validator:'observed-2',protocol:3,replayAuthorization:2});
  if (next.coverage) next.coverage.passwordControls = 0;
  if (next.kind === 'observed' && next.version === 2) next.version = 3;
  if (next.schemaVersion === 3 && next.learnedPlanHash && next.inputs && next.scope && next.transfers) next.schemaVersion = 4;
  return next;
}
function convert(original) {
  bounded(original);
  const seed = transform(original); let mapping = new Map(); let current;
  const substitute = value => typeof value === 'string' ? mapping.get(value) ?? value : Array.isArray(value) ? value.map(substitute) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child])=>[key,substitute(child)])) : value;
  let stable = false;
  for (let iteration=0;iteration<64;iteration++) {
    current = substitute(seed); const next = new Map();
    function pair(before, after) {
      if (!before || typeof before !== 'object' || !after || typeof after !== 'object') return;
      next.set(hash(before), hash(after));
      for (const [key, child] of Object.entries(before)) if (after[key] !== undefined) pair(child,after[key]);
    }
    pair(original,current); stable = [...next].every(([key, value])=>mapping.get(key)===value); mapping=next;
    if (stable) break;
  }
  if (!stable) throw Error('FIXTURE_HASH_CYCLE');
  const basis=current.basis,artifact=current.artifact;
  for (const preparation of basis.preparations) {
    const ledger=basis.actions.find(action=>action.preparationId===preparation.preparationId)?.ledger;
    if (!ledger) throw Error('FIXTURE_ADMISSION');
    ledger.admission.policyDecisionHash=hash({scopeHash:hash(basis.scope),preparation:preparation.proof,requestDigest:hash(preparation.proposal)});
  }
  const learnedPlanHash=hash(artifact.learnedPlan),runAuthorizationHash=hash(basis.runAuthorization);
  const admissionProvenanceHash=hash(basis.actions.map(({ledger})=>({coordinate:ledger.coordinate,admission:ledger.admission,operationHash:ledger.operationHash,scopeHash:ledger.scopeHash})));
  const publicationEvidenceHash=hash({version:1,basisHash:hash(basis),runAuthorizationHash,translationHash:basis.translationHash,bootstrapHash:hash(basis.bootstrap),sourceManifestHash:basis.sourceManifestHash});
  Object.assign(artifact.replayPolicy,{learnedPlanHash,runAuthorizationHash,admissionProvenanceHash,publicationEvidenceHash}); artifact.learnedPlanHash=learnedPlanHash;
  Object.assign(current.hashes,{learnedPlanHash,runAuthorizationHash,admissionProvenanceHash,publicationEvidenceHash,referencePolicyHash:hash(artifact.replayPolicy),artifactHash:hash(artifact),operationEquivalenceHash:hash({operations:artifact.steps.flatMap(step=>step.operations),guards:artifact.guards,inputRecipes:artifact.inputRecipes,bindings:artifact.replayPolicy.bindings,transfers:artifact.replayPolicy.transfers}),profileHash:hash(artifact.profile)});
  return current;
}
export {convert};
