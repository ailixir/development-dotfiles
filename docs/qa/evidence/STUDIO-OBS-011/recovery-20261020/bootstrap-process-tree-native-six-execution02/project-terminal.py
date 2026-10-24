from pathlib import Path
import json,hashlib,os,stat,re,collections,math,subprocess,datetime
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=B/'bootstrap-process-tree-native-six-execution02';T=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01/repo');raw=T/'bootstrap-six-raw02'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def w(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
phases=['no-app','captured-unpublished','committed-before-ready','committed-before-ready-orderly','ready-sent-dropped','ready-received-stop']
expected=json.loads((B/'bootstrap-process-tree-observation-candidate/six-native-and-301-carry-expected.json').read_text())['futureSixExpected']
j=json.loads((raw/'vitest.json').read_text());cases=[a for s in j['testResults'] for a in s['assertionResults']];codes=set('BOOTSTRAP_PROCESS_IDENTITY BOOTSTRAP_PROCESS_PROBE_UNKNOWN BOOTSTRAP_PROCESS_TABLE_UNREADABLE BOOTSTRAP_PROCESS_TABLE_INVALID BOOTSTRAP_PROCESS_SELF_MISSING BOOTSTRAP_PROCESS_ROOT_NOT_LIVE BOOTSTRAP_PROCESS_SELF_DESCENDANT BOOTSTRAP_PROCESS_NOT_CONFIRMED_STOPPED BOOTSTRAP_READY_INVENTORY_MISSING BOOTSTRAP_INVENTORY_WRITE_MISSING BOOTSTRAP_INVENTORY_WRITE CHILD_PID LIVE_TREE_CHANGED'.split())
rows=[]
for a in cases:
 messages=a.get('failureMessages',[]);heads=[m.splitlines()[0] for m in messages if m.splitlines()];found={c for h in heads for c in codes if re.search(r'(?<![A-Z_])'+re.escape(c)+r'(?![A-Z_])',h)}
 frames=[]
 for msg in messages:
  for m in re.finditer(r'(test/(?:fixtures-tier|helpers)/[A-Za-z0-9_./-]+\.(?:ts|js)):(\d+):(\d+)',msg):
   f={'file':m[1],'line':int(m[2]),'column':int(m[3])}
   if f not in frames:frames.append(f)
 types={m.group(1) for h in heads if (m:=re.match(r'(Error|AssertionError|TypeError|RangeError|SyntaxError|ReferenceError)\b',h))}
 branchReasons={m.group(1) for head in heads if (m:=re.search(r'BOOTSTRAP_PROCESS_TABLE_INVALID:(OUTPUT_SHAPE|ROW_IDENTITY|DUPLICATE_PID|REQUIRED_METADATA)(?![A-Z_])',head))}
 rows.append({'branchReason':next(iter(branchReasons)) if len(branchReasons)==1 and found=={'BOOTSTRAP_PROCESS_TABLE_INVALID'} else ('NONE' if not messages else 'UNKNOWN'),'file':'studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts','ancestorTitles':a['ancestorTitles'],'title':a['title'],'fullName':a['fullName'],'status':a['status'],'failureType':next(iter(types)) if len(types)==1 else ('NONE' if not messages else 'UNKNOWN'),'sourceErrorEnum':next(iter(found)) if len(found)==1 else ('NONE' if not messages else 'UNKNOWN'),'projectFrames':frames})
assert [a['fullName'] for a in rows]==[a['fullName'] for a in expected]
counts=dict(collections.Counter(a['status'] for a in rows)); log=(raw/'vitest.log').read_bytes();unhandled=bool(re.search(rb'Unhandled (?:Errors|Rejection|Exception)|unhandledRejection',log))
w('native-six-case-reconciliation.json',{'rawReportSha256':sha(raw/'vitest.json'),'rawLogSha256':sha(raw/'vitest.log'),'rawExit':json.loads((O/'fixtures-terminal.json').read_text())['rawNativeExit'],'physicalResultFiles':len(j['testResults']),'reportedSuiteCounts':{k:v for k,v in j.items() if k.startswith('num')},'identitiesAndOrderExact':True,'filterOmissions':0,'counts':counts,'orderedCases':rows,'unhandledBannerPresent':unhandled,'gate':'PASS' if counts=={'passed':6} and not unhandled else 'FAIL','failureBodiesExported':False})
# All fresh generated leaves are hashed only; only the two approved JSON schemas are decoded.
root=T/'docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation/padding-correction/native-runs'
nativeRecord=json.loads((O/'fixtures-terminal.json').read_text());freshStart=datetime.datetime.fromisoformat(nativeRecord['nativeStartedAtUtc']).timestamp()
freshDirs=[d for d in root.iterdir() if d.is_dir() and d.name.startswith('process-tree-') and d.stat().st_birthtime>=freshStart];assert len(freshDirs)==6
paths=sorted(p for d in freshDirs for p in d.rglob('*') if p.is_file()); privateInventory=[]; opaque=[]
for i,p in enumerate(paths):
 st=p.lstat(); assert stat.S_ISREG(st.st_mode) and st.st_nlink==1
 d={'ordinal':i,'sha256':sha(p),'bytes':st.st_size,'extension':p.suffix};opaque.append(d);privateInventory.append({**d,'path':str(p.relative_to(T))})
(raw/'fresh-generated-full-hash-inventory.json').write_text(json.dumps(privateInventory,indent=2)+'\n');w('fresh-generated-opaque-hash-inventory.json',{'files':opaque,'privateFullInventorySha256':sha(raw/'fresh-generated-full-hash-inventory.json'),'payloadBodiesExported':False})
def readClosed(p):
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd);assert stat.S_ISREG(a.st_mode) and a.st_nlink==1 and a.st_size<=65536
  data=os.read(fd,65537);b=os.fstat(fd);assert (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns) and len(data)==a.st_size
  return json.loads(data),hashlib.sha256(data).hexdigest()
 finally:os.close(fd)
def pid(v):assert type(v)==int and v>1;return v
def pids(v):assert type(v)==list and len(v)<=512 and len(v)==len(set(v));return [pid(x) for x in v]
def boolean(v):assert type(v)==bool;return v
def number(v):assert type(v) in (int,float) and math.isfinite(v) and v>=0;return v
projection=[];attempts=0
for phase in phases:
 dirs=[p for p in freshDirs if p.is_dir() and p.name.startswith('process-tree-'+phase+'-') and not any(p.name.startswith('process-tree-'+q+'-') for q in phases if q!=phase and q.startswith(phase+'-'))]
 assert len(dirs)==1,(phase,len(dirs));d=dirs[0]; row={'phase':phase};early=None;final=None
 for name in ['bootstrap-owned-inventory.json','runner-bootstrap-process-tree.json']:
  p=d/name
  if not p.exists():row[name]={'state':'MISSING_UNKNOWN'};continue
  attempts+=1
  try:
   x,h=readClosed(p);assert x['phase']==phase; out={'state':'PRESENT_TYPED','sha256':h,'phase':phase,'childPid':pid(x['childPid'])}
   if name=='bootstrap-owned-inventory.json':out['observedDescendantPids']=pids(x['observedDescendantPids']);early=out
   else:
    out['actualObservedDescendantPids']=pids(x['actualObservedDescendantPids']);out['actualSuspendedDescendantPids']=pids(x['actualSuspendedDescendantPids'])
    for k in ['actualCompiledChild','actualFullChromium','allObservedPidsGone','productionScratchEmpty','actualReadyParentAccepted']:out[k]=boolean(x[k])
    for k in ['actualReadySentCount','executeSends','applicationVisits','productionCapacityInUse','objectStoreVideoFiles']:out[k]=number(x[k])
    e=x['terminalEvidence'];assert e['state'] in ['STORED','FAILED','UNAVAILABLE'];out['terminalEvidence']={'state':e['state'],'partial':boolean(e['partial'])}
    if phase in ['committed-before-ready-orderly','ready-received-stop']:out['decodedBlankAppNativeFrames']=number(x['decodedBlankAppNativeFrames']);assert out['decodedBlankAppNativeFrames']>0
    else:assert 'decodedBlankAppNativeFrames' not in x;out['decodedBlankAppNativeFrames']='NOT_APPLICABLE'
    labels=x['pidLabels'];assert type(labels)==list and len(labels)<=512
    labelpids=[pid(v['pid']) for v in labels];assert all(type(v['command'])==str for v in labels)
    out['pidLabels']={'count':len(labels),'pidMembershipMatchesObserved':collections.Counter(labelpids)==collections.Counter(out['actualObservedDescendantPids']),'chromiumRolePresent':any(re.search('chrome|chromium',v['command'],re.I) for v in labels),'ffmpegRolePresent':any(re.search('ffmpeg',v['command'],re.I) for v in labels)};final=out
   row[name]=out
  except (AssertionError,KeyError,TypeError,ValueError):row[name]={'state':'SCHEMA_UNKNOWN','sha256':sha(p)}
 if early and final:
  row['earlyFinalCompleteInventoryJoin']=early['childPid']==final['childPid'] and early['observedDescendantPids']==final['actualObservedDescendantPids']
  row['confirmedSetMatchesMode']=(set(final['actualSuspendedDescendantPids'])==set(final['actualObservedDescendantPids'])) if phase not in ['committed-before-ready-orderly','ready-received-stop'] else final['actualSuspendedDescendantPids']==[]
 else:row['earlyFinalCompleteInventoryJoin']='NOT_ESTABLISHED';row['confirmedSetMatchesMode']='NOT_ESTABLISHED'
 projection.append(row)
w('closed-native-inventory-projection.json',{'readAttempts':attempts,'maximumAuthorizedLeaves':12,'phases':projection,'historicalInventoryUpgraded':False,'unreadMixedFieldsExported':False})
# Strict signal-zero closure checks apply only to original recorded task wrapper PIDs.
term=json.loads((O/'fixtures-terminal.json').read_text());owned=[]
for k in ['driverPid','nativePid','caffeinatePid']:
 try:os.kill(term[k],0);state='ALIVE'
 except ProcessLookupError:state='ESRCH_GONE'
 except PermissionError:state='UNKNOWN_PERMISSION'
 owned.append({'role':k,'pid':term[k],'strictSignal0':state})
host=json.loads((O/'terminal-host-metadata.json').read_text())
metadataEnd=datetime.datetime.fromisoformat(term['metadataCollectorEndedAtUtc']);release=datetime.datetime.fromisoformat(term['inhibitorReleasedAtUtc']);nativeEnd=datetime.datetime.fromisoformat(term['nativeEndedAtUtc']);assert nativeEnd<=metadataEnd<=release and term['inhibitorStillRunningThroughMetadata'] and term['caffeinateReleased']
wj('terminal-host-owned-closure.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownedWrappers':owned,'caffeinateReleased':term['caffeinateReleased'],'caffeinateExit':term['caffeinateExit'],'hostFactsFromSameOriginalDriverHeldInhibitorMetadata':host,'additionalHostCommandsRun':False,'nativeEndedAtUtc':term['nativeEndedAtUtc'],'metadataCollectorEndedAtUtc':term['metadataCollectorEndedAtUtc'],'inhibitorReleasedAtUtc':term['inhibitorReleasedAtUtc'],'nativeThenMetadataThenRelease':True,'noSleepHistoryClaim':True,'historicalAllDescendantsGone':'NOT_ESTABLISHED','inhibitorReleaseBoundary':'AFTER_NATIVE_AND_ACTUAL_CAPTURE_FULL_SNAPSHOTS_CACHE_CLI_BROWSER_HOST_METADATA'})
wj('fresh-output-timestamp-custody.json',{'originalNativeStartedAtUtc':term['nativeStartedAtUtc'],'freshSourceAllocatedDirectoryCount':len(freshDirs),'freshGeneratedFileCount':len(paths),'directorySelection':'source-owned process-tree phase mkdtemp directories with birthtime >= this original native start; old first-attempt directories excluded','sourceAllocation':'nativeEvidenceDirectory(process-tree-phase) + exclusive wx nativeJson; unchanged f4ccfixture','oldNativePayloadBodiesRead':False,'oldDirectoriesIncludedInProjection':False})
print(json.dumps({'counts':counts,'failed':[{'name':r['fullName'],'type':r['failureType'],'code':r['sourceErrorEnum'],'reason':r['branchReason'],'frames':r['projectFrames']} for r in rows if r['status']=='failed'],'projectionReads':attempts,'earlyPresent':sum(x['bootstrap-owned-inventory.json']['state']=='PRESENT_TYPED' for x in projection),'finalPresent':sum(x['runner-bootstrap-process-tree.json']['state']=='PRESENT_TYPED' for x in projection),'ownedWrapperStates':owned,'inhibitorHeldThroughMetadata':True}))
