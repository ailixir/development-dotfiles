"""Independent source/hash/diff audit. No author helper main or runtime IO."""
from pathlib import Path
import hashlib,json,re,stat
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume4');P=D.parent/'resume3';O=Path(__file__).resolve().parent
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
new=json.loads((D/'manifest.json').read_text());old=json.loads((P/'manifest.json').read_text());proof=json.loads((D/'successor-diff.json').read_text())
old_rows={r['path']:r for r in old['files']};new_rows={r['path']:r for r in new['files']}
assert h(D/'manifest.json')=='43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce'
assert proof['previousManifestSha256']==h(P/'manifest.json')
for r in new['files']:
 p=D/r['path'];assert h(p)==r['sha256'] and len(p.read_bytes())==r['bytes'] and stat.S_IMODE(p.stat().st_mode)==r['mode']
for line in (D/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split('  ',1);assert h(D/name)==expected
assert h(D/'SHA256SUMS')=='50ef9b1761d0a5a642e22b1d7b2bbd15ac87627f4838f1903cffaa6feeca9152'
generated=proof['generatedCommonFiles'];rows=proof['nonGeneratedCommonComparisons']
assert len(rows)==len({r['path'] for r in rows})==76
assert {r['path'] for r in rows}==set(old_rows)-set(generated)
for name,role in generated.items():
 assert role['oldSha256']==old_rows[name]['sha256']
 assert 'newSha256' not in role and 'changed' not in role
 assert role['currentHashAuthority']=='manifest.json files entry'
 assert name in new_rows and proof['generatedArtifacts'][name]['excludedFromDescriptorCurrentHashAssertions'] is True
changed=[]
for r in rows:
 p=D/r['path'];assert r['oldSha256']==old_rows[r['path']]['sha256']
 assert r['newSha256']==h(p) and r['newMode']==stat.S_IMODE(p.stat().st_mode)
 assert r['changed']==(r['oldSha256']!=r['newSha256'])
 if r['changed']:changed.append(r['path'])
assert sorted(changed)==proof['strictDeltaCoverage'] and len(changed)==11

def replay(name,left,right,oldprefix,newprefix):
 lines=(D/name).read_text().splitlines(True);i=0;seen=[]
 while i<len(lines):
  marker='--- '+oldprefix+'/';assert lines[i].startswith(marker)
  target=lines[i][len(marker):].strip();i+=1;assert lines[i]=='+++ '+newprefix+'/'+target+'\n';i+=1
  source=(left/target).read_text().splitlines(True);out=[];at=0
  while i<len(lines) and not lines[i].startswith('--- '):
   m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);assert m
   x,n,y,k=int(m[1])-1,int(m[2] or 1),int(m[3])-1,int(m[4] or 1);i+=1
   assert x>=at;out+=source[at:x];assert len(out)==y;before=[];after=[]
   while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
    op=lines[i][0];value=lines[i][1:];assert op in ' +-'
    if op in ' -':before.append(value)
    if op in ' +':after.append(value)
    i+=1
   assert source[x:x+n]==before and len(before)==n and len(after)==k
   out+=after;at=x+n
  assert ''.join(out+source[at:])==(right/target).read_text();seen.append(target)
 assert len(seen)==len(set(seen))
 return sorted(seen)
assert replay('strict-successor.diff.patch',P,D,'resume3','resume4')==sorted(changed)
assert replay('strict-successor.reverse.patch',D,P,'resume4','resume3')==sorted(changed)
actual=sorted(n for n,r in old_rows.items() if h(D/n)!=r['sha256'])
record=json.loads((D/'diff-validation.json').read_text())
assert len(actual)==17 and record['actualChangedCommonMembers']==actual
assert record['strictDeltaCoverage']==sorted(changed) and record['nonGeneratedComparisons']==76
assert set(actual)-set(changed)<=set(generated)
for n in new_rows:
 if n.startswith('banks/') or n in ['contracts.py','case-map.json','input-manifest.json','source-guards.json','final-controls.py','revision-controls.py','helper.patch','tests.patch','vitest.gateway80.config.mjs']:
  assert (D/n).read_bytes()==(P/n).read_bytes()
ns=json.loads((D/'scope.json').read_text());os=json.loads((P/'scope.json').read_text())
for k in ['label','workspace','runtime','phases','phaseIds','node','helm','dependencies']:
 assert ns[k]==os[k]
result={'decision':'SOURCE_AND_PROOF_CHECKS_PASS_NO_ACTUAL_RELEASE','currentMembers':93,'strictNonGeneratedDeltaFiles':11,'actualChangedCommonFiles':17,'nonGeneratedCurrentHashModeAssertions':76,'explicitGeneratedCommonExclusions':sorted(generated),'bothStrictDirectionsExact':True,'allCurrentAssertedHashesModesExact':True,'finalManifestAndSidecarAuthorityExact':True,'DIFF08CorrectedWithoutHashCycle':True,'nativeScopeLabelPathsArgvFixtureBanksMapsOraclesPreserved':True,'actualRuntimeOrSourceAction':False}
(O/'independent-source-proof-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
