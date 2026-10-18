// Lane C one-shot reseal of stale v3 semantic fixture data (copied from v2, never executed under v3).
const fs=require('fs');const path=require('path');
const root=process.argv[2];const t=require(path.join(root,'tools/check-studio-observed-contracts.cjs'));
const file=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3/fixtures.json');
const f=JSON.parse(fs.readFileSync(file,'utf8'));const log=[];
function applyPatch(value, patch){const s=patch.path.split('/').slice(1);const p=s.pop();const par=s.reduce((c,k)=>c[k],value);if(patch.op==='remove')delete par[p];else par[p]=patch.value;}
// 1. authoredInputsHash patches that were exact hashes of the patched v2 table (expected != INPUT_HASH).
for(const c of f.cases){const hp=(c.patches||[]).filter(p=>p.path==='/context/authoredInputsHash');if(!hp.length||c.expected==='INPUT_HASH')continue;
  const s=structuredClone(f.documents[c.document]);for(const p of c.patches.filter(p=>p.path!=='/context/authoredInputsHash'))applyPatch(s,p);
  const value=t.hash(s.context.authoredInputs);for(const p of hp){if(p.value!==value){log.push({case:c.name,path:p.path,old:p.value,new:value});p.value=value;}}}
// 2. scope-hash cases patched the removed v3 scope field accountRef; retarget to an existing scope field.
for(const c of f.cases)for(const p of c.patches||[])if(p.path.endsWith('/scope/accountRef')){const np=p.path.replace('/scope/accountRef','/scope/modelDataPolicyId');log.push({case:c.name,oldPath:p.path,newPath:np,old:p.value,new:'other-model-data-policy'});p.path=np;p.value='other-model-data-policy';}
// 3. refresh accounting: v3 observation adds coverage.passwordControls, so committed evidence bytes move.
const r=f.documents.observationRefreshFlow;const bytes=Buffer.byteLength(t.canonical(r.callback.observation),'utf8');const need=r.before.evidenceBytes+bytes;
if(r.after.evidenceBytes!==need){log.push({document:'observationRefreshFlow',path:'/after/evidenceBytes',old:r.after.evidenceBytes,new:need});r.after.evidenceBytes=need;}
fs.writeFileSync(file,JSON.stringify(f,null,2)+'\n');console.log(JSON.stringify(log,null,1));
