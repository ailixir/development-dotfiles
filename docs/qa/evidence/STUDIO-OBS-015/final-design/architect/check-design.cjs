// Pure design-schema/vector checks only; no application imports, build, database or browser.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto'); const Ajv = require('ajv');
const dir = __dirname; const root = path.resolve(dir, '../../../../../..');
const ajv = new Ajv({strict:false, allErrors:true});
try {require('ajv-formats')(ajv);} catch { for (const name of ['uuid','uri','date-time']) ajv.addFormat(name,true); }
const contracts=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
for(const name of fs.readdirSync(contracts).filter(n=>n.endsWith('.schema.json'))){const value=JSON.parse(fs.readFileSync(path.join(contracts,name)));if(value.$id)ajv.addSchema(value);}
const schema=JSON.parse(fs.readFileSync(path.join(dir,'interfaces.schema.json')));ajv.addSchema(schema);
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json')));const errors=[];
for(const test of fixtures.schemaCases){const validate=ajv.compile({$ref:schema.$id+'#/definitions/'+test.definition});const ok=validate(test.value);if(ok!==test.valid)errors.push({name:test.name,expected:test.valid,actual:ok,errors:validate.errors});}
function canonical(v){if(v===null||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))throw Error('number');return String(v);}if(typeof v==='string')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>{if(!/^[\x20-\x7e]*$/.test(k))throw Error('key');return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';}
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
for(const test of fixtures.canonicalVectors){const text=canonical(test.input);if(text!==test.canonical||Buffer.from(text).toString('hex')!==test.canonicalUtf8Hex||hash(test.input)!==test.sha256)errors.push({vector:test.name});}
const {base,edit4}=fixtures.tenStepChain;const equal=[];const changed=[];
for(let i=0;i<10;i++){for(const rows of [base,edit4]){const row=rows[i];if(hash(row.stepInput)!==row.chain.stepInputHash||hash(row.chain)!==row.snapshot.inputChain||hash(row.learnedContent)!==row.snapshot.learnedStepHash||hash(row.snapshot)!==row.snapshotHash)errors.push({chain:i});if(i>0&&row.chain.previous!==hash(rows[i-1].chain))errors.push({chainPrevious:i});}if(base[i].snapshotHash===edit4[i].snapshotHash)equal.push(i+1);else changed.push(i+1);}
if(JSON.stringify(equal)!=='[1,2,3]')errors.push({equal});
const find=n=>fixtures.canonicalVectors.find(v=>v.name===n);
if(find('producer-before-consumer-deletion').sha256!==find('producer-after-last-consumer-deletion').sha256)errors.push({producerHash:false});
if(find('consumer-before-deletion').sha256===find('consumer-after-edge-removal').sha256)errors.push({consumerHash:false});
const ordered=find('utf8-reference-order-BMP-before-astral').input.map(x=>x.referenceId);if(Buffer.compare(Buffer.from(ordered[0]),Buffer.from(ordered[1]))>=0)errors.push({unicodeOrder:false});
// Independent JS verification of Python-produced complete private-input/hash/public basis joins.
function checkBasis(b) {
 const failures=[]; const insist=(ok,label)=>{if(!ok)failures.push(label);};
 const privateEnvelope=fixtures.privateInputReconstruction.envelope;
 const entries=b.materializationEvidence.entries;
 for(let i=0;i<entries.length;i++) {
  const e=entries[i], full=privateEnvelope.inputs[i], metadata={...full};delete metadata.value;
  insist(e.inputOrdinal===i&&e.inputId===full.inputId,'entry-order-identity');
  insist(e.inputHash===hash(full)&&canonical(e.metadata)===canonical(metadata),'private-input-hash-metadata');
 }
 let previous=null;
 for(let i=0;i<b.materializationEvidence.versions.length;i++) {
  const v=b.materializationEvidence.versions[i];
  const reconstructed={schemaVersion:3,sessionId:v.sessionId,scopeHash:v.scopeHash,sourceRevision:v.sourceRevision,configurationRevision:v.configurationRevision,inputs:privateEnvelope.inputs.slice(0,v.inputCount)};
  insist(v.contextRevision===i+1&&v.previousInputsHash===previous&&hash(reconstructed)===v.authoredInputsHash,'version-reconstruction');
  insist(v.sessionId===b.sessionId&&v.scopeHash===hash(b.scope)&&v.contextId===b.bootstrap.contextId,'version-session-scope');
  previous=v.authoredInputsHash;
 }
 insist(b.authoredInputsHash===previous&&b.bootstrap.inputsHash===previous,'basis-bootstrap-version');
 for(const af of b.actions) {
  const l=af.ledger,p=b.preparations.find(p=>p.preparationId===af.preparationId),a=b.obligationAssociations.find(a=>a.admissionId===l.admission.admissionId),v=b.materializationEvidence.versions[l.contextRevision-1];
  insist(Boolean(p&&a&&v),'action-complete-joins'); if(!p||!a||!v)continue;
  insist(Number.isSafeInteger(p.materializationRevision)&&p.materializationRevision>=v.birthMaterializationRevision,'preparation-actual-metadata-revision');
  insist(l.authoredInputsHash===v.authoredInputsHash&&p.proof.authoredInputsHash===v.authoredInputsHash&&p.proposal.authoredInputsHash===v.authoredInputsHash,'action-historical-input-version');
  insist(l.requestDigest===hash(p.proposal)&&a.proposalHash===l.requestDigest&&p.proof.requestDigest===l.requestDigest,'proposal-digest-joins');
  insist(l.admission.policyDecisionHash===hash({scopeHash:hash(b.scope),preparation:p.proof,requestDigest:hash(p.proposal)}),'policy-decision-join');
  insist(l.attemptOrdinal===0&&l.state==='SUCCEEDED','effective-action-attempt');
 }
 if(b.incrementalEvidence!==null) {
  const x=b.incrementalEvidence,p=x.plan,w=x.switch;
  insist(p.sessionId===b.sessionId&&p.testId===b.testId&&p.csiId===b.csiId&&w.sessionId===b.sessionId,'incremental-session-scope');
  insist(p.prefixProgramHash===hash(x.program)&&p.baseRevisionId===x.program.baseRevisionId&&p.baseRevisionId===w.baseRevisionId,'program-pin');
  insist(x.program.sourceStepIds.length===p.initialFirstLearnIndex&&w.reason==='BOUNDARY'&&w.completedPrefixCount===p.initialFirstLearnIndex,'contiguous-boundary');
  const expected=b.actions.filter(a=>x.program.sourceStepIds.includes(a.ledger.coordinate.stepId)).map(a=>a.ledger.admission.admissionId);
  insist(canonical(expected)===canonical(w.retainedPrefixAdmissionIds)&&hash(expected)===w.retainedPrefixAdmissionsHash&&canonical(expected)===canonical(x.firstSuffixAcceptance.retainedPrefixAdmissionIds),'exact-retained-admissions');
  insist(x.prefixRequests.length===expected.length,'prefix-request-count');
  x.prefixRequests.forEach((r,i)=>{const l=b.actions[i].ledger;insist(r.sessionId===b.sessionId&&r.scopeHash===hash(b.scope)&&r.prefixProgramHash===p.prefixProgramHash&&r.authoredInputsHash===l.authoredInputsHash&&canonical(r.coordinate)===canonical(l.coordinate)&&r.evidenceHash===l.evidenceHash,'prefix-request-exact-join');});
  insist(x.driftReceipt===null&&x.excludedAttempts.length===0,'boundary-no-exclusion');
 }
 return failures;
}
for(const name of ['complete-first-learn-validation-basis-extension','complete-incremental-boundary-validation-basis']) {
 const test=fixtures.schemaCases.find(t=>t.name===name),failed=checkBasis(test.value);if(failed.length)errors.push({basis:name,failed});
 const vectorName=name==='complete-first-learn-validation-basis-extension'?'publication-evidence-preimage':'incremental-publication-evidence-preimage';
 const preimage={version:1,basisHash:hash(test.value),runAuthorizationHash:hash(test.value.runAuthorization),translationHash:test.value.translationHash,bootstrapHash:hash(test.value.bootstrap),sourceManifestHash:test.value.sourceManifestHash};
 if(canonical(preimage)!==canonical(find(vectorName).input))errors.push({publicationPreimage:vectorName});
}
const tupleVector=find('effective-admission-provenance-array');if(!Array.isArray(tupleVector.input)||hash({admissions:tupleVector.input})===tupleVector.sha256)errors.push({admissionArrayProjection:false});
for(const test of fixtures.semanticCases){const failed=checkBasis(test.basis);if((failed.length===0)!==test.valid)errors.push({semanticCase:test.name,failed});}
const result={kind:'DESIGN_CHECK_ONLY',applicationTestsRun:0,generatedAt:new Date().toISOString(),schemaCases:fixtures.schemaCases.length,canonicalVectors:fixtures.canonicalVectors.length,completeBasisFixtures:2,semanticNegativeCases:fixtures.semanticCases.length,privateInputReconstructionVerified:true,publicationEvidenceHashes:{ordinary:hash(find('publication-evidence-preimage').input),incremental:hash(find('incremental-publication-evidence-preimage').input)},tenStepEqual:equal,tenStepChanged:changed,errors,status:errors.length?'FAIL':'PASS'};
if(!process.argv.includes('--verify'))fs.writeFileSync(path.join(dir,'design-check-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=errors.length?1:0;
