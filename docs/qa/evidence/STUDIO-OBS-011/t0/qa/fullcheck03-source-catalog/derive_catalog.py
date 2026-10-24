"""Independently derive source method/provider display identities; no native execution."""
from pathlib import Path
import re,json,collections,hashlib,itertools,csv,io
R=Path.cwd();Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-source-catalog';scan=json.loads((Q/'source-methods.json').read_text());ms=scan['methods'];pb=json.loads((Q/'methodsource-bodies.json').read_text());bodies={(r['path'],r['provider']):r['body'] for r in pb}
string=re.compile(r'"(?:\\.|[^"\\])*"');comment=re.compile(r'//[^\n]*|/\*[\s\S]*?\*/')
lex=re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S')
def tokens(s):return [(m[0],m.start(),m.end()) for m in lex.finditer(s) if not m[0].startswith(('//','/*'))]
def inside(s,marker):
 t=tokens(s);start=next(i for i,(x,a,_) in enumerate(t) if a>=s.index(marker)+len(marker) and x in ['(','{']);depth=1;j=start+1
 while depth:
  if t[j][0]==t[start][0]:depth+=1
  elif t[j][0]=={'(':')','{':'}'}[t[start][0]]:depth-=1
  j+=1
 return s[t[start][2]:t[j-1][1]]
def split(s):
 t=tokens(s);stack=[];parts=[];last=0
 for text,a,z in t:
  if text in ['(','{','[']:stack.append(text)
  elif text in [')','}',']']:assert stack.pop()=={')':'(',']':'[','}':'{'}[text]
  elif text==',' and not stack:parts.append(s[last:a].strip());last=z
 parts.append(s[last:].strip());return [p for p in parts if p]
def jstr(s):return json.loads(s)
def strings(s):return [jstr(m[0]) for m in string.finditer(s)]
def constants(s):
 return {n:''.join(strings(v)) for n,v in re.findall(r'\bString\s+(\w+)\s*=\s*((?:"(?:\\.|[^"\\])*"\s*\+?\s*)+)\s*;',s)}
def scalar(expr,const):
 expr=expr.strip()
 if expr in const:return const[expr]
 if expr=='null':return None
 if expr in ['false','true']:return expr
 if re.fullmatch(r'-?(?:0x[0-9a-fA-F]+|\d+)',expr):return str(int(expr,0)) if expr.startswith(('0x','-0x')) else str(int(expr))
 if string.fullmatch(expr):return jstr(expr)
 if expr.startswith('"') and '.repeat' not in expr:
  ss=split_plus(expr);return ''.join(scalar(p,const) for p in ss)
 if 'new String[]' in expr:return '['+', '.join(strings(inside(expr,'new String[]')))+']'
 return '<UNUSED_DYNAMIC_ARGUMENT>'
def split_plus(s):
 # This corpus only uses literal+constant concatenations in provider display args.
 return [m[0] for m in re.finditer(r'"(?:\\.|[^"\\])*"|[A-Z][A-Z0-9_]*',s)]
def stream_rows(body,const):
 args=split(inside(body,'Stream.of'))
 out=[]
 for arg in args:
  arg=arg[tokens(arg)[0][1]:]
  if arg.startswith('Arguments.of'):out.append([scalar(x,const) for x in split(inside(arg,'Arguments.of'))])
  else:
   # Mutation constructors/helpers take the name as their first argument.
   at=arg.index('(');out.append([scalar(split(inside(arg,arg[:at]))[0],const)])
 return out
# Source-backed shared vector registry selection.
pub=R/'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json';doc=json.loads(pub.read_text())
def vec(section,field,pred=lambda v:True):return [[section+':'+v['name']] for v in doc[section][field] if pred(v)]
def literal_set(body):return set(strings(inside(body,'Set.of')))
provider_rows={}
for (path,name),body in bodies.items():
 const=constants((R/path).read_text())
 if name=='internalBodies':rows=[['v3/replay-job']]
 elif name=='positives':rows=vec('snapshotCorrection','positives')+vec('graphTimingConformance','graphCases',lambda v:v['expected']=='ACCEPT')
 elif name in ['snapshotNegatives','candidateSnapshotNegatives']:
  names=literal_set(body);rows=vec('snapshotCorrection','negatives',lambda v:v['name'] in names);assert len(rows)==len(names)
 elif name=='admittedHistoryNegatives':
  names=literal_set(body);rows=vec('graphTimingConformance','graphCases',lambda v:v['name'] in names);assert len(rows)==len(names)
 elif name=='graphNegatives':
  excludes=['receipt-transport-authority-cannot-be-inferred-from-hash','raw-edge-cannot-name-pending-action']
  assert all(x in body for x in excludes);rows=vec('graphTimingConformance','graphCases',lambda v:v['expected']=='REJECT' and v['name'] not in excludes)
 elif name=='fullyResealedCandidateAttacks':
  names=literal_set(body);other=bodies[(path,'candidateSnapshotNegatives')];candidates=literal_set(other)
  rows=vec('snapshotCorrection','negatives',lambda v:v['name'] in candidates)+vec('graphTimingConformance','graphCases',lambda v:v['name'] in names);assert len(rows)==len(candidates)+len(names)
 elif name=='malformedIdentity':
  names=strings(inside((R/path).read_text(),'REQUEST_FIELDS ='));variants=strings(inside(body,'Stream.of'));rows=[list(v) for v in itertools.product(names,variants)];assert len(names)==19 and variants==['missing','null','wrong-type']
 elif name=='pairedChoiceMutations':continue
 else:rows=stream_rows(body,const)
 provider_rows[(path,name)]=rows
for (path,name),body in bodies.items():
 if name=='pairedChoiceMutations':
  names=set(strings(inside(body,'List.of')));source='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilderTest.java';rows=[r for r in provider_rows[(source,'brokenChoiceJoins')] if r[0] in names];assert len(rows)==len(names);provider_rows[(path,name)]=rows
# Build registry selection, never derive task identities from current output.
build=(R/'backend/build.gradle.kts').read_text()
def registry(name):return strings(inside(build,name+' ='))
inc=set(registry('joinedIncrementalMethods')+registry('joinedPrefixSyncMethods')+registry('joinedAddedLowMethods'));default=set(registry('joinedDefaultMethods'))
assert len(default)==46 and len(inc)==28 and not default.intersection(inc)
source_enums={}
for path in list((R/'backend/src/test/java').rglob('*.java'))+[R/'backend/src/main/java/com/citi/put/checks/studio/dispatch/DispatchState.java',R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelRequest.java']:
 s=path.read_text()
 for hit in re.finditer(r'\benum\s+(CallerFlush|DispatchState|Cut|Mode|Kind)\s*\{',comment.sub('',s)):
  body=comment.sub('',s)[hit.end():];values=body[:re.search('[;}]',body).start()];names=[v.strip() for v in values.split(',') if v.strip()]
  source_enums[(str(path.relative_to(R)),hit[1])]=names
rows=[];methods=[]
for m in ms:
 s=(R/m['path']).read_text();const=constants(s);ann={a['name']:a['text'] for a in m['annotations']};cls=m['class'];method=m['method'];task='crossReplicaTest' if cls.endswith('.SseCrossReplicaIT') else 'test'
 if cls.endswith('.GuidedPublicationReplayIT'):
  assert method in inc|default
  if method in inc:task='guidedIncrementalTest'
 if m['kind']=='Test':
  if 'DisplayName' in ann:display=scalar(inside(ann['DisplayName'],'DisplayName'),const)
  else:
   signature=inside(m['signature'],method);types=[]
   for parameter in split(signature):types.append(parameter.strip().rsplit(None,1)[0].rsplit('.',1)[-1])
   display=method+'('+', '.join(types)+')'
  names=[display];origin='plain Test annotation/signature or exact DisplayName constant'
 else:
  provider=next(k for k in ['ValueSource','EnumSource','MethodSource','CsvSource'] if k in ann)
  if provider=='ValueSource':
   arg=inside(ann[provider],'ValueSource');arg=arg[arg.index('=')+1:].strip();values=split(arg[1:-1]) if arg.startswith('{') else [arg];args=[[scalar(v,const)] for v in values]
   if 'NullAndEmptySource' in ann:args=[[None],['']]+args
  elif provider=='CsvSource':args=[next(csv.reader([v],skipinitialspace=True)) for v in strings(inside(ann[provider],'CsvSource'))]
  elif provider=='MethodSource':args=provider_rows[(m['path'],strings(ann[provider])[0])]
  else:
   text=ann['EnumSource'];enum=re.search(r'([\w.]+)\.class',text)[1].split('.')[-1]
   matches=[v for (p,n),v in source_enums.items() if n==enum and (p==m['path'] or (enum=='DispatchState' and p.endswith('/dispatch/DispatchState.java')) or (enum=='Kind' and p.endswith('/translation/GuidedModelRequest.java')))];assert len(matches)==1,(m['path'],enum,matches)
   values=matches[0]
   if 'names' in text:chosen=set(strings(text));values=[v for v in values if v in chosen];assert set(values)==chosen
   args=[[v] for v in values]
  template=ann['ParameterizedTest'];found=re.search(r'name\s*=\s*("(?:\\.|[^"\\])*")',template)
  param_names=[p.rsplit(None,1)[-1] for p in split(inside(m['signature'],method))]
  names=[]
  for i,arg in enumerate(args,1):
   def render(v):return 'null' if v is None else v
   if found:
    name=jstr(found[1])
    for j,value in enumerate(arg):name=name.replace('{'+str(j)+'}',render(value))
   else:name='['+str(i)+'] '+', '.join(n+'='+render(value) for n,value in zip(param_names,arg))
   assert '<UNUSED_DYNAMIC_ARGUMENT>' not in name,(method,name)
   names.append(name)
  origin=provider
 for name in names:rows.append({'task':task,'class':cls,'name':name})
 methods.append({'class':cls,'method':method,'kind':m['kind'],'task':task,'sourceLine':m['line'],'invocations':len(names),'origin':origin,'displayNamesSha256':hashlib.sha256(json.dumps(names,ensure_ascii=False).encode()).hexdigest()})
cat=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/fullcheck03-case-catalog-candidate/resume2/expected-catalog.json').read_text());key=lambda r:(r['task'],r['class'],r['name']);a=collections.Counter(map(key,rows));b=collections.Counter(map(key,cat['expectedCaseIdentities']));delta={'missingFromCandidate':list((a-b).elements()),'notDerivedFromSource':list((b-a).elements())}
(Q/'derived-method-coverage.json').write_text(json.dumps({'plainMethods':sum(m['kind']=='Test' for m in ms),'parameterizedMethods':sum(m['kind']=='ParameterizedTest' for m in ms),'derivedInvocations':len(rows),'taskCounts':dict(collections.Counter(r['task'] for r in rows)),'providerCounts':[{'path':p,'provider':n,'invocations':len(v)} for (p,n),v in provider_rows.items()],'methods':methods,'publicationFixtureSha256':hashlib.sha256(pub.read_bytes()).hexdigest(),'difference':delta},indent=2)+'\n')
print(json.dumps({'sourceMethods':len(ms),'derivedInvocations':len(rows),'taskCounts':dict(collections.Counter(r['task'] for r in rows)),'differenceCounts':{k:len(v) for k,v in delta.items()},'differences':delta},indent=2))
