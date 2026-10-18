// Independent Quinn design-only audit. No application/database/browser execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const root = path.resolve(__dirname, '../../../../../..');
const base = path.join(root, 'docs/qa/evidence/STUDIO-OBS-015/final-design');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonical = v => {
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || Object.is(v, -0)) throw Error('unsupported number');
    return String(v);
  }
  if (typeof v === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) throw Error('unpaired surrogate');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => {
    if (!/^[\x20-\x7e]*$/.test(k)) throw Error('non-ASCII object key');
    return JSON.stringify(k) + ':' + canonical(v[k]);
  }).join(',') + '}';
};
const hash = v => crypto.createHash('sha256').update(canonical(v), 'utf8').digest('hex');
const same = (a, b) => canonical(a) === canonical(b);
const errors = [], checks = [], manifestChecks = [];
function check(ok, name, detail) { checks.push({name, ok, ...(detail === undefined ? {} : {detail})}); if (!ok) errors.push({name,detail}); }
for (const owner of ['architect','data']) {
  const manifestPath = path.join(base, owner, 'manifest.json'), m = read(manifestPath);
  for (const [key, expected] of Object.entries(m.files)) {
    const absolute = key.startsWith('docs/') ? path.join(root, key) : path.join(base, owner, key);
    const actual = fs.existsSync(absolute) ? digest(absolute) : null;
    manifestChecks.push({owner,key,expected,actual,ok:expected===actual});
  }
  for (const [key, expected] of Object.entries(m.sourceHashes || m.frozenProductionMigrationHashes || {})) {
    const absolute = path.join(root,key), actual = fs.existsSync(absolute) ? digest(absolute) : null;
    manifestChecks.push({owner,kind:'sourceAnchor',key,expected,actual,ok:expected===actual});
  }
  if (m.dataSnapshot) check(digest(path.join(root,m.dataSnapshot.path))===m.dataSnapshot.sha256,'architecture-binds-data-manifest');
}
check(manifestChecks.every(x=>x.ok),'all-manifest-and-source-hashes',manifestChecks.length);
const schemas = path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
const ajv = new Ajv({strict:false,allErrors:true});
require('ajv-formats')(ajv);
const registered = new Map();
for (const filename of fs.readdirSync(schemas).filter(n=>n.endsWith('.schema.json'))) {
  const value=read(path.join(schemas,filename)); if(value.$id) {ajv.addSchema(value);registered.set(value.$id,value);}
}
const schema=read(path.join(base,'architect/interfaces.schema.json'));ajv.addSchema(schema);registered.set(schema.$id,schema);
const f=read(path.join(base,'architect/fixtures.json'));
for(const c of f.schemaCases) {
  const validate=ajv.compile({$ref:schema.$id+'#/definitions/'+c.definition});
  check(validate(c.value)===c.valid,'schema:'+c.name,c.valid?'positive':'negative');
}
let references=0;
function refs(v,current) {
  if(!v||typeof v!=='object')return;
  if(v.$ref) {
    references++;
    const [url,fragment='']=v.$ref.split('#'); let target=url?registered.get(url):current;
    if(fragment)for(const segment of fragment.replace(/^\//,'').split('/'))target=target?.[segment.replace(/~1/g,'/').replace(/~0/g,'~')];
    check(target!==undefined,'schema-reference:'+v.$ref);
  }
  for(const child of Object.values(v))refs(child,current);
}
refs(schema,schema);
for(const v of f.canonicalVectors)check(canonical(v.input)===v.canonical&&Buffer.from(canonical(v.input)).toString('hex')===v.canonicalUtf8Hex&&hash(v.input)===v.sha256,'vector:'+v.name);
const vectors=new Map(f.canonicalVectors.map(x=>[x.name,x]));
const ten=f.tenStepChain;
for(const side of ['base','edit4'])for(const [i,r]of ten[side].entries()) {
  check(hash(r.stepInput)===r.chain.stepInputHash&&hash(r.chain)===r.snapshot.inputChain&&hash(r.learnedContent)===r.snapshot.learnedStepHash&&hash(r.snapshot)===r.snapshotHash,'ten-step:'+side+':'+(i+1));
  if(i)check(r.chain.previous===hash(ten[side][i-1].chain),'chain-previous:'+side+':'+i);
}
const unchanged=ten.base.map((x,i)=>x.snapshotHash===ten.edit4[i].snapshotHash?i+1:null).filter(Boolean);
check(same(unchanged,[1,2,3]),'exact-edit-four-prefix');
check(vectors.get('producer-before-consumer-deletion').sha256===vectors.get('producer-after-last-consumer-deletion').sha256,'producer-independent-of-suffix-consumer');
check(vectors.get('consumer-before-deletion').sha256!==vectors.get('consumer-after-edge-removal').sha256,'consumer-edge-remains-committed');
function basisProblems(b) {
  const fail=[], demand=(ok,name)=>{if(!ok)fail.push(name);};
  const privateInputs=f.privateInputReconstruction.envelope.inputs;
  const {versions,entries}=b.materializationEvidence;
  demand(entries.length===privateInputs.length,'complete-input-evidence');
  for(const [i,e]of entries.entries()) {
    const full=privateInputs[i], metadata={...full};delete metadata.value;
    demand(e.inputOrdinal===i&&e.inputId===full.inputId&&e.inputHash===hash(full)&&same(e.metadata,metadata),'private-input:'+i);
    demand(e.introducedContextRevision>=1&&e.introducedContextRevision<=versions.length,'entry-introduced-version');
  }
  for(const [i,v]of versions.entries()) {
    const envelope={schemaVersion:3,sessionId:v.sessionId,scopeHash:v.scopeHash,sourceRevision:v.sourceRevision,configurationRevision:v.configurationRevision,inputs:privateInputs.slice(0,v.inputCount)};
    demand(v.authoredInputsHash===hash(envelope)&&v.contextRevision===i+1&&v.previousInputsHash===(i?versions[i-1].authoredInputsHash:null),'full-private-version:'+i);
    demand(v.sessionId===b.sessionId&&v.scopeHash===hash(b.scope)&&v.contextId===b.bootstrap.contextId,'version-basis-identity');
    demand(entries.slice(0,v.inputCount).every(e=>e.introducedContextRevision<=v.contextRevision),'version-exact-cutoff');
  }
  demand(b.authoredInputsHash===versions.at(-1).authoredInputsHash,'basis-current-head');
  demand(b.bootstrap.inputsHash===versions[b.bootstrap.contextRevision-1]?.authoredInputsHash,'bootstrap-historical-version');
  const admissions=new Set(),coordinates=new Set();
  for(const a of b.actions) {
    const l=a.ledger,p=b.preparations.find(x=>x.preparationId===a.preparationId),association=b.obligationAssociations.find(x=>x.admissionId===l.admission.admissionId),v=versions[l.contextRevision-1];
    demand(!admissions.has(l.admission.admissionId)&&!coordinates.has(canonical(l.coordinate)),'effective-unique');admissions.add(l.admission.admissionId);coordinates.add(canonical(l.coordinate));
    demand(Boolean(p&&association&&v),'effective-complete-joins');if(!p||!association||!v)continue;
    demand(l.state==='SUCCEEDED'&&l.dispatchCount===1&&l.outcomeCode==='OK','effective-success');
    demand(l.sessionId===b.sessionId&&l.scopeHash===hash(b.scope)&&l.ownerFence===v.ownerFence,'ledger-owner-scope');
    demand(p.materializationRevision>=v.birthMaterializationRevision,'preparation-actual-metadata');
    demand(l.authoredInputsHash===v.authoredInputsHash&&p.proposal.authoredInputsHash===v.authoredInputsHash&&p.proof.authoredInputsHash===v.authoredInputsHash,'historical-input-hash');
    demand(l.contextRevision===p.proof.contextRevision&&l.contextRevision===p.proposal.contextRevision,'historical-context-revision');
    demand(l.requestDigest===hash(p.proposal)&&p.proof.requestDigest===l.requestDigest&&association.proposalHash===l.requestDigest,'original-proposal-digest');
    demand(p.proof.preparationId===l.preparationId&&a.preparationId===l.preparationId&&a.obligationId===association.obligationId&&same(l.coordinate,association.coordinate),'original-preparation-association');
    demand(l.admission.policyDecisionHash===hash({scopeHash:hash(b.scope),preparation:p.proof,requestDigest:hash(p.proposal)}),'policy-decision-exact');
  }
  if(b.incrementalEvidence) {
    const x=b.incrementalEvidence,p=x.plan,s=x.switch;
    demand(p.sessionId===b.sessionId&&p.testId===b.testId&&p.csiId===b.csiId&&s.sessionId===b.sessionId,'incremental-owner');
    demand(p.prefixProgramHash===hash(x.program)&&p.baseRevisionId===x.program.baseRevisionId&&p.baseRevisionId===s.baseRevisionId,'immediate-program-pin');
    demand(s.reason==='BOUNDARY'&&p.initialFirstLearnIndex===x.program.sourceStepIds.length&&s.completedPrefixCount===p.initialFirstLearnIndex,'boundary-contiguous');
    demand(s.effectiveFirstLearnStepId===b.sourceSteps[s.effectiveFirstLearnIndex].stepId,'effective-current-step');
    const prefix=b.actions.filter(a=>x.program.sourceStepIds.includes(a.ledger.coordinate.stepId));
    const retained=prefix.map(a=>a.ledger.admission.admissionId);
    demand(same(retained,s.retainedPrefixAdmissionIds)&&hash(retained)===s.retainedPrefixAdmissionsHash&&same(retained,x.firstSuffixAcceptance.retainedPrefixAdmissionIds),'exact-retained-admissions');
    demand(x.prefixRequests.length===prefix.length,'complete-issued-requests');
    for(const [i,r]of x.prefixRequests.entries()) {
      const l=prefix[i]?.ledger,v=versions[r.contextRevision-1];if(!l||!v){demand(false,'prefix-request-orphan');continue;}
      demand(r.sessionId===b.sessionId&&r.scopeHash===hash(b.scope)&&r.workerId===v.workerId&&r.ownerFence===v.ownerFence&&r.contextId===v.contextId&&r.authoredInputsHash===v.authoredInputsHash&&r.prefixProgramHash===p.prefixProgramHash&&same(r.coordinate,l.coordinate)&&r.evidenceHash===l.evidenceHash,'exact-prefix-request');
    }
    demand(x.driftReceipt===null&&x.excludedAttempts.length===0,'boundary-excludes-no-spent-attempt');
  }
  return fail;
}
for(const [name,preimageName]of [['complete-first-learn-validation-basis-extension','publication-evidence-preimage'],['complete-incremental-boundary-validation-basis','incremental-publication-evidence-preimage']]) {
  const b=f.schemaCases.find(c=>c.name===name).value,problems=basisProblems(b);
  check(problems.length===0,'complete-basis:'+name,problems);
  const preimage={version:1,basisHash:hash(b),runAuthorizationHash:hash(b.runAuthorization),translationHash:b.translationHash,bootstrapHash:hash(b.bootstrap),sourceManifestHash:b.sourceManifestHash};
  check(same(preimage,vectors.get(preimageName).input),'publication-preimage:'+name);
}
for(const c of f.semanticCases)check((basisProblems(c.basis).length===0)===c.valid,'semantic-negative:'+c.name);
const inherited=read(path.join(root,'docs/qa/evidence/STUDIO-OBS-015/resume-plan/ac-test-matrix.json')).tests;
const delta=read(path.join(base,'architect/acceptance-delta.json'));
const planned=[...inherited.filter(t=>!Object.hasOwn(delta.replacementMap,t.name)),...delta.additionalOrReplacementCases];
check(inherited.length===38&&new Set(planned.map(t=>t.name)).size===planned.length,'complete-test-inventory');
check(planned.every(t=>t.status==='PLANNED_NOT_RUN'&&t.assertions&&t.tier),'truthful-planned-test-status');
for(const ac of ['AC-1','AC-2','AC-3','AC-4','AC-5','AC-6'])check(planned.some(t=>t.ac.includes(ac)),'test-traceability:'+ac);
const data=read(path.join(base,'data/interface-and-test-spec.json'));
check(data.namedTestSpecification.plannedMigrationMethods.length===data.namedTestSpecification.plannedMigrationMethodCount,'migration-case-inventory');
const result={artifact:'Independent Quinn015 final-design arithmetic/schema/manifest audit',classification:'DESIGN_CHECK_ONLY_NOT_IMPLEMENTATION_QA',createdAt:new Date().toISOString(),schemaCases:f.schemaCases.length,canonicalVectors:f.canonicalVectors.length,schemaReferenceOccurrences:references,completeBasisFixtures:2,semanticNegativeCases:f.semanticCases.length,inheritedCases:inherited.length,deltaCases:delta.additionalOrReplacementCases.length,replacedInheritedCases:Object.keys(delta.replacementMap).length,effectivePlannedCases:planned.length,plannedMigrationMethods:data.namedTestSpecification.plannedMigrationMethodCount,unchangedSnapshotPositions:unchanged,applicationTestsExecuted:0,databaseCommandsExecuted:0,browserCommandsExecuted:0,manifests:manifestChecks,checks,errors,status:errors.length?'FAIL':'PASS'};
fs.writeFileSync(path.join(__dirname,'independent-design-audit.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'planned-test-inventory.json'),JSON.stringify({classification:'PLANNED_NOT_RUN',inheritedCount:inherited.length,replacementMap:delta.replacementMap,effectiveCount:planned.length,tests:planned,migrationCases:data.namedTestSpecification.plannedMigrationMethods},null,2)+'\n');
console.log(JSON.stringify({...result,manifests:manifestChecks.length,checks:checks.length},null,2));process.exitCode=errors.length?1:0;
