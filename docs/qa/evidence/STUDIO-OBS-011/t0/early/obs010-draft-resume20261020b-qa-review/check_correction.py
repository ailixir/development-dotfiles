"""Bounded source-only correction check; does not apply patches or run packet/product code."""
from pathlib import Path
import json,hashlib,re,difflib
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early';O=B/'obs010-draft-resume20261020';N=B/'obs010-draft-resume20261020b';W=B/'obs010-draft-resume20261020b-qa-review'
def h(b):return hashlib.sha256(b).hexdigest()
def js(p):return json.loads(p.read_text())
result={'scope':'affected documentary/in-memory checks only; unaffected substantive source review reused','errors':[]}
def ck(ok,msg):
 if not ok:result['errors'].append(msg)
def seal(p,mh,ch):
 ck(h((p/'manifest.json').read_bytes())==mh,str(p)+' manifest pin');ck(h((p/'SHA256SUMS').read_bytes())==ch,str(p)+' checksum pin')
 rows=[]
 for line in (p/'SHA256SUMS').read_text().splitlines():
  digest,name=line.split('  ',1);rows.append(name);ck(h((p/name).read_bytes())==digest,'payload checksum '+str(p/name))
 ck(len(rows)==len(set(rows)),'duplicate checksum');ck(set(rows)=={str(x.relative_to(p)) for x in p.rglob('*') if x.is_file()}-{'SHA256SUMS'},'exact inventory '+str(p))
 return len(rows)
m=js(N/'manifest.json');oldm=js(O/'manifest.json');d=js(N/'correction-delta.json')
result['currentChecksumRows']=seal(N,'834450ec1f7da042d0629cf1d649351c9f8a1006357a75af12cb312a53adfbe5','f6b741a8d12503310bb6bd8052d01c73682a5f32f9992a8dbf47fd552bb7ccbb')
result['predecessorChecksumRows']=seal(O,d['predecessor']['manifestSha256'],d['predecessor']['SHA256SUMSSha256'])
result['inheritedReviewChecksums']={}
for v in d['reviewProvenance']:result['inheritedReviewChecksums'][v['path']]=seal(R/v['path'],v['manifestSha256'],v['SHA256SUMSSha256'])
# Only fixed normative named public inputs are read; the mutable coordinator origin is not opened.
origin=m['historicalContextOnly'][0]['origin'];ck(origin not in [x['path'] for x in m['inputs']],'mutable coordinator origin must be excluded from normative inputs')
for x in m['inputs']+m['outputs']:
 b=(R/x['path']).read_bytes();ck(len(b)==x['bytes'] and h(b)==x['sha256'],'fixed hash/bytes '+x['path'])
ck({x['path'] for x in m['outputs']}=={str(x.relative_to(R)) for x in N.rglob('*') if x.is_file()}-{str((N/'manifest.json').relative_to(R)),str((N/'SHA256SUMS').relative_to(R))},'exact manifest output inventory')
current_inputs={x['path']:x for x in m['inputs']}
fixed=[x for x in oldm['inputs'] if x['path']!=origin]
ck(len(fixed)==46 and all(current_inputs[x['path']]==x for x in fixed),'all original 46 fixed input pins preserved')
context=m['historicalContextOnly'][0];snap=(R/context['snapshot']).read_bytes()
ck(h(snap)==context['rawSha256']=='8beed302c7f28116935df37430ef5f3162710fced66a15161d3de86ba081d13b' and len(snap)==context['bytes']==4901,'immutable historical raw context binding')
ck(context['classification']=='HISTORICAL_CONTEXT_ONLY_NON_NORMATIVE' and context['contentConfersAuthority'] is False and context['liveOriginByteStabilityRequiredForApproval'] is False,'context classification/no authority/no live stability')
ck(context['capturedAtUtc']==m['createdAtUtc']=='2026-10-20T03:04:55.893775+00:00','context capture timestamp')
ck(context['originalCapturedPlanHistoricalProvenance']['sha256']=='bf4059ed78e2e7d8f629551b16f7b95d08101a30bc8beb9385df3e3a8ba20ebb' and context['oldBytesAvailableOrReconstructed'] is False and context['oldHashClaimedCurrent'] is False,'old plan hash provenance only')
result['context']={**context,'mutableOriginReadByReview':False}
# Byte comparisons establish honest reuse. No ancestor draft-tree or broad implementation audit.
for name in d['copiedPayloadsByteIdentical']:ck((O/name).read_bytes()==(N/name).read_bytes(),'unchanged payload '+name)
for name in ['10.34-dispositions.json','traceability.json','preview/docs/qa/evidence/studio-observed-authoring/devops-handoff.md']:
 ck((N/name).read_text().replace(str(N.relative_to(R)),str(O.relative_to(R)))==(O/name).read_text(),'own-path-only change '+name)
oldledger=(O/'preview/docs/qa/evidence/studio-observed-authoring/release-readiness.md').read_text();newledger=(N/'preview/docs/qa/evidence/studio-observed-authoring/release-readiness.md').read_text();normalized=newledger.replace(str(N.relative_to(R)),str(O.relative_to(R)))
ck(d['beforeRow'] in oldledger and d['afterRow'] in newledger,'before/after exact ledger rows')
ck(normalized.replace(d['afterRow'],d['beforeRow'])==oldledger,'ledger substantive delta limited to R1 cell')
oldmap=js(O/'release-evidence-map.json');newmap=js(N/'release-evidence-map.json');nm=json.loads(json.dumps(newmap).replace(str(N.relative_to(R)),str(O.relative_to(R))))
oldr=next(x for x in oldmap if x['gate']=='KL-015-R1');newr=next(x for x in nm if x['gate']=='KL-015-R1')
loc=d['sourceLocators'];expected={**oldr,'sourcePaths':oldr['sourcePaths']+[x['path'] for x in loc],'sourceLocators':loc,'creditState':'PENDING_INDEPENDENT_OBS009_QA_G9_R1_A_D; receipts alone do not close KL-015-R1'}
ck(newr==expected,'R1 map exact additions and pending closure')
ck([oldr if x['gate']=='KL-015-R1' else x for x in nm]==oldmap,'no other normalized map semantic change')
for x in loc:
 b=(R/x['path']).read_bytes();ck(h(b)==x['sha256'] and len(b)==x['bytes'],'lane/rule pin '+x['path']);line=b.decode().splitlines()[x['line']-1];ck(x['section'] in line,'exact source heading line '+x['path'])
 ck(x['path']+':'+str(x['line']) in d['afterRow'],'all three direct locators in ledger')
 if 'run' in x:ck(x['run'] in b.decode(),'source run id '+x['run'])
ck([x['coverage'] for x in loc]==['R1 a–c','R1 d','R1 rule §1.4'],'correct lane coverage split')
ck('pending independent credit of 009 R1 a–d' in d['afterRow'] and 'Receipts alone are not closure' in d['afterRow'],'pending independent QA state preserved')
# Existing bases stay exact. Independently reconstruct only the two affected patches.
def reconstruct(base,patch):
 lines=patch.decode().splitlines(keepends=True);src=base.decode().splitlines(keepends=True);out=[];cursor=0;i=2
 while i<len(lines):
  match=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n?',lines[i]);assert match
  start,count,newstart,newcount=map(lambda x:int(x) if x is not None else 1,match.groups());pos=start-1 if count else start
  assert pos>=cursor;out.extend(src[cursor:pos]);cursor=pos;i+=1;old_n=new_n=0
  while i<len(lines) and not lines[i].startswith('@@ '):
   z=lines[i];i+=1;assert z[0] in ' +-'
   if z[0] in ' -':assert src[cursor]==z[1:];cursor+=1;old_n+=1
   if z[0] in ' +':out.append(z[1:]);new_n+=1
  assert old_n==count and new_n==newcount
 out.extend(src[cursor:]);return ''.join(out).encode()
result['targets']=[]
for a,z in zip(oldm['targets'],m['targets']):
 target=R/z['target'];exists=target.exists();base=target.read_bytes() if exists else b'';patch=(R/z['patch']).read_bytes();preview=(R/z['preview']).read_bytes()
 ck(exists==z['baseExists'] and (h(base) if exists else None)==z['baseSha256'] and len(base)==z['baseBytes'],'actual target base '+z['target'])
 ck(all(a[k]==z[k] for k in ['target','baseExists','baseSha256','baseBytes','missingBaseRecorded','diffFrom']),'base binding unchanged '+z['target'])
 ck(patch.decode().splitlines()[:2]==['--- '+z['diffFrom'],'+++ b/'+z['target']],'exact header '+z['target'])
 ck(h(patch)==z['patchSha256'] and h(preview)==z['outputSha256'] and len(preview)==z['outputBytes'],'target hashes '+z['target'])
 affected=z['patch'].endswith(('readiness.patch','handoff.patch'))
 if affected:
  ck(reconstruct(base,patch)==preview,'affected independent hunk reconstruction '+z['target'])
  expected_patch=''.join(difflib.unified_diff(base.decode().splitlines(keepends=True),preview.decode().splitlines(keepends=True),fromfile=z['diffFrom'],tofile='b/'+z['target'])).encode();ck(expected_patch==patch,'affected exact diff '+z['target'])
 else:ck(patch==(R/a['patch']).read_bytes() and preview==(R/a['preview']).read_bytes(),'unaffected target exact reuse '+z['target'])
 result['targets'].append({'target':z['target'],'baseExists':exists,'baseSha256':z['baseSha256'],'verification':'new independent exact reconstruction' if affected else 'byte-identical patch/preview; exact predecessor QA reconstruction reused'})
ck((N/'patches/all-documentation.patch').read_bytes()==b''.join((R/z['patch']).read_bytes() for z in m['targets']),'combined exact five patch concatenation')
t=js(N/'traceability.json');arc=js(N/'architecture-obligations.json');disp=js(N/'10.34-dispositions.json')
ck(len(arc['obligations'])==21 and len(t['RBR'])==19 and len(t['story010Obligations'])==21 and len(newmap)==70 and len(disp['originalACs'])==33,'21/19/70/33 retained counts')
rows=[line for line in newledger.splitlines() if line.startswith('|')][2:];ck(len(rows)==70 and all(len(line.split('|'))==7 for line in rows),'70 fixed shape rows')
result.update({'fixedInputsVerified':len(m['inputs']),'outputsVerified':len(m['outputs']),'unchangedPayloadsCompared':len(d['copiedPayloadsByteIdentical']),'ownPathOnlyPayloadsCompared':3,'architectureObjects':21,'RBRRows':19,'releaseRows':70,'stagingACs':33,'mandatoryCorrectionSatisfied':'PM010-R1-LANE-LOCATORS; direct R1 a–c/R1 d/rule §1.4 citations only, credit pending','oldPlanStabilityConditionInherited':False,'productTestsRun':False,'packetCodeExecuted':False,'patchApplicationPerformed':False})
(W/'integrity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['context','targets']},indent=2))
