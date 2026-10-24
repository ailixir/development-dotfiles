"""Prepared C8 producer; future explicit release invocation only; never grants permit or exit."""
from pathlib import Path
import hashlib,importlib.util,json,os,re,sys,time

def main():
    if len(sys.argv)!=3 or re.fullmatch('[0-9a-f]{64}',sys.argv[1]) is None:
        raise SystemExit('HOLD: exact root release SHA and held-shell PID required')
    here=Path(__file__).resolve().parent;unit=here.parent
    if here.name!='control' or re.fullmatch(r'obs011-t0-c8-check\d{2}',unit.name) is None:
        raise SystemExit('HOLD: future reviewed installation required')
    if unit.parent!=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime'):
        raise SystemExit('HOLD: runtime root mismatch')
    release_bytes=(unit/'root-actual-unit-release.json').read_bytes()
    if hashlib.sha256(release_bytes).hexdigest()!=sys.argv[1]:
        raise SystemExit('HOLD: root binding mismatch')
    release=json.loads(release_bytes)
    for rel in ('control/unlock_gate.py','control/final_verifier.py'):
        if hashlib.sha256((unit/rel).read_bytes()).hexdigest()!=release['controlPackagePins'][rel]:
            raise SystemExit('HOLD: reviewed control code mismatch')
    # Code is immutable; root pins this producer+gate in the explicit release (no hash cycle).
    spec=importlib.util.spec_from_file_location('c8_reviewed_gate',here/'unlock_gate.py')
    g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
    b=g.load_packet(sys.argv[1],load_ready=False);r=b['release'];p=b['policy'];request=b['closureInput']
    requested=request['expectedWrapperExit'];b['requested']=requested
    outcome=b['proofs']['assessment']['validationOutcome'];green=outcome=='PASS'
    phase='full-check' if green else 'compile-reconcile'
    phase_state={'full-check':'TERMINAL','compile-reconcile':'NOT_STARTED' if green else 'TERMINAL'}
    owned=set();gaps=set(request['manualGaps'])
    for receipt in b['receipts'].values():
        owned|=g.identities(receipt['ownedIdentities'])
        for key in p['gapKeys']:
            if receipt.get(key,False):gaps.add(key)
    if b['proofs']['assessment']['evidenceErrors'] or b['executionErrors'] or any(x['evidenceErrors'] or x.get('interrupted',False) or x.get('sourceObservationGap',False) for x in b['receipts'].values()):
        gaps.add('resourceObservationGap')
    ready={'protocol':'C8_UNLOCK_V1','unitLabel':r['label'],'rootReleaseSha256':b['releaseSha'],'activeLockSha256':b['activeSha'],
        'status':'QUALIFIED_VERIFIED' if gaps else 'VERIFIED','verificationExit':0,
        'verifiedAtEpoch':time.time(),'expectedWrapperExit':requested,'retroactiveRepairClaim':False,
        'historicalGapCodes':r['unlockGuard']['historicalGapCodes'],'phaseState':phase_state,
        'evidencePins':b['evidenceHashes'],
        'source':{'disposition':'UNCHANGED_ACCEPTED_SUCCESSOR','digest':g.SOURCE,'overrides':{},'expectedPlanSha256':r['expectedPlanSha256']},
        'build':{'phase':phase,'exit':0,'sourceDigest':g.SOURCE,'provenanceSha256':b['evidenceHashes'][phase+'/build-provenance.json']},
        'validation':g.validation_record(b),
        'resources':{'foregroundTerminal':True,'recordedSetComplete':True,'extraOwned':[],
            'recordedOwned':[{'pid':pid,'start':start} for pid,start in sorted(owned)],'ownedPorts':request['ownedPorts']},
        'manualGaps':request['manualGaps'],'gaps':sorted(gaps),'producerSha256':g.digest(g.safe_bytes(Path(__file__)))}
    b['ready']=ready
    g.ready_requirements(b,requested)
    live=g.observe(b,int(sys.argv[2]));g.current_observation_requirements(b,live)
    # All proof and current checks precede either output. Never overwrite/retry stale outputs.
    g.need(not (unit/'final-resource-boundary.json').exists() and not (unit/'preunlock-verification.json').exists(),'FINAL_OUTPUT_ALREADY_EXISTS')
    ready['verifiedAtEpoch']=time.time()
    def new(name,value):
        with (unit/name).open('x') as f:json.dump(value,f,indent=2);f.write('\n')
        os.chmod(unit/name,0o600)
    new('final-resource-boundary.json',live['boundary'])
    ready['resourceBoundarySha256']=g.digest(g.safe_bytes(unit/'final-resource-boundary.json'))
    new('preunlock-verification.json',ready)
    print(json.dumps({'verificationExit':0,'readinessSha256':g.digest(g.safe_bytes(unit/'preunlock-verification.json')),
        'sourceDigest':g.SOURCE,'validationOutcome':outcome,'expectedWrapperExit':requested,
        'gapsPreserved':sorted(gaps),'recordedOwnedCount':len(owned),'permitWritten':False,'exitInvoked':False,'C8Credit':False}))
    return 0
if __name__=='__main__':
    try:code=main()
    except BaseException:
        print(json.dumps({'verificationExit':1,'status':'HOLD','shellMustRemainHeld':True,'permitWritten':False,'exitInvoked':False,'C8Credit':False}));code=1
    sys.exit(code)
