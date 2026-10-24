"""Independent source/JSON/AST/hash/in-memory diff audit. No runtime/body/OS actions."""
from pathlib import Path
import ast,hashlib,json,re,collections
R=next(p for p in Path(__file__).resolve().parents if (p/'AGENTS.md').is_file())
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
B=T/'early/c8-fullcheck-prep/composed-resume1'
E=T/'early/c8-fullcheck-prep/resume4/execution'
C=T/'early/c8-fullcheck-prep/resume3/control'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def astsha(n):return hashlib.sha256(ast.dump(n,include_attributes=False).encode()).hexdigest()
def apply_exact(source,patch):
 lines=patch.splitlines(True);old=source.splitlines(True);i=2;cursor=0;out=[]
 while i<len(lines):
  m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n',lines[i]);assert m
  a,n,b,k=int(m[1]),int(m[2] or 1),int(m[3]),int(m[4] or 1);a=a-1 if n else a;b=b-1 if k else b
  assert a>=cursor;out+=old[cursor:a];i+=1;before=[];after=[]
  while i<len(lines) and not lines[i].startswith('@@ '):
   op,value=lines[i][0],lines[i][1:];assert op in ' +-'
   if op in ' -':before.append(value)
   if op in ' +':after.append(value)
   i+=1
  assert len(before)==n and len(after)==k and old[a:a+n]==before and len(out)==b
  out+=after;cursor=a+n
 return ''.join(out+old[cursor:])
def main():
 c=read(B/'composition.json');manifest=read(B/'manifest.json');assert sha(B/'manifest.json')=='5fd6e9a1f3e11b11266a47520cebf5dc9c009d61c4fe0036cbf5d00668ee33f2'
 for row in manifest['files']:assert sha(B/row['path'])==row['sha256']
 members={}
 for role,d in [('execution',E),('control',C)]:
  assert sha(d/'manifest.json')==c[role+'ManifestSha256'];m=read(d/'manifest.json');members[role]=len(m['files'])
  for row in m['files']:assert sha(d/row['path'])==row['sha256']
 for name,h in c['inputPins'].items():assert sha(R/name)==h,name
 for row in read(E/'input-pins.json')['inputs']:assert sha(R/row['path'])==row['sha256'],row['path']
 installs=c['installMap'];assert len(installs)==29 and len({x['runtimeRelativePath'] for x in installs})==29
 for x in installs:assert sha(R/x['source'])==x['sha256'] and x['mode']==0o600
 for role in ('execution','control'):
  assert c[role+'PackagePins']=={x['runtimeRelativePath']:x['sha256'] for x in installs if x['runtimeRelativePath'].startswith(role+'/')}
 template=read(B/'release-template.json')
 for k in ('executionPackagePins','controlPackagePins'):assert template[k]==c[k]
 assert template['nativeCommandReleased'] is False and template['fullAcceptedSuccessorFreshCheckAuthorized'] is False and template['sourceLease']['exclusive'] is False
 diffs=[]
 for label,before,after,forward,reverse in [('execution',E.parent.parent/'resume3/execution',E,'implementation.diff','implementation.reverse.diff'),('control',C.parent.parent/'resume2/control',C,'compatibility.forward.diff','compatibility.reverse.diff')]:
  counts=[]
  for file,back in [(forward,False),(reverse,True)]:
   n=0
   for chunk in filter(None,re.split(r'(?=^--- )',(after/file).read_text(),flags=re.M)):
    a,b=chunk.splitlines()[:2];ain=a[4:];bin=b[4:];name=Path(bin if ain=='/dev/null' else ain).name
    srcroot,dstroot=(after,before) if back else (before,after)
    src='' if ain=='/dev/null' else (srcroot/name).read_text();want='' if bin=='/dev/null' else (dstroot/name).read_text()
    assert apply_exact(src,chunk)==want,(label,file,name);n+=1
   counts.append(n)
  assert counts[0]==counts[1];diffs.append({'component':label,'forwardReverseMembers':counts[0]})
 gate=ast.parse((C/'unlock_gate.py').read_text());constants={n.targets[0].id:ast.literal_eval(n.value) for n in gate.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in {'REDUCER_ASSESSOR_SHA','EXECUTION_CHECKS_SHA','REPORT_INVENTORY_SHA','CLASSIFICATION_SHA'}}
 api=read(E/'pure-api.json')
 for k,name in [('REDUCER_ASSESSOR_SHA','assessor.py'),('EXECUTION_CHECKS_SHA','execution_checks.py'),('REPORT_INVENTORY_SHA','report_inventory.py'),('CLASSIFICATION_SHA','evidence_classification.py')]:assert constants[k]==sha(E/name)==api['sources'][name]['sha256']
 assessor=ast.parse((E/'assessor.py').read_text());old=ast.parse((E.parent.parent/'resume3/execution/assessor.py').read_text())
 for name in ('task_event_proof','task_statuses'):
  node=next(n for n in assessor.body if isinstance(n,ast.FunctionDef) and n.name==name);prior=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name==name)
  assert astsha(node)==astsha(prior)==api['sources']['assessor.py']['functionAstSha256'][name]
 before=(C.parent.parent/'resume2/control/unlock_gate.py').read_text();after=(C/'unlock_gate.py').read_text()
 assert after.replace(constants['REDUCER_ASSESSOR_SHA'],'c58c1fad815686fcc8598840c6152da15987d0cc43f80e852105c384dc52a43c')==before
 for n in ('final_verifier.py','postclose.py','guard-exit.bash','policy.json'):assert (C/n).read_bytes()==(C.parent.parent/'resume2/control'/n).read_bytes()
 plan=read(E/'successor-plan.json');base=read(T/'early/fullcheck-harness/resume3/plan.json');cat=read(E/'successor-catalog.json');basecat=read(R/cat['ancestry']['basePath'])
 assert sha(E/'successor-plan.json')=='9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
 assert sha(E/'successor-catalog.json')=='d96334bc0559bad126a82d6f84bd91a0ca1442288c713c764588173cec2e04ba'
 overlay={x['file']:x for x in plan['ancestry']['overlay']};assert len(overlay)==3
 derived=[]
 for x in base['source']['files']:
  x=dict(x)
  if x['path'] in overlay:assert x['sha256']==overlay[x['path']]['originalSha256'];x['sha256']=overlay[x['path']]['formattedSuccessorSha256']
  derived.append(x)
 assert derived==plan['source']['files'] and hashlib.sha256(json.dumps(derived,separators=(',',':')).encode()).hexdigest()==c['sourceDigest']
 assert len(derived)==len(plan['sourceModes'])==1808 and sum(x['path'].startswith('backend/src/main/') for x in derived)==506
 assert plan['source']['dist']==base['source']['dist'] and len(plan['source']['dist']['files'])==238
 assert cat['expectedCaseIdentities']==basecat['expectedCaseIdentities'] and len(cat['expectedCaseIdentities'])==2774
 skips=read(R/plan['skipPath']);assert len(skips)==9 and collections.Counter((x['task'],x['class'],x['name']) for x in skips)==collections.Counter((x['task'],x['class'],x['name']) for x in cat['expectedCaseIdentities'] if x['expectedStatus']=='SKIP')
 core=read(E/'core-reuse.json');h=R/core['immutableCorePath'];assert sha(h)==core['immutableCoreSha256']
 ht=ast.parse(h.read_text())
 for name,pin in core['functions'].items():assert astsha(next(n for n in ht.body if isinstance(n,ast.FunctionDef) and n.name==name))==pin
 return {'compositionSha256':sha(B/'manifest.json'),'componentMembers':members,'installMappings':len(installs),'strictDiffReplays':diffs,'apiActualPinsExact':True,'controlOnlyReducerHashDelta':True,'reducerAstsExact':True,'sourceFilesDerivedFromImmutableAncestry':1808,'unchangedOtherSourceFiles':1805,'main506AndDist238MetadataLiteral':True,'catalogCases':2774,'approvedSkips':9,'coreFunctionAstsExact':len(core['functions']),'inactiveTemplateNotAuthority':True,'actualReleaseMustAddLockWrapperSha256':'2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df','actualRuntimeOrBodyOrOSAction':False}
if __name__=='__main__':print(json.dumps(main(),indent=2))
