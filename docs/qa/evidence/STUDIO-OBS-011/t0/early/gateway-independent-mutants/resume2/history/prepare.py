from pathlib import Path
import json,hashlib,shutil,stat,re
O=Path(__file__).resolve().parent
ROOT=Path.cwd();D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway-chart-draft'
def sha(b):return hashlib.sha256(b).hexdigest()
def writejson(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def exact_single_hunk(before,after,path):
 a=before.splitlines(True);b=after.splitlines(True);prefix=0
 while prefix<min(len(a),len(b)) and a[prefix]==b[prefix]:prefix+=1
 suffix=0
 while suffix<min(len(a),len(b))-prefix and a[-suffix-1]==b[-suffix-1]:suffix+=1
 start=max(0,prefix-3);a_end=len(a)-max(0,suffix-3);b_end=len(b)-max(0,suffix-3)
 return ''.join(['--- a/'+path+'\n','+++ b/'+path+'\n',f'@@ -{start+1},{a_end-start} +{start+1},{b_end-start} @@\n']+[' '+x for x in a[start:prefix]]+['-'+x for x in a[prefix:len(a)-suffix]]+['+'+x for x in b[prefix:len(b)-suffix]]+[' '+x for x in a[len(a)-suffix:a_end]])
helper=D/'repo/helm-chart/put-checks/templates/_helpers.tpl'; base=helper.read_text()
assert sha(helper.read_bytes())=='a5cd97461ef1320a73d9a36b4ababcf343fee79007df8b0a28f569b0c381d73e'
start=base.index('{{- define "put-checks.springConfig.validateProperties" -}}')
end=len(base);section=base[start:end]
recurse='{{- include "put-checks.springConfig.validateProperties" (dict "values" $value "path" $path) -}}\n'
compare='(has $normalized $protected)'; bypass='(has (regexReplaceAll "[^A-Za-z0-9]" $path "") $protected)'
assert section.count(recurse)==1 and section.count(compare)==1
specs=[('M-RECURSION',recurse,'','nested','relaxed'),('M-NORMALIZED-COMPARISON',compare,bypass,'relaxed','nested')]
rows=[]
for mid,old,new,witness,control in specs:
 changed=base[:start]+section.replace(old,new,1)
 path='helm-chart/put-checks/templates/_helpers.tpl'; cand=O/'mutants'/mid/'repo'/path;cand.parent.mkdir(parents=True,exist_ok=True);cand.write_text(changed);cand.chmod(0o644)
 forward=exact_single_hunk(base,changed,path)
 restore=exact_single_hunk(changed,base,path)
 for name,text in [('forward.patch',forward),('restore.patch',restore)]: (O/'mutants'/mid/name).write_text(text)
 rows.append({'id':mid,'target':path,'preimageSha256':sha(base.encode()),'candidateSha256':sha(changed.encode()),'preimageMode':'0644','candidateMode':'0644','forwardPatch':'mutants/'+mid+'/forward.patch','forwardPatchSha256':sha(forward.encode()),'restorePatch':'mutants/'+mid+'/restore.patch','restorePatchSha256':sha(restore.encode()),'sourceCandidate':'mutants/'+mid+'/repo/'+path,'exactOldFragment':old,'exactNewFragment':new,'witnessShape':witness,'unaffectedOtherShape':control,'runtimeStatus':'UNEXECUTED'})
chart=ROOT/'helm-chart/put-checks'; target=O/'private-repo/helm-chart/put-checks';chartfiles=[]
for p in sorted(chart.rglob('*')):
 assert not p.is_symlink(),str(p)
 if p.is_file():
  rel=p.relative_to(chart);q=target/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
  original=sha(p.read_bytes())
  if str(rel)=='templates/_helpers.tpl':q.write_bytes(helper.read_bytes());q.chmod(stat.S_IMODE(p.stat().st_mode))
  chartfiles.append({'path':str(rel),'sourceSha256':original,'fixedSha256':sha(q.read_bytes()),'mode':format(stat.S_IMODE(q.stat().st_mode),'04o')})
assert len(chartfiles)==22
copies=['studio-runner/test/deployment/helm.ts','studio-runner/test/helpers/corpus.ts','studio-runner/vitest.deployment.config.ts','studio-runner/tsconfig.json','studio-runner/package.json','studio-runner/package-lock.json','studio-runner/eslint.config.js']
copyrows=[]
for rel in copies:
 p=ROOT/rel
 assert p.exists(),rel
 q=O/'private-repo'/rel;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q);copyrows.append({'path':rel,'sha256':sha(p.read_bytes()),'mode':format(stat.S_IMODE(p.stat().st_mode),'04o')})
writejson(O/'mutations.json',{'status':'STATIC_PREPARATION_NATIVE_UNEXECUTED','acceptedHelperSha256':sha(base.encode()),'originalDraftPatchSha256':sha((D/'gateway-chart-draft.patch').read_bytes()),'originalDraftManifestSha256':sha((D/'manifest.json').read_bytes()),'mutants':rows})
writejson(O/'chart-bindings.json',{'sourceChart':'helm-chart/put-checks','privateFixedChart':'private-repo/helm-chart/put-checks','files':chartfiles,'unchangedRunnerCopies':copyrows})
props=['studio.gateway.provider','studio.gateway.endpoint','studio.gateway.project','studio.gateway.location','studio.gateway.model','studio.gateway.credentials.mode','studio.gateway.credentials.service-account-key-file','STUDIO_GATEWAY_CREDENTIALS_KEY_FILE']
prefix='gateway chart-owned facts in mounted Spring configuration'
cases=[]
for comp in ['backend','worker']:
 for shape in ['flat','nested','relaxed']:
  for prop in props:cases.append(f'{prefix} > {comp} rejects {shape} {prop}')
 for prop in props[:7]:cases.append(f'{prefix} > {comp} keeps legacy compile spelling {prop} reserved')
 cases.append(f'{prefix} > {comp} keeps gateway tuning and custom properties available')
for prop in props:cases.append(f'{prefix} > mutation: removing only {prop} defeats its refusal')
for mode in ['application-default','service-account-file']:
 for values in ['values.yaml','values-dev.yaml','values-uat.yaml','values-prod.yaml']:cases.append(f'{prefix} > {values}: valid {mode} manifests stay byte-identical after adding the guards')
assert len(cases)==80 and len(set(cases))==80
writejson(O/'original-80-case-map.json',{'status':'SOURCE_EXPANDED_NOT_COLLECTED','candidateTestSha256':sha((D/'repo/studio-runner/test/deployment/integrations.test.ts').read_bytes()),'ids':cases,'selectedWitnessIds':{row['id']:[f"{prefix} > {comp} rejects {row['witnessShape']} studio.gateway.provider" for comp in ['backend','worker']] for row in rows},'scratchCaseIds':['independent gateway private-chart counterfactuals > M-RECURSION: nested refusal discriminates only recursive descent','independent gateway private-chart counterfactuals > M-NORMALIZED-COMPARISON: relaxed refusal discriminates only protected-name case normalization'],'originalInventoryChange':0})
print('Prepared two independent mutants,22-file private fixed chart and unchanged minimal runner inputs; no native execution.')
