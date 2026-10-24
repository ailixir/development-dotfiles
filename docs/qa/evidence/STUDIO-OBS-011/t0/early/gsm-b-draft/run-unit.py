#!/usr/bin/env python3
"""UNEXECUTED preparation. Call ONLY under the existing execute-008 Gradle lock."""
import argparse
from collections import Counter
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=['red03','green','freeze','delete-side-effect','delete-clarify','delete-admit','delete-bootstrap','admit-after-authorize'])
parser.add_argument('label', help='Fresh obs011- prefix; freeze appends -b01/-b02/-b03')
parser.add_argument('--root-proof-barrier-released', action='store_true', required=True)
parser.add_argument('--keep-successful-freeze-unit', action='store_true')
args = parser.parse_args()
root = Path.cwd().resolve()
draft = Path(__file__).resolve().parent
service = 'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java'
session = 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
negative = session.replace('GuidedSessionIT','GuidedAdmissionWithoutTranslationIT')
execution = root/'docs/qa/evidence/STUDIO-OBS-011/execution'
collector = '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py'
wrapper = root/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def path(rel):
    target = root/rel
    target.relative_to(root)
    for part in [target,*target.parents]:
        if part.is_symlink():
            raise SystemExit('Symlink refused: '+str(part))
        if part == root:
            break
    return target

def digest(rel):
    p = path(rel)
    return sha(p.read_bytes()) if p.exists() else None

parent = subprocess.check_output(['ps','-p',str(os.getppid()),'-o','command='],text=True)
if str(wrapper) not in parent and str(wrapper.relative_to(root)) not in parent:
    raise SystemExit('Caller must be with-gradle-lock.py')
with wrapper.with_name('gradle.lock').open('a+') as lock:
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        pass
    else:
        fcntl.flock(lock,fcntl.LOCK_UN)
        raise SystemExit('Caller-held lock is absent')
if not re.fullmatch(r'obs011-[A-Za-z0-9_-]+',args.label):
    raise SystemExit('Fresh obs011- label required')
for line in (draft/'artifact-hashes.sha256').read_text().splitlines():
    value,name = line.split('  ',1)
    rel = Path(name)
    if rel.is_absolute() or '..' in rel.parts:
        raise SystemExit('Bad artifact path')
    p = path(str((draft/rel).relative_to(root)))
    if sha(p.read_bytes()) != value:
        raise SystemExit('Artifact changed: '+name)
manifest = json.loads((draft/'manifest.json').read_text())
proof = {item['path']:item['S011Sha256'] for item in manifest['proofFiles']}
# Original Replay, never a temporary diagnostic candidate or later IT-R/FOLD draft.
if {p:digest(p) for p in proof} != proof:
    raise SystemExit('Four unchanged proof inputs are not original S011 bytes')
for item in manifest['unchangedGsTBatons']:
    if digest(item['path']) != item['sha256']:
        raise SystemExit('Complete GS-T baton is not installed: '+item['path'])
mutant = args.phase in manifest['mutants']
for fact in manifest['files']:
    expected = fact['draftSha256'] if mutant else fact['baseSha256']
    if digest(fact['path']) != expected:
        raise SystemExit('Exact part-A/GS-T or final preimage differs: '+fact['path'])
labels = [args.label+'-'+s for s in ['b01','b02','b03']] if args.phase=='freeze' else [args.label]
for label in labels:
    if list(execution.glob(label+'*')) or list((execution/'gs-m').glob(label+'*')):
        raise SystemExit('Evidence label already exists: '+label)
receipt_dir = path('docs/qa/evidence/STUDIO-OBS-011/execution/gs-m')
receipt_dir.mkdir(parents=True,exist_ok=True)
env = os.environ.copy()
env['PATH'] = str(Path.home()/'.local/share/fnm/node-versions/v24.20.0/installation/bin')+os.pathsep+env['PATH']
expected = json.loads((draft/'expected-discovery.json').read_text())['cases']
base = 'com.citi.put.checks.studio.guided.'
N = base+'session.GuidedAdmissionWithoutTranslationIT'
sets = {
 'b01':[base+'session.'+x for x in ['GuidedSessionIT','GuidedServiceTransportFaultIT','GuidedLifecycleReasonIT','GuidedAdmissionWithoutTranslationIT']],
 'b02':[base+'session.'+x for x in ['GuidedBridgeIntegrationTest','GuidedBridgePlannedIT','GuidedPlanningIntegrationTest']],
 'b03':[base+'publication.GuidedPublicationReplayIT']}
changes = {}
if mutant:
    changes[service] = (draft/'mutants'/(args.phase+'.java.txt')).read_bytes()
    if sha(changes[service]) != manifest['mutants'][args.phase]['serviceSha256']:
        raise SystemExit('Mutant is not reviewed bytes')
else:
    for fact in manifest['files']:
        if fact['path'] == negative or (args.phase != 'red03' and not fact['forwardedUnchanged']):
            changes[fact['path']] = (draft/'repo'/fact['path']).read_bytes()
backup = {p:(path(p).read_bytes(),path(p).stat().st_mode&0o777) if path(p).exists() else None for p in changes}
run_receipt = {'status':'RUNNING_NOT_ASSESSED','phase':args.phase,'label':args.label,
               'conflict':'sideEffect wrapper control and redundant-guard mutant unresolved; runtime alone cannot waive the ruling',
               'proofBeforeMainChange':{p:digest(p) for p in proof},'runs':[],'sourceRestore':None,
               'originalCompileExit':None,'keptSuccessfulFreezeUnit':False}
receipt_file = receipt_dir/(args.label+'-unit.json')
if receipt_file.exists() or (receipt_dir/(args.label+'-candidate-compile.log')).exists():
    raise SystemExit('Unit receipt/compile label already exists')

def save():
    receipt_file.write_text(json.dumps(run_receipt,indent=2)+'\n')

def compile_sources(suffix):
    with (receipt_dir/(args.label+'-'+suffix+'.log')).open('x') as log:
        return subprocess.run(['./gradlew','compileTestJava','--no-daemon'],cwd=root/'backend',env=env,stdout=log,stderr=subprocess.STDOUT).returncode

def run(label,classes,incremental=False):
    tasks = ['test','guidedIncrementalTest'] if incremental else ['test']
    cmd = [sys.executable,collector,label,'--test-tasks',','.join(tasks),'--']
    for task in tasks:
        cmd += [task]
        for name in classes:
            cmd += ['--tests',name]
    cmd += ['--continue','--rerun-tasks','--no-daemon']
    with (receipt_dir/(label+'-listeners.txt')).open('x') as out:
        subprocess.run(['lsof','-nP','-iTCP','-sTCP:LISTEN'],stdout=out,check=False)
    code = subprocess.run(cmd,cwd=root,env=env,check=False).returncode
    result_path = execution/(label+'-results.json')
    result = json.loads(result_path.read_text()) if result_path.exists() else {}
    wanted = Counter((x['task'],x['class'],x['name']) for x in expected if x['class'] in classes and x['task'] in tasks)
    found = Counter((x.get('task'),x.get('class'),x.get('name')) for x in result.get('testcases',[]))
    complete = wanted==found
    success = (code==0 and result.get('exit')==0 and result.get('sourceStable') is True
               and result.get('distStable') is True and complete
               and all(x.get('status')=='PASS' for x in result.get('testcases',[])))
    proof_after = {p:digest(p) for p in proof}
    success = success and proof_after == proof
    run_receipt['runs'].append({'label':label,'command':cmd,'collectorExit':code,
        'proofAfterCollector':proof_after,'proofByteIdentity':proof_after==proof,
        'completeExactDiscovery':complete,'missing':list((wanted-found).elements()),
        'unexpected':list((found-wanted).elements()),'sourceStable':result.get('sourceStable'),
        'distStable':result.get('distStable'),'allPassAndCollectorZero':success,
        'resultSha256':sha(result_path.read_bytes()) if result_path.exists() else None,
        'redVerdict':'UNASSESSED_REQUIRES_EXACT_FRESH_XML_FAILURE_LINES'})
    save()
    return success

success = False
try:
    save()
    for p,data in changes.items():
        target=path(p);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        os.chmod(target,backup[p][1] if backup[p] is not None else 0o644)
    run_receipt['candidateCompileExit'] = compile_sources('candidate-compile')
    save()
    if run_receipt['candidateCompileExit'] != 0:
        raise RuntimeError('Compilation failed; this is never assertion red')
    if args.phase == 'freeze':
        success = True
        for suffix in ['b01','b02','b03']:
            if not run(args.label+'-'+suffix,sets[suffix],suffix=='b03'):
                success = False
                break
    else:
        success = run(args.label,[N])
    run_receipt['proofAfterRuns'] = {p:digest(p) for p in proof}
    if run_receipt['proofAfterRuns'] != proof:
        success = False
        raise RuntimeError('Original proof file changed during unit')
finally:
    keep = (args.phase=='freeze' and args.keep_successful_freeze_unit and success)
    if not keep:
        restored={}
        for p,prior in backup.items():
            # A write outside the declared root freeze is not ours to overwrite.
            if digest(p) != sha(changes[p]):
                restored[p]={'restored':False,'unexpectedConcurrentEdit':True}
                continue
            if prior is None:
                path(p).unlink()
            else:
                path(p).write_bytes(prior[0]);os.chmod(path(p),prior[1])
            restored[p]={'restored':digest(p)==(sha(prior[0]) if prior else None),
                'sha256':digest(p),'mode':oct(path(p).stat().st_mode&0o777) if path(p).exists() else None}
        run_receipt['sourceRestore']=restored
        if all(x['restored'] for x in restored.values()):
            run_receipt['originalCompileExit']=compile_sources('original-compile')
        success = success and all(x['restored'] for x in restored.values()) and run_receipt['originalCompileExit']==0
    run_receipt['keptSuccessfulFreezeUnit']=keep
    run_receipt['status']='TERMINAL_UNASSESSED'
    run_receipt['notLaneExitOrQAApproval']=True
    save()
# Red and mutant outcomes are intentionally never inferred from an arbitrary nonzero code.
# The caller reviews fresh XML and case-specific failure lines using verification.md.
raise SystemExit(0 if success else 1)
