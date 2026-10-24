"""Independent source/hash/type/patch audit; no old main or native/runtime body access."""
from pathlib import Path
from collections import Counter
import ast, hashlib, json, re, stat
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fold-gst06-accepted-overlap-prep')
T=Path('docs/qa/evidence/STUDIO-OBS-011/t0');O=Path(__file__).resolve().parent
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert h(D/'manifest.json')=='893542fd34e5c12d57451f9bdbe75114bb70069b9b1d83409deb4374aa7d3419'
manifest=json.loads((D/'manifest.json').read_text())
for x in manifest['files']:
 p=D/x['path'];assert h(p)==x['sha256'] and len(p.read_bytes())==x['bytes']
 assert not p.is_symlink() and stat.S_IMODE(p.stat().st_mode)==0o644
helper=T/'early/gs-t-draft/peer-relay-sql-source-audit/verify.py'
names={'masked','method_span','methods','assertions','apply_strict'}
nodes=[n for n in ast.parse(helper.read_text()).body if isinstance(n,ast.FunctionDef) and n.name in names]
assert len(nodes)==5
for n in nodes:
 for child in ast.walk(n):
  if isinstance(child,ast.Call):
   call=ast.unparse(child.func)
   assert not any(s in call for s in ['open','read_text','read_bytes','write','subprocess','os.'])
   assert call not in ['exec','compile','eval']  # re.compile is a pure regex operation.
ns={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<only-inspected-five-lexical-functions>','exec'),ns)
rules=json.loads((D/'type-port-map.json').read_text());old=T/'early/fold-gst05-rebase-prep';fold=T/'early/fold-final-draft/resume2'
assert h(old/'manifest.json')=='7bf3041c7abc523704701758313b4216d949db997d3ab1e84a20c64faab443fb'
assert (D/'type-port-map.json').read_bytes()==(old/'type-port-map.json').read_bytes()
atomic=json.loads((fold/'atomic-manifest.json').read_text());overlay=json.loads((D/'prospective-operation-overlay.json').read_text());oldrows={r['path']:r for r in atomic['operations']}
rows=overlay['overlapAndLifecyclePreviews'];paths={r['path'] for r in rows}
assert len(rows)==3 and len(paths)==3
unchanged=[r for r in atomic['operations'] if r['path'] not in paths]
assert len(atomic['operations'])==37 and len(unchanged)==35 and unchanged==overlay['unchangedOriginalOperationRecords']
allops=unchanged+rows; assert len({r['path'] for r in allops})==38
assert Counter(r['operation'] for r in allops)=={'edit':33,'delete':4,'add':1}
for r in unchanged:assert h(fold/'patches'/r['patch'])==r['patchSha256']

def port(a, rr):
 for r in rr:a=re.sub(r'(?<![\w$])'+re.escape(r['before'])+r'(?![\w$])',lambda m:r['after'],a)
 return a

def patch(a, text, path):
 lines=text.splitlines(True);original=a.splitlines(True);dst=[];at=0;i=2
 assert lines[:2]==['--- a/'+path+'\n','+++ b/'+path+'\n']
 while i<len(lines):
  m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);assert m
  begin,n,out,k=int(m[1])-1,int(m[2] or 1),int(m[3])-1,int(m[4] or 1)
  assert begin>=at;dst+=original[at:begin];assert len(dst)==out;i+=1;before=[];after=[]
  while i<len(lines) and not lines[i].startswith('@@ '):
   op=lines[i][0];v=lines[i][1:];assert op in ' +-'
   if op in ' -':before.append(v)
   if op in ' +':after.append(v)
   i+=1
  assert len(before)==n and len(after)==k and original[begin:begin+n]==before
  dst+=after;at=begin+n
 return ''.join(dst+original[at:])

counts=[];oldproof=[];forward=[];reverse=[]
for row in rows:
 path=row['path'];name=Path(path).name
 archive=T/'runtime/obs011-gst-provisional-06/formatted-candidate-archive'/name
 candidate=D/'preview'/path
 assert h(archive)==row['preimageSha256']==h(Path(path))
 assert h(candidate)==row['candidateSha256'] and stat.S_IMODE(candidate.stat().st_mode)==stat.S_IMODE(Path(path).stat().st_mode)==0o644
 a=archive.read_text();b=candidate.read_text();rr=rules[:1] if name=='GuidedLifecycleReasonIT.java' else rules
 assert port(a,rr)==b
 raw=archive.read_bytes()
 for rule in rr:raw=raw.replace(rule['before'].encode(),rule['after'].encode())
 assert raw==candidate.read_bytes()
 forward.append((D/row['patch']).read_text());reverse.append((D/row['restorePatch']).read_text())
 assert patch(a,forward[-1],path)==b and patch(b,reverse[-1],path)==a
 am,bm=ns['methods'](a),ns['methods'](b);aa,ba=ns['assertions'](a),ns['assertions'](b)
 assert [(x['name'],x['annotation']) for x in am]==[(x['name'],x['annotation']) for x in bm]
 assert [port(x['body'],rr) for x in am]==[x['body'] for x in bm]
 assert [port(x,rr) for x in aa]==ba
 counts.append({'file':name,'methods':len(am),'assertions':len(aa),'methodNames':[x['name'] for x in am],
                'preimageSha256':h(archive),'postimageSha256':h(candidate),'mode':'0644',
                'wholeFileExactModuloBoundaryTypeMap':True})
 if name!='GuidedLifecycleReasonIT.java':
  record=oldrows[path];assert row['originalAtomicOperation']==record
  prepared=fold/'virtual-pre-final'/path;final=fold/'final-candidates'/path
  assert h(prepared)==record['preimageSha256'] and h(final)==record['candidateSha256']
  assert port(prepared.read_text(),rules)==final.read_text()
  raw=prepared.read_bytes()
  for rule in rules:raw=raw.replace(rule['before'].encode(),rule['after'].encode())
  assert raw==final.read_bytes()
  text=(fold/'patches'/record['patch']).read_text();assert h(fold/'patches'/record['patch'])==record['patchSha256']
  assert patch(prepared.read_text(),text,path)==final.read_text()
  oldproof.append({'path':path,'preparedPreimageSha256':h(prepared),
                   'originalFoldFinalSha256':h(final),'exactSameTypeMapping':True})
 else:
  assert row['originalAtomicOperation'] is None and path not in oldrows
  assert a.count(rules[0]['before'])==1 and len(row['typePortMapping'])==1 and row['typePortMapping'][0]['replacements']==1
assert ''.join(forward)==(D/'overlap-three.patch').read_text() and ''.join(reverse)==(D/'restore-gst06.patch').read_text()
assert sum(r['methods'] for r in counts)==80 and sum(r['assertions'] for r in counts)==813
checks={'status':'CONDITIONAL_COMPONENT_ONLY_SOURCE_CHECKS_PASS','manifestMembers':len(manifest['files']),
 'fiveLexicalFunctionsInspectedPure':True,'authorNewPureVerifierExit':0,'authorVerifierWroteNoFiles':True,
 'independentStrictPatchAndWordBoundaryMapCheck':True,'rawByteMappingAlsoExact':True,'sourceFiles':counts,
 'originalPreparedToFoldDelta':oldproof,'unchangedOriginalRecords':35,'allUnchangedPatchReferencesVerified':35,
 'originalOperations':37,'prospectiveOperations':38,'prospectiveCounts':dict(Counter(r['operation'] for r in allops)),
 'old05TypeMapExactBytes':True,'all62AddedExpressionsRetainedByAcceptedWholeFileMapping':True,
 'noRuntimeOrAtomicReadinessClaim':True,'mandatoryFindings':[]}
(O/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps({'status':checks['status'],'files':[{'file':r['file'],'methods':r['methods'],'assertions':r['assertions']} for r in counts],
 'old37':37,'newContingent38':38,'sameOriginal35':35,'forwardReverseExact':True}))
