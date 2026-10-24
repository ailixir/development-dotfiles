"""Independent lexical test-source scanner; read-only source, no Java/compiler/author tool imports."""
from pathlib import Path
import re,json,collections,hashlib
R=Path.cwd();Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-source-catalog'
lex=re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S')
allrows=[];allclasses=[];files=[]
for path in sorted((R/'backend/src/test/java').rglob('*.java')):
 s=path.read_text(); ts=[(m[0],m.start(),m.end()) for m in lex.finditer(s) if not m[0].startswith(('//','/*'))]; v=[t[0] for t in ts]
 matches={};stack=[]
 for i,x in enumerate(v):
  if x in '({[':stack.append((x,i))
  elif x in ')}]':
   assert stack and stack[-1][0]=={')':'(',']':'[','}':'{'}[x],(path,x)
   _,a=stack.pop();matches[a]=i
 assert not stack,path
 pkg=re.search(r'(?m)^package\s+([\w.]+)\s*;',s)[1]
 classes=[]
 for i,x in enumerate(v[:-1]):
  if x in ['class','enum','record','interface'] and (i==0 or v[i-1]!='.') and re.fullmatch(r'[A-Za-z_$][\w$]*',v[i+1]):
   op=next((j for j in range(i+2,len(v)) if v[j] in ['{',';']),None)
   if op is not None and v[op]=='{':classes.append({'name':v[i+1],'begin':i,'open':op,'end':matches[op],'declaration':s[ts[i][1]:ts[op][1]]})
 for c in classes:
  parents=sorted([p for p in classes if p['open']<c['begin']<p['end']],key=lambda p:p['begin'])
  c['binaryName']=pkg+'.'+'$'.join([p['name'] for p in parents]+[c['name']]);c['path']=str(path.relative_to(R));allclasses.append(c)
 def annotation(i):
  assert v[i]=='@';j=i+1
  while j+1<len(v) and v[j+1]=='.':j+=2
  name=v[j];j+=1
  if v[j]=='(':j=matches[j]+1
  return name,j,s[ts[i][1]:ts[j-1][2]]
 seen=set()
 for i,x in enumerate(v):
  if x!='@' or i in seen:continue
  name,j,annotation_text=annotation(i)
  if name not in ['Test','ParameterizedTest','RepeatedTest','TestFactory','TestTemplate']:continue
  # Include preceding annotation block from the previous declaration boundary.
  a=i-1
  while a>=0 and v[a] not in [';','{','}']:a-=1
  annotations=[];k=a+1
  while k<j:
   if v[k]=='@':n,e,text=annotation(k);annotations.append({'name':n,'text':text});k=e
   else:k+=1
  while v[j]=='@':n,e,text=annotation(j);annotations.append({'name':n,'text':text});seen.add(j);j=e
  # First unannotated opening parenthesis names the declared test method.
  while v[j]!='(':j+=1
  method=v[j-1];end=matches[j];body=next(k for k in range(end+1,len(v)) if v[k] in ['{',';'])
  owners=sorted([c for c in classes if c['open']<i<c['end']],key=lambda c:c['begin']);assert owners,(path,method)
  owner=owners[-1]['binaryName']
  allrows.append({'path':str(path.relative_to(R)),'class':owner,'method':method,'kind':name,'line':s.count('\n',0,ts[i][1])+1,'signature':s[ts[j-1][1]:ts[body][1]],'annotations':annotations,'bodySha256':hashlib.sha256(s[ts[body][1]:ts[matches[body]][2]].encode()).hexdigest() if v[body]=='{' else None})
 files.append({'path':str(path.relative_to(R)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(Q/'source-methods.json').write_text(json.dumps({'files':files,'classes':allclasses,'methods':allrows},indent=2)+'\n')
print(json.dumps({'javaFiles':len(files),'annotatedMethods':len(allrows),'kinds':dict(collections.Counter(r['kind'] for r in allrows)),'methodSources':[r for r in allrows if any(a['name']=='MethodSource' for a in r['annotations'])]},indent=2))
