"""Prepared separate postclose check; never invoked by guard or preparation."""
from pathlib import Path
import ast,errno,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys

def main():
    if len(sys.argv)!=2 or re.fullmatch('[0-9a-f]{64}',sys.argv[1]) is None:raise SystemExit('HOLD: explicit root binding required')
    here=Path(__file__).resolve().parent;unit=here.parent
    expected_parent=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime')
    if here.name!='control' or unit.parent!=expected_parent or re.fullmatch(r'obs011-t0-c8-check\d{2}',unit.name) is None:raise SystemExit('HOLD: installation')
    data=(unit/'root-actual-unit-release.json').read_bytes()
    if hashlib.sha256(data).hexdigest()!=sys.argv[1]:raise SystemExit('HOLD: root binding')
    release=json.loads(data)
    for rel in ('control/unlock_gate.py','control/postclose.py'):
        if hashlib.sha256((unit/rel).read_bytes()).hexdigest()!=release['controlPackagePins'][rel]:raise SystemExit('HOLD: code binding')
    spec=importlib.util.spec_from_file_location('c8_postclose_gate',here/'unlock_gate.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
    b=g.load_packet(sys.argv[1]);requested=b['ready']['expectedWrapperExit'];owned,_,_=g.requirements(b,requested)
    exit_path=unit/'guarded-exit-result.json';result=json.loads(g.safe_bytes(exit_path))
    g.need(result['rootReleaseSha256']==sys.argv[1] and result['activeLockSha256']==b['activeSha']
           and result['readinessSha256']==b['readinessSha']
           and result['permitSha256']==g.digest(g.safe_bytes(unit/'unlock-permit.json'))
           and type(result['actualWrapperExit']) is int and result['actualWrapperExit']==requested,'ACTUAL_GUARDED_EXIT')
    tree=ast.parse(g.safe_bytes(g.CORE).decode());names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
    nodes=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name in names]
    scope={};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned-postclose-observation>','exec'),scope);scope['ROOT']=g.ROOT
    rows=scope['table']();pin=b['pin'];controllers={(pin['wrapperPid'],pin['wrapperStart']),(pin['shellPid'],pin['shellStart'])}
    g.need(all(rows.get(pid,{}).get('start')!=start for pid,start in owned|controllers),'OWNED_OR_CONTROLLER_STILL_LIVE')
    g.need(g.observe_source(b,scope)==g.SOURCE,'CURRENT_ACCEPTED_SOURCE')
    base=json.loads(g.safe_bytes(g.PLAN));boundary=scope['boundary_inventory'](base)
    g.need(len(boundary['inheritedMatched'])==6 and not any(boundary[k] for k in ('inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts')),'POSTCLOSE_BOUNDARY')
    lock=g.WRAPPER.with_name('gradle.lock');fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd);g.need([info.st_dev,info.st_ino]==pin['lockDevInode'],'LOCK_IDENTITY_CHANGED')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as e:raise g.Hold('KERNEL_NOT_FREE') from e
        else:fcntl.flock(fd,fcntl.LOCK_UN)
    finally:os.close(fd)
    proof={'status':'POSTCLOSE_OBSERVED','rootReleaseSha256':sys.argv[1],'guardedExitResultSha256':g.digest(g.safe_bytes(exit_path)),
           'sourceDigest':g.SOURCE,'recordedOwnedAbsentOrReused':len(owned),'controllersAbsentOrReused':2,'inheritedMatched':6,'kernelFree':True,
           'historicalGapCodes':b['ready']['historicalGapCodes'],'validationOutcome':b['ready']['validation']['outcome'],'C8Credit':False}
    with (unit/'postclose-resource-check.json').open('x') as f:json.dump(proof,f,indent=2);f.write('\n')
    os.chmod(unit/'postclose-resource-check.json',0o600);print(json.dumps(proof));return 0
if __name__=='__main__':
    try:code=main()
    except BaseException:print(json.dumps({'status':'POSTCLOSE_UNPROVEN','C8Credit':False}));code=1
    sys.exit(code)
