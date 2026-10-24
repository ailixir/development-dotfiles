"""Fixed public-text composition only; no staging, formatter, source helper or native action."""
from pathlib import Path
from collections import Counter
import ast,re,json,hashlib,difflib,shutil
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
def write(n,x): (O/n).write_text(json.dumps(x,indent=2)+'\n')
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-composed-semantic-unit06-prep-context.json'
pins=read(context)['pins']
for x in pins: assert sha(R/x['path'])==x['sha256'],x['path']
S=T/'early/gs-t-draft/session-question-provenance-prototype';C=T/'early/gs-t-draft/unit05-cut-reference-semantic-port';P=T/'early/gs-t-draft/peer-relay-sql-source-audit'
for folder in [S,C,P]:
 for x in read(folder/'manifest.json')['files']: assert sha(folder/x['path'])==x['sha256'],x['path']
for p in [context,R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-composed-semantic-unit06-prep-intent.txt',R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-composed-semantic-unit06-prep-preflight.json',T/'qa/gst-question-preparation-extension-review/review.md']:
 pins.append({'path':str(p.relative_to(R)),'sha256':sha(p)})
assert sha(T/'qa/gst-question-preparation-extension-review/review.md')=='8ab650dbfe2edb1578355942ea3624b803dd90001d91b46f321a0b4e80af1aba'
relroot=Path('backend/src/test/java/com/citi/put/checks/studio/guided/session')
archive=T/'runtime/obs011-gst-provisional-05/formatted-candidate-archive'
original=T/'runtime/obs011-gst-provisional-06/source-original-backups'
sources=[S/'GuidedSessionIT.java',archive/'GuidedLifecycleReasonIT.java',C/'repo'/relroot/'GuidedServiceTransportFaultIT.java']
hashes=['ce86b2092fe89d79d0e993cca853fd2dfe1484f90a890796d57cc056ad6fe4d9','353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5','e35d078a682bbd4535f89d31d2aa56ac33ae73a0b4ec8f5bb2bceafdf2457a02']
helper=P/'verify.py';scope={'re':re};tree=ast.parse(helper.read_text());names={'masked','method_span','methods','assertions','apply_strict'};nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names];assert len(nodes)==5;exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure-source>','exec'),scope)
patches={n:[] for n in ['gs-t-draft.patch','restore-s011.patch','delta-from-unit05.patch','restore-unit05.patch']};rows=[];bodymap=[];assertmap=[];totals=Counter();additive=[]
operand=read(C/'setup-input-assertion-map.json')['assertionMap'];oldexpr=operand['oldFullExpression'];newexpr=operand['newFullExpression']
for src,expected in zip(sources,hashes):
 assert sha(src)==expected
 rel=relroot/src.name;dest=O/'repo'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest);dest.chmod(0o644)
 orig=original/rel;prior=archive/src.name
 assert sha(orig)==next(x['sha256'] for x in read(T/'runtime/obs011-gst-provisional-06/prepared-inputs-and-backups.json')['backups'] if x['source']==str(rel))
 texts=[orig.read_text(),prior.read_text(),dest.read_text()];a,b,c=texts
 for path in [src,orig,prior]:pins.append({'path':str(path.relative_to(R)),'sha256':sha(path)})
 ms=[scope['methods'](x) for x in texts];aa=[scope['assertions'](x) for x in texts]
 assert [(x['name'],x['annotation']) for x in ms[0]]==[(x['name'],x['annotation']) for x in ms[1]]==[(x['name'],x['annotation']) for x in ms[2]]
 for x,y,z in zip(*ms):
  bodymap.append({'file':str(rel),'name':x['name'],'annotation':x['annotation'],'originalS011Body':x['body'],'unit05Body':y['body'],'successorBody':z['body'],'unit05BodyExact':y['body']==z['body']})
 for kind,exprs in zip(['originalS011','unit05','successor'],aa):totals[kind]+=len(exprs)
 assert len(aa[1])==len(aa[2])
 for i,(x,y) in enumerate(zip(aa[1],aa[2])):
  assertmap.append({'file':str(rel),'ordinal1Based':i+1,'unit05Expression':x,'successorExpression':y,'disposition':'EXACT' if x==y else 'ONE_SOURCE_BOUND_EXPECTED_OPERAND_MAP'})
 oc,uc,nc=map(Counter,aa);assert not(oc-uc)
 mapped=oc.copy()
 if src.name=='GuidedServiceTransportFaultIT.java':assert mapped[oldexpr]==1;mapped[oldexpr]-=1;mapped[newexpr]+=1
 assert not(mapped-nc) and nc-mapped==uc-oc
 for expr,count in (uc-oc).items(): additive.append({'file':str(rel),'expression':expr,'count':count,'retainedCount':nc[expr]})
 row={'file':str(rel),'beforeSha256':sha(orig),'unit05Sha256':sha(prior),'afterSha256':sha(dest),'compileVerified':False,'runtimeVerified':False};rows.append(row)
 for n,l,r in [('gs-t-draft.patch',a,c),('restore-s011.patch',c,a),('delta-from-unit05.patch',b,c),('restore-unit05.patch',c,b)]:
  p=''.join(difflib.unified_diff(l.splitlines(True),r.splitlines(True),'a/'+str(rel),'b/'+str(rel)))
  if p:assert scope['apply_strict'](l,p)==r
  patches[n].append(p)
for n,p in patches.items():O.joinpath(n).write_text(''.join(p))
assert totals=={'originalS011':751,'unit05':813,'successor':813}
assert len(bodymap)==80 and sum(x['unit05BodyExact'] for x in bodymap)==79
assert [x['name'] for x in bodymap if not x['unit05BodyExact']]==['clarificationIsBoundToGenerationChoiceAndOriginalDeadline']
assert sum(x['disposition']=='EXACT' for x in assertmap)==812
assert sum(x['count'] for x in additive)==62
write('draft-manifest.json',[{k:v for k,v in x.items() if k!='unit05Sha256'} for x in rows]);write('candidate-bindings.json',rows)
write('full-body-map.json',bodymap);write('full-assertion-map.json',{'originalS011':[{ 'file':str(relroot/src.name),'expressions':scope['assertions']((original/relroot/src.name).read_text())} for src in sources],'unit05ToSuccessor':assertmap,'additive62':additive,'mappedOperand':operand})
carry=read(P/'preservation.json');assert len(carry['fullExpectedCases'])==99
write('preservation.json',{'status':'PROPOSED_ONLY_NOT_SOURCE_READY_NOT_RELEASED','methods':80,'exactOtherAnnotatedBodies':79,'originalAssertions':751,'exactOtherOriginalAssertions':750,'unit05Assertions':813,'exactOtherUnit05Assertions':812,'additiveChecksRetained':62,'oneMappedExpectation':True,'fullExpectedCases':carry['fullExpectedCases'],'modeVariants':carry['modeVariants'],'modeVariantsCount':9,'unchangedSentinelInvocations':11,'allOtherBusinessTimersAuthCleanupAuthorityExactFromSealedComponents':True,'noFOLDPorts':True,'compileOrNativeProof':False})
(O/'components').mkdir()
for prefix,root,names in [('session',S,['design.md','provenance-and-sequence.md','exact-replacements.json','preservation.json','receipt.json']),('transport',C,['setup-input-assertion-map.json','source-witness.json','preservation.json','receipt.json'])]:
 for n in names:
  d=O/'components'/(prefix+'-'+n);shutil.copyfile(root/n,d)
  pins.append({'path':str((root/n).relative_to(R)),'sha256':sha(root/n)})
pins.append({'path':str(helper.relative_to(R)),'sha256':sha(helper)})
write('inputs.json',{'taskPins':pins,'components':[str(x.relative_to(R)) for x in [S,C,P]],'sourceRows':rows,'originalRoot':str(original.relative_to(R)),'unit05ArchiveRoot':str(archive.relative_to(R)),'pureHelper':str(helper.relative_to(R)),'privateInputs':[],'noActualBaselineRecapture':True,'supplementalQuestionQaDesignOnlyNotPrototypeApproval':True})
