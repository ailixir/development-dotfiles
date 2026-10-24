"""Author source metadata acquisition/copy only; no target execution."""
from pathlib import Path
import json,hashlib,stat
OUT=Path(__file__).parent;T0=OUT.parents[2]
OLD=OUT.parent/'resume5'
def sha(raw):return hashlib.sha256(raw).hexdigest()
inputs=[]
for rel,pin in [('early/gateway80-failed-red-resource-prep/resume5','bd9da067c9d56545171050373a1926f9cd9d061966847ad35db680841cc8e9aa'),('resume-architecture/resume2/gateway80-failed-red-resource-code05-exact-review','f6de1630705aeef13f5e863899fadeaaadaef139f0e0cbea0c9ef619793874ec'),('qa/gateway80-failed-red-resource-code05-exact-review','df840ebbe009593a232ead2f6764ded6e08a6b3568e1b3728438697835543e16')]:
 d=T0/rel;raw=(d/'manifest.json').read_bytes()
 if sha(raw)!=pin:raise RuntimeError('MANIFEST_DRIFT')
 manifest=json.loads(raw);dest=OUT/'historical-inputs'/rel.replace('/','__');dest.mkdir(parents=True,exist_ok=True)
 (dest/'manifest.json').write_bytes(raw)
 for row in manifest['files']:
  path=d/row['path'];raw=path.read_bytes()
  if (sha(raw),len(raw),stat.S_IMODE(path.stat().st_mode))!=(row['sha256'],row['bytes'],row['mode']):raise RuntimeError('INPUT_DRIFT')
  target=dest/row['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
  inputs.append(dict(path=str(path),sha256=sha(raw),bytes=len(raw),mode=row['mode']))
root=T0/'resume2-gateway-failed-resource-source05-all-findings-root-adoption.json';raw=root.read_bytes()
if sha(raw)!='7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d' or len(raw)!=202238:raise RuntimeError('ROOT_DRIFT')
(OUT/'complete-root-all-findings-adoption.json').write_bytes(raw)
(OUT/'input-read-receipt.json').write_text(json.dumps(dict(all138FullByteReadAndVerified=True,totalMemberBytes=sum(r['bytes'] for r in inputs),rootFullRead=True,inputs=inputs,actualTargetExecution=False),indent=2)+'\n')
# Only active successor source/templates are renamed. Historical packets above stay literal.
for name in ('protocol.py','custody.py','failed_gateway.py','entry.py','factory.py','installer.py','install-cli.py','install-loader.bash','guard-failed-red.bash','binding-functions.bash','binding-wrapper.bash','bind-command.template.bash','buffer-bootstrap-inline.py','buffer-verifier-inline.py','shell-buffer-verify.py'):
 text=(OLD/name).read_text()
 if name!='custody.py':
  text=text.replace('gateway80-failed-red-resource-prep/resume5','gateway80-failed-red-resource-prep/resume6').replace('code05-exact-review','code06-exact-review')
  text=text.replace('SOURCE05','FAILED_RESOURCE_SOURCE06').replace('source05','failed_resource_source06').replace('code05ManifestSha256','failedResourceCode06ManifestSha256').replace('code05AriaReviewManifestSha256','failedResourceCode06AriaReviewManifestSha256').replace('code05QuinnReviewManifestSha256','failedResourceCode06QuinnReviewManifestSha256')
 (OUT/name).write_text(text)
k=json.loads((OLD/'contract.json').read_bytes());k['sourceGeneration']=6
k['authorityAllowedFields']+=['designatedControlAuthor','typedActorRosterComplete','typedPriorActors','typedActorEvidencePins','freshnessProofSubject','parentSchedulingIntervalProved']
for role,fields in k['controlAllowedFields'].items():fields+=['designatedControlAuthor','sourceManifestSha256','producerEntrySha256','freshnessProofSubject','parentSchedulingIntervalProved']
k['freshnessProofSubject']='ORIGINAL_PERMIT_AT_FINAL_GUARDED_ACCEPTANCE_AFTER_SELECTED_CLEANUP'
k['parentSchedulingIntervalProved']=False
k['source06OwnerReviewRequiredBeforeUse']=True
(OUT/'contract.json').write_text(json.dumps(k,sort_keys=True,indent=2)+'\n')
print(json.dumps(dict(verified=len(inputs),rootSha256=sha(raw),sourceOnly=True)))
