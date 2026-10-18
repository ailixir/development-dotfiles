from pathlib import Path
import re,json,hashlib
p=Path('docs/qa/evidence/STUDIO-OBS-007/resume-r-c5-stream-candidate');b=(p/'before.java').read_text();a=(p/'after.java').read_text()
def block(text,marker):
 start=text.index(marker);j=text.index('{',start);depth=0;state='code'
 while j<len(text):
  if state=='code':
   if text.startswith('"""',j):state='text';j+=3;continue
   if text.startswith('//',j):state='line';j+=2;continue
   if text.startswith('/*',j):state='comment';j+=2;continue
   if text[j]=='"':state='string'
   elif text[j]=="'":state='char'
   elif text[j]=='{':depth+=1
   elif text[j]=='}':
    depth-=1
    if depth==0:return text[start:j+1]
  elif state=='text':
   if text.startswith('"""',j):state='code';j+=3;continue
  elif state=='line':
   if text[j]=='\n':state='code'
  elif state=='comment':
   if text.startswith('*/',j):state='code';j+=2;continue
  else:
   if text[j]=='\\':j+=2;continue
   if text[j]==('"' if state=='string' else "'"):state='code'
  j+=1
 raise ValueError('Unclosed source body')
names=re.findall(r'  @Test\n(?:  @[^\n]*\n)*  void (\w+)\(',b);assert len(names)==28
rows=[]
for name in names:
 old=block(b,'  void '+name+'(');new=block(a,'  void '+name+'(')
 if name=='syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls':
  assert new.replace((p/'support.txt').read_text(),'')==old
  status='ORIGINAL_BODY_BYTE_IDENTICAL_AFTER_REMOVING_APPROVED_SUPPORT_INSERTION'
 else:
  assert new==old,name;status='BYTE_IDENTICAL'
 rows.append({'method':name,'oldBodySha256':hashlib.sha256(old.encode()).hexdigest(),'status':status})
# Actual byte-variant construction order/body stays exact; only payload cause is removed.
oldfactory=b[b.index('    var variants = new java.util.ArrayList<byte[]>();',b.index('  private static void assertJoinedSinkAbsent')):b.index('    for (var sink : sinks.entrySet()) {',b.index('  private static void assertJoinedSinkAbsent'))]
newfactory=a[a.index('    var variants = new java.util.ArrayList<byte[]>();',a.index('  private static List<byte[]> canaryByteVariants')):a.index('    return variants;',a.index('  private static List<byte[]> canaryByteVariants'))]
assert newfactory==oldfactory.replace('throw new IllegalStateException("Synthetic sink JSON encoding unavailable", failure);','throw new IllegalStateException("Synthetic sink JSON encoding unavailable");')
oldloop=block(b,'  private static void assertJoinedSinkAbsent');newloop=block(a,'  private static void assertJoinedSinkAbsent');start=oldloop.index('    for (var sink : sinks.entrySet()) {');assert oldloop[start:]==newloop[newloop.index('    for (var sink : sinks.entrySet()) {'):]
protected=[]
for marker in ['  private static boolean containsBytes','  private void p7CapturedFaultAndRetry','  private void p7FaultAndRetry','  private static final class C5ClaimSampler','  private static final class C5Stream','    void armTrace()','    void writeProfileValues()']:
 old=block(b,marker);assert old==block(a,marker),marker;protected.append({'marker':marker.strip(),'sha256':hashlib.sha256(old.encode()).hexdigest()})
assert a[:a.index('class GuidedPublicationReplayIT')]==b[:b.index('class GuidedPublicationReplayIT')]
assert len(re.findall(r'  @Test\n(?:  @[^\n]*\n)*  void (\w+)\(',a))==28
r={'scope':'SOURCE_BYTE_PROOF_NOT_COMPILE_OR_RUNTIME','testCount':28,'other27BodiesByteIdentical':True,'supportOriginalBodyInsertionOnly':True,'cases':rows,'exact15EncoderConstruction':True,'mapMatcherLoopByteIdentical':True,'encoderExceptionCauseRemovedForPrivacy':True,'protectedBlocks':protected,'classAnnotationsImportsByteIdentical':True}
(p/'body-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['cases','protectedBlocks']}))
