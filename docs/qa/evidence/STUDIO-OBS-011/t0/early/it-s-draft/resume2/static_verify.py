from pathlib import Path
import re,json,hashlib,csv,difflib
O=Path(__file__).resolve().parent
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def mask(s):
 return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)
def methods(s):
 m=mask(s);out=[]
 pat=r'(?m)^[ \t]*(?:(?:private|protected|public|static|final|synchronized|abstract|default)\s+)*(?:[\w.$<>?,\[\]]+\s+)+(?P<name>[A-Za-z_$][\w$]*)\s*\((?P<params>[^{};]*?)\)\s*(?:throws\s+[\w., \n]+)?\s*\{'
 for x in re.finditer(pat,m):
  if x['name'] in ['if','for','while','catch','switch']:continue
  a=m.index('{',x.start());d=1;b=a+1
  while d:
   if m[b]=='{':d+=1
   elif m[b]=='}':d-=1
   b+=1
  out.append(dict(name=x['name'],signature=' '.join(m[x.start():a].split()),start=x.start(),bodyStart=a,end=b,bodySha256=sha(s[a:b]),line=s.count('\n',0,x.start())+1))
 return out

def assertions(s):
 m=mask(s);out=[]
 for x in re.finditer(r'\b(?:assertThat\w*|assertThrows|assertEquals|assertTrue|assertFalse|assertNotNull|assertNull|fail)\s*\(',m):
  # Statement can include lambda assertions; preserve the complete chained expression.
  i=x.start();d=0
  while i<len(m):
   if m[i] in '({[':d+=1
   elif m[i] in ')}]':d-=1
   if d<0 or (m[i]==';' and d==0):break
   i+=1
  out.append(re.sub(r'\s+','',s[x.start():i+1]))
 return out

def apply_patch(text,patch):
 lines=text.splitlines(True);out=[];cursor=0;parts=patch.splitlines(True);i=0
 while i<len(parts):
  h=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',parts[i])
  if not h:i+=1;continue
  start=int(h[1])-1;out.extend(lines[cursor:start]);cursor=start;i+=1
  while i<len(parts) and not parts[i].startswith(('@@ ','--- ','diff ')):
   line=parts[i]
   if line.startswith(' '):assert lines[cursor]==line[1:];out.append(line[1:]);cursor+=1
   elif line.startswith('-'):assert lines[cursor]==line[1:];cursor+=1
   elif line.startswith('+'):out.append(line[1:])
   elif line.startswith('\\'):pass
   else:break
   i+=1
 out.extend(lines[cursor:]);return ''.join(out)

manifest=json.loads((O/'manifest.json').read_text());cases=[];sleep_rows=[];summaries=[]
# All deliberate delays are named, not inferred from the interval magnitude alone.
reasons={
 ('GuidedServiceTransportFaultIT',3878):'300ms no-warning observation window after two teardown redrive sweeps; exact negative warning oracle retained',
 ('GuidedServiceTransportFaultIT',3974):'300ms concurrency exclusion window while actual teardown is blocked; duplicate-send/inFlight oracle retained',
 ('GuidedServiceTransportFaultIT',3984):'300ms no-duplicate-send window after confirmed teardown and another sweep',
 ('GuidedServiceTransportFaultIT',4010):'300ms negative legacy PENDING-without-request redrive window',
 ('GuidedServiceTransportFaultIT',4076):'300ms idempotent publication-conflict callback/no-second-stop window',
 ('GuidedServiceTransportFaultIT',4106):'300ms terminal CANCELLED/conflict refusal no-extra-stop window',
 ('GuidedServiceTransportFaultIT',4191):'300ms missing-stop-identity expiry no-send observation window',
 ('GuidedServiceTransportFaultIT',5435):'20ms partial HTTP-body streaming cadence until client disconnect; intentionally produces an unterminated transport response, not readiness polling',
 ('GuidedPublicationRaceTest',457):'1100ms intentional publication-grant expiry while actual PostgreSQL lock is held; grant was issued with1000ms deadline',
 ('GuidedFocusMutationJoinedIT',253):'slowNavigationMillis intentional HTTP navigation latency stimulus; exact interruption handler retained',
}
# Census correction: Transport has8 deliberate and6 poll, yielding10 deliberate/12 poll total.
for row in manifest:
 p=Path(row['path']);name=p.stem;actual=p.read_text();before=(O/'preimages'/p).read_text();after=(O/'repo'/p).read_text()
 assert sha(actual)==row['actualS011Sha256'];assert sha(before)==row['preimageSha256'];assert sha(after)==row['candidateSha256']
 inc=(O/'patches'/f'{name}.incremental.patch').read_text();full=(O/'patches'/f'{name}.from-s011.patch').read_text()
 assert apply_patch(before,inc)==after;assert apply_patch(actual,full)==after
 bm=methods(before);am=methods(after)
 existing=[x for x in am if x['name']!='step'];assert [x['signature'] for x in bm]==[x['signature'] for x in existing],name
 before_anns=re.findall(r'(?m)^\s*@(?:[\w$]+\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|EnumSource|MethodSource|ValueSource|CsvSource|Order)\b[^\n]*',before)
 after_anns=re.findall(r'(?m)^\s*@(?:[\w$]+\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|EnumSource|MethodSource|ValueSource|CsvSource|Order)\b[^\n]*',after)
 assert before_anns==after_anns,name
 ba=assertions(before);aa=assertions(after)
 norm=lambda s:s.replace('assertThat(itsPoll.waited)','assertThat(waited)').replace('assertThat(itsPoll.waiting)','assertThat(waiting)')
 assert ba==[norm(s) for s in aa],name
 added=[x for x in am if x['name']=='step'];oldsleeps=list(re.finditer(r'\.sleep\([^;]+\);',actual));newsleeps=list(re.finditer(r'\.sleep\([^;]+\);',after));retained=[]
 for x in oldsleeps:
  line=actual.count('\n',0,x.start())+1;kind='DELIBERATE' if (name,line) in reasons else 'POLL'
  owner=[m for m in methods(actual) if m['bodyStart']<x.start()<m['end']];owner=min(owner,key=lambda x:x['end']-x['start'])['name'] if owner else 'anonymous handler'
  if kind=='DELIBERATE':retained.append(x[0])
  sleep_rows.append(dict(file=str(p),originalLine=line,method=owner,expression=x[0],classification=kind,reason=reasons.get((name,line),'condition-driven observation; exact loop/body/deadline and failure mapping in loop-edits.json'),retainedByteExact=kind=='DELIBERATE'))
 assert retained==[x[0] for x in newsleeps],name
 assert [x[0] for x in oldsleeps]==re.findall(r'\.sleep\([^;]+\);',before),name
 changed=[];testmethods=[];testheaders=[]
 for b,a in zip(bm,existing):
  same=b['bodySha256']==a['bodySha256'];changed.append(dict(name=b['name'],signature=b['signature'],beforeBodySha256=b['bodySha256'],afterBodySha256=a['bodySha256'],bodyUnchanged=same))
  previous_end=max([x['end'] for x in bm if x['end']<=b['start']]+[0])
  header=before[previous_end:b['bodyStart']]
  nested=any(x['bodyStart']<b['start']<x['end'] for x in bm)
  if not nested and re.search(r'@(?:[\w$]+\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b',header):
   testmethods.append(b['name']);testheaders.append(dict(method=b['name'],header=header))
 assert len(testmethods)==len(re.findall(r'(?m)^\s*@(?:[\w$]+\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b',before)),(name,testmethods)
 cases.append(dict(path=str(p),fqcn=re.search(r'package\s+([^;]+);',before)[1]+'.'+name,allOriginalMethods=changed,namedTestMethods=testmethods,testHeaders=testheaders,testAnnotationCount=len(re.findall(r'(?m)^\s*@(?:[\w$]+\.)*(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b',before)),namedDrops=[],namedAdditions=[],parameterSourcesUnchanged=True,addedLocalStepMethods=len(added),assertionExpressionsBefore=len(ba),assertionExpressionsAfter=len(aa),assertionDelta='only waited/waiting locals become identical same-thread local state fields in Secret/Race; zero assertion removal',foldBaton=name in ['GuidedServiceTransportFaultIT','GuidedPlanningIntegrationTest','GuidedFocusMutationJoinedIT','GuidedEvidencePendingAppendJoinedIT']))
 summaries.append(dict(file=name,sleepsBefore=len(oldsleeps),pollConverted=len(added),deliberateRetained=len(newsleeps),sleepsAfter=len(newsleeps),originalMethods=len(bm),originalMethodSignaturesPreserved=True,compileVerified=False,runtimeVerified=False))
# GS-T composition must reconstruct via both paths, preserving reviewed preimage unchanged.
t=manifest[0];p=Path(t['path']);gs=(O.parents[1]/'gs-t-draft/repo'/p).read_text();assert sha(gs)==t['preimageSha256']
gspatch=(O.parents[1]/'gs-t-draft/gs-t-draft.patch').read_text();start=gspatch.index('--- a/'+str(p));sub=gspatch[start:];stop=sub.find('\n--- a/');sub=sub if stop<0 else sub[:stop+1]
assert apply_patch(p.read_text(),sub)==gs
(O/'case-preservation.json').write_text(json.dumps(cases,indent=2)+'\n')
(O/'sleep-table.json').write_text(json.dumps(sleep_rows,indent=2)+'\n')
with (O/'sleep-table.tsv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(sleep_rows[0]),delimiter='\t');w.writeheader();w.writerows(sleep_rows)
result=dict(staticVerified=True,compileVerified=False,runtimeVerified=False,files=summaries,totalSleepsBefore=sum(x['sleepsBefore'] for x in summaries),totalPollConverted=sum(x['pollConverted'] for x in summaries),totalDeliberateRetained=sum(x['deliberateRetained'] for x in summaries),originalMethodAndCaseNamesPreserved=True,sourceOriginalsUnchanged=True,transportGsTComposed=True,transportGsTSha256=sha(gs),transportActualToGsTToItsEqualsActualToIts=True,incrementalPatchSha256=sha((O/'it-s-incremental.patch').read_text()),composedPatchSha256=sha((O/'it-s-from-s011.patch').read_text()))
(O/'static-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
