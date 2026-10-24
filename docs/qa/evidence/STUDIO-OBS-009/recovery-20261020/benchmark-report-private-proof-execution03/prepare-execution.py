from pathlib import Path
import os,json,hashlib,runpy,subprocess,datetime,math
from collections import Counter
R=Path.cwd();O=Path(__file__).resolve().parent;B=R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020';P=B/'benchmark-report-private-proof-preparation';V=B/'benchmark-report-adoption-lint-correction01';OLD=B/'benchmark-report-private-proof-execution02';D=Path('/private/tmp/obs009-benchmark-report-adoption-20261020-proof01');E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
authPath=B/'benchmark-report-lint-corrected-root-admission03.json';assert sha(authPath)=='7ef54f638bb093035ea9222503d34dc5ee3b4e999c36e669c3ff1f5aff7412cd';auth=json.loads(authPath.read_text());assert auth['authorized'] and not auth['nativeGo'] and auth['noNewSeedProductEmit']
for key in ['sourceCandidate','sourceQa','resourceQa','copyComplete','ownRestoredPrivateSnapshot','previousBenchmarkExecution','previous011PartialProof']:
 ref=auth[key];assert sha(ref['path'])==ref['sha256']
for packet,expected in [(P,'e5b069410211d10f31a44a1c68e41c773ed46216022dc874a2f2127941808648'),(V,'7de7fbe32a9948ffa91f83881efe247c552ec366f17421d005900d5a34d751cd'),(OLD,'9676b7d5efd1fc3809ff66ef9c0c3a78faa3b2ba6c43cea70698491fa44da9da')]:
 assert sha(packet/'manifest.json')==expected
 for row in json.loads((packet/'manifest.json').read_text())['artifacts']:assert sha(packet/row['path'])==row['sha256']
plan=json.loads((P/'commands.json').read_text());derived=json.loads(json.dumps(plan))
for original,stage in zip(plan['sequence'],derived['sequence']):
 stage['label']=stage['label'].replace('benchmark-report-proof01','benchmark-report-proof02')
 stage['argv']=[value.replace('benchmark-report-proof01','benchmark-report-proof02').replace('/metadata-freeze/','/metadata-freeze02/') for value in stage['argv']]
 stage['externalOriginalOutputs']['paths']=[name.replace('benchmark-report-proof01','benchmark-report-proof02') for name in stage['externalOriginalOutputs']['paths']]
 assert stage['argv']==[v.replace('benchmark-report-proof01','benchmark-report-proof02').replace('/metadata-freeze/','/metadata-freeze02/') for v in original['argv']]
 assert not list(E.glob(stage['label']+'*'))
assert not (D/'metadata-freeze02').exists();wj('commands.json',derived)
cap=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'
with (O/'initial-actual-capture.log').open('w') as log:p=subprocess.run(['python3',str(cap),str(O/'initial-actual-capture.json')],cwd=R,stdout=log,stderr=subprocess.STDOUT)
assert p.returncode==0;captured=json.loads((O/'initial-actual-capture.json').read_text());assert captured['digest']==auth['expectedActualSourceDigest'] and len(captured['files'])==auth['expectedActualSourceFiles'];assert captured['dist']['digest']==auth['expectedActualDistDigest'] and len(captured['dist']['files'])==auth['expectedActualDistFiles']
snap=runpy.run_path(str(R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'))['snapshot'];private={n:snap(D/n) for n in ['before-repo','repo']};expected=json.loads(Path(auth['ownRestoredPrivateSnapshot']['path']).read_text());assert private==expected;wj('initial-new-private-full-snapshots.json',private);actual=snap(R);assert actual==json.loads((OLD/'initial-actual-full-selected.json').read_text());wj('initial-actual-full-selected.json',actual)
for value in private.values():assert len(value['copyProfileFiles'])==13995 and value['dist']['digest']==auth['privateProductDigest'] and len(value['dist']['files'])==238
bindings=json.loads((V/'source-pins.json').read_text())['files']
for row in bindings:assert sha(R/row['path'])==row['actualBeforeSha256'] and sha(D/'before-repo'/row['path'])==row['actualBeforeSha256']==sha(D/'repo'/row['path'])
cli=json.loads((OLD/'initial-canonical-cli-pins.json').read_text());canonical=[r for r in cli['clis'] if r['tree']==str(R)];now=[]
for tree in [R,D/'before-repo',D/'repo']:
 for row in canonical:
  p=tree/'studio-runner/node_modules'/row['relativePath'];assert sha(p)==row['sha256'] and oct(p.stat().st_mode&0o777)==row['mode'];now.append({'tree':str(tree),'relativePath':row['relativePath'],'sha256':sha(p),'mode':row['mode']})
for row in cli['runtime']:assert sha(row['path'])==row['sha256'] and oct(Path(row['path']).stat().st_mode&0o777)==row['mode']
wj('initial-canonical15-and-runtime.json',{'clis':now,'runtime':cli['runtime'],'versionsCarriedFromMeasuredSamePhysicalBytes':True})
browser=json.loads((OLD/'browser-and-env-binding.json').read_text());assert sha(browser['executable'])==browser['sha256'];assert os.environ.get('IMAGE_TAG')==browser['IMAGE_TAG'] and os.environ.get('PLAYWRIGHT_BROWSERS_PATH')==browser['PLAYWRIGHT_BROWSERS_PATH'];wj('browser-and-env-binding.json',browser)
cache='studio-runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';doc=json.loads((D/'repo'/cache).read_text());assert type(doc) is dict and set(doc)=={'version','results'} and doc['version']=='3.2.7';assert type(doc['results']) is list and len(doc['results'])==191;keys=[]
for pair in doc['results']:
 assert type(pair) is list and len(pair)==2 and type(pair[0]) is str;key,value=pair;keys.append(key);assert type(value) is dict and set(value)=={'duration','failed'} and type(value['failed']) is bool and type(value['duration']) in [int,float] and math.isfinite(value['duration'])
assert len(set(keys))==191 and Counter(keys)==Counter(k for k,_ in json.loads((OLD/'generated-cache/source-failed-native-before-copy.json').read_text())['results']);assert sha(D/'repo'/cache)==sha(OLD/'generated-cache/source-failed-native-before-copy.json');assert dict(doc['results'])[':test/fixtures-tier/observed-bootstrap-process-tree.test.ts']['failed'] is True
(O/'generated-cache').mkdir();(O/'generated-cache/initial-seed.json').write_bytes((D/'repo'/cache).read_bytes())
wj('fresh-guards.json',{'rootAdmissionSha256':sha(authPath),'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualSource':captured['digest'],'actualDist':captured['dist']['digest'],'ownTwoCopiesExactRestoredSeed':True,'membersEach':13995,'product238E19':auth['privateProductDigest'],'canonical15RuntimeAndBrowserEnvExact':True,'cacheVersion':'3.2.7','cache191UniqueOrderAndBytesExactSeed':True,'nativeFailedCacheRetained':True,'fresh8LabelsAbsent':True,'metadataFreeze02Absent':True,'noNewSeedCopyOrProductEmit':True,'oldBorrowedNativeNamespaceReadWalkedOrForced':False,'custodyThroughOriginalCopyOnly':auth['copyComplete'],'ownPrivateCurrentSnapshot':auth['ownRestoredPrivateSnapshot'],'actualCurrentBindingFromRootAdmission':True,'delegatedFactsNotIndependentSignatures':True})
print(json.dumps({'freshGuards':True,'pid':os.getpid(),'actualSource':captured['digest'],'actualDist':captured['dist']['digest'],'ownPrivateMembersEach':13995,'product238E19':auth['privateProductDigest'],'noNewSeedOldNativeWalk':True}))
