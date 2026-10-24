"""Pure fixed public source/hash/splice verification. Never invokes any phase/helper/native main."""
from pathlib import Path
from collections import Counter
import ast,re,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
 i=read(O/'inputs.json')
 for x in i['taskPins']:assert sha(R/x['path'])==x['sha256'],x['path']
 for folder in i['components']:
  for row in read(R/folder/'manifest.json')['files']:assert sha(R/folder/row['path'])==row['sha256']
 tree=ast.parse((R/i['pureHelper']).read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'masked','method_span','methods','assertions','apply_strict'}];assert len(nodes)==5
 scope={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure-source-functions>','exec'),scope)
 rows=read(O/'candidate-bindings.json');assert rows==i['sourceRows'] and len(rows)==3
 assert [r['afterSha256'] for r in rows]==['ce86b2092fe89d79d0e993cca853fd2dfe1484f90a890796d57cc056ad6fe4d9','353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5','e35d078a682bbd4535f89d31d2aa56ac33ae73a0b4ec8f5bb2bceafdf2457a02']
 expectedBodies=[];expectedAssertions=[];originals=[];additive=[];totals=Counter()
 m=read(O/'full-assertion-map.json');oldexpr=m['mappedOperand']['oldFullExpression'];newexpr=m['mappedOperand']['newFullExpression']
 texts={}
 for r in rows:
  rel=r['file'];paths=[R/i['originalRoot']/rel,R/i['unit05ArchiveRoot']/Path(rel).name,O/'repo'/rel]
  assert [sha(p) for p in paths]==[r['beforeSha256'],r['unit05Sha256'],r['afterSha256']]
  a,b,c=[p.read_text() for p in paths];texts[rel]=(a,b,c)
  ms=[scope['methods'](x) for x in [a,b,c]];aa=[scope['assertions'](x) for x in [a,b,c]]
  assert [(x['name'],x['annotation']) for x in ms[0]]==[(x['name'],x['annotation']) for x in ms[1]]==[(x['name'],x['annotation']) for x in ms[2]]
  for x,y,z in zip(*ms):expectedBodies.append({'file':rel,'name':x['name'],'annotation':x['annotation'],'originalS011Body':x['body'],'unit05Body':y['body'],'successorBody':z['body'],'unit05BodyExact':y['body']==z['body']})
  originals.append({'file':rel,'expressions':aa[0]})
  assert len(aa[1])==len(aa[2])
  for k,expr in zip(['originalS011','unit05','successor'],aa):totals[k]+=len(expr)
  for n,(x,y) in enumerate(zip(aa[1],aa[2])):expectedAssertions.append({'file':rel,'ordinal1Based':n+1,'unit05Expression':x,'successorExpression':y,'disposition':'EXACT' if x==y else 'ONE_SOURCE_BOUND_EXPECTED_OPERAND_MAP'})
  oc,uc,nc=map(Counter,aa);assert not(oc-uc);mapped=oc.copy()
  if Path(rel).name=='GuidedServiceTransportFaultIT.java':assert mapped[oldexpr]==1;mapped[oldexpr]-=1;mapped[newexpr]+=1
  assert not(mapped-nc) and nc-mapped==uc-oc
  for expr,count in (uc-oc).items():additive.append({'file':rel,'expression':expr,'count':count,'retainedCount':nc[expr]})
 assert read(O/'full-body-map.json')==expectedBodies
 assert m['originalS011']==originals and m['unit05ToSuccessor']==expectedAssertions and m['additive62']==additive
 assert totals=={'originalS011':751,'unit05':813,'successor':813}
 assert len(expectedBodies)==80 and sum(x['unit05BodyExact'] for x in expectedBodies)==79
 assert [x['name'] for x in expectedBodies if not x['unit05BodyExact']]==['clarificationIsBoundToGenerationChoiceAndOriginalDeadline']
 assert sum(x['disposition']=='EXACT' for x in expectedAssertions)==812
 diff=[x for x in expectedAssertions if x['disposition']!='EXACT'];assert len(diff)==1
 assert diff[0]['unit05Expression']==oldexpr and diff[0]['successorExpression']==newexpr
 assert sum(x['count'] for x in additive)==62
 for filename,left,right in [('gs-t-draft.patch',0,2),('restore-s011.patch',2,0),('delta-from-unit05.patch',1,2),('restore-unit05.patch',2,1)]:
  chunks=re.split(r'(?=^--- a/)',(O/filename).read_text(),flags=re.M);seen=set()
  for p in filter(None,chunks):
   rel=p.splitlines()[0][6:];assert rel in texts and rel not in seen;seen.add(rel)
   assert scope['apply_strict'](texts[rel][left],p)==texts[rel][right]
  assert seen=={rel for rel,t in texts.items() if t[left]!=t[right]}
 p=read(O/'preservation.json');assert len(p['fullExpectedCases'])==99 and p['modeVariantsCount']==9 and p['unchangedSentinelInvocations']==11
 assert len(p['modeVariants'])==9
 assert sum(x['class'].rsplit('.',1)[-1] not in {Path(r['file']).stem for r in rows} for x in p['fullExpectedCases'])==11
 mode=re.search(r'  enum Mode \{([\s\S]*?)\n  \}',texts[rows[2]['file']][2]).group(1)
 assert re.findall(r'^\s*(\w+)\s*[,;]?\s*$',mode,re.M)==p['modeVariants']
 assert read(O/'draft-manifest.json')==[{k:v for k,v in r.items() if k!='unit05Sha256'} for r in rows]
 assert len(list((O/'repo').rglob('*.java')))==3
 if (O/'manifest.json').exists():
  for x in read(O/'manifest.json')['files']:assert sha(O/x['path'])==x['sha256']
 print(json.dumps({'status':'STATIC_SOURCE_COMPOSITION_PASS_NO_RELEASE','methods':80,'annotatedBodiesByteExact':79,'originalAssertions':751,'originalExactPlusMapped':[750,1],'unit05Assertions':813,'unit05ExactPlusMapped':[812,1],'allAdditiveRetained':62,'cases':99,'modes':9,'sentinels':11,'byteExactSealedCandidates':True,'strictOriginalAnd05PatchReversals':True,'actualExecution':False}))
if __name__=='__main__':main()
