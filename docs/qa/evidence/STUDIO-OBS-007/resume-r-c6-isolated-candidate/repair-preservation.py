from pathlib import Path
import json,hashlib,re
p=Path('docs/qa/evidence/STUDIO-OBS-007/resume-r-c6-isolated-candidate')
a=(p/'GuidedPublicationReplayIT.java').read_text();b=(p/'before.java').read_text()
def block(text,marker):
 start=text.index(marker);j=text.index('{',start);depth=0;state='code'
 while j<len(text):
  if state=='code':
   if text.startswith('"""',j):state='text';j+=3;continue
   if text.startswith('//',j):state='line';j+=2;continue
   if text.startswith('/*',j):state='block';j+=2;continue
   if text[j]=='"':state='str'
   elif text[j]=="'":state='char'
   elif text[j]=='{':depth+=1
   elif text[j]=='}':
    depth-=1
    if depth==0:return text[start:j+1]
  elif state=='text':
   if text.startswith('"""',j):state='code';j+=3;continue
  elif state=='line':
   if text[j]=='\n':state='code'
  elif state=='block':
   if text.startswith('*/',j):state='code';j+=2;continue
  else:
   if text[j]=='\\':j+=2;continue
   if text[j]==('"' if state=='str' else "'"):state='code'
  j+=1
 raise ValueError('Closed source body unavailable')
m=json.loads((p/'manifest.json').read_text())
for row in m['originalTests']:
 marker='  void '+row['method']+'('
 assert block(a,marker)==block(b,marker),row['method']
 assert hashlib.sha256(block(a,marker).encode()).hexdigest()==row['bodySha256']
protected=json.loads((p/'repair-before/protected-source-proof.json').read_text())
for row in protected['blocks']:
 marker='  '+row['declaration'];assert block(a,marker)==block(b,marker),marker
 assert hashlib.sha256(block(a,marker).encode()).hexdigest()==row['sha256']
new=re.findall(r'  @Test\n(?:  @[^\n]*\n)*  void (\w+)\(',a)
assert len(new)==32
m['repairPreservation']={'scope':'BYTE_SOURCE_ONLY_NOT_TYPE_OR_RUNTIME','allOriginalBodiesByteIdentical':28,'allOldProtectedBlocksByteIdentical':len(protected['blocks']),'totalCases':32,'newCases':4}
(p/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
protected['candidateSha256']=m['afterSha256'];protected['repairBeforeSha256']=m['repairBeforeSha256']
(p/'protected-source-proof.json').write_text(json.dumps(protected,indent=2)+'\n')
print(json.dumps(m['repairPreservation']))
