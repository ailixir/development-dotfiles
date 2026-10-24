"""One finite public pin/AST/document batch. No subject import/function/API executes."""
from pathlib import Path
import ast,hashlib,json,stat
HERE=Path(__file__).absolute().parent
T0=HERE.parents[2]
PINS=[];CHECKS=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def read(path,expected=None):
    data=path.read_bytes();info=path.stat();digest=hashlib.sha256(data).hexdigest()
    if expected is not None:check('SHA_'+str(path),digest==expected)
    PINS.append(dict(path=str(path),sha256=digest,bytes=len(data),mode=stat.S_IMODE(info.st_mode)))
    return data
def packet(path,expected=None):
    doc=json.loads(read(path/'manifest.json',expected))
    for row in doc.get('files',doc.get('members')):
        p=path/row['path'];data=read(p,row['sha256']);mode=row['mode']
        if type(mode) is str:mode=int(mode,0) if mode.startswith('0o') else int(mode,8)
        check('BYTES_'+str(p),len(data)==row['bytes']);check('MODE_'+str(p),stat.S_IMODE(p.stat().st_mode)==mode)
    return doc
J=T0/'early/c8-public-observer-java-qualification-prep/resume2'
B=T0/'early/c8-check01-public-evidence-prep/resume6'
G=T0/'early/gateway80-proof-prep/resume9'
packets=[(J,'5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f'),
 (T0/'qa/c8-public-observer-java-qualification-source02-exact-review','4eaeff5ae3ff969dcceecbfa6ad38381fc1b90ed7d1a22a1a69b65591b7a714e'),
 (T0/'resume-architecture/resume2/c8-public-observer-java-qualification-source02-exact-review','3e2218940f7b189f2cb2eee709f332b38125b5bdc2af9fc797022609e5cc9a2c'),
 (B,'b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1'),
 (T0/'qa/c8-public-observer-source06-exact-review','8f53da49d167dbf13c391dc2c90e3615b9445cb9db6e39f9cabcb99c98c23ea2'),
 (T0/'resume-architecture/resume2/c8-public-observer-source06-exact-review','c334a8113638ed3b1628340e9c8d7231982a498f7ab92266904fac81d5bb7ca4'),
 (G,'1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7')]
for path,digest in packets:packet(path,digest)
roots=[('resume2-c8-java-qualification-source02-exact-source-root-adoption.json','18f7cc159d785cd46d2f20ec0367e34e5e1a18065363ba71bd41148c583e44e1'),
 ('resume2-c8-public-observer-source06-exact-source-root-adoption.json','710fb946333f8403bcd64d2ac4c274d337bc21747b21bc419c5656a76700ab16'),
 ('resume2-gateway-source09-local-profile-owner-rulings-root-adoption.json','d164bfb90d309475be1bc4a74fd9eedb82970fffc7f86310d5a2bcb086e45af6'),
 ('resume2-gateway-source09-owner-ruling-root.json','e805fd684cfa9905aa552f40a342d3c6183ae67c466677856eec6bad87742d90')]
for name,digest in roots:read(T0/name,digest)
owner=json.loads((T0/roots[-1][0]).read_bytes())
for role,pin in owner['independentCodeReviewPins'].items():
    record=Path(pin['path']);read(record,pin['sha256'])
    # Exact already-selected review package, not filename search. Its complete manifest
    # verifies payloads; the owner-root's literal review-record SHA is the trust anchor.
    packet(record.parent)
for role,pin in owner['independentOwnerPolicyPins'].items():
    record=Path(pin['path']);read(record,pin['sha256'])
    expected={'Aria':'308c8593ed14da145df1e2c0fe8a0f1ad3add38a43db67a68d311477b8f6f12a','Quinn':'b03a62e94db0ae379433f853f4fe966717fecaaedf19327ff79ae16aaebe93a9'}[role]
    packet(record.parent,expected)

selectors={
 J/'qualification_controller.py':['native_projection','mode_evidence','identity','PeerBinding.bind','PeerBinding.__call__','Invocation.invoke','Invocation.setup_receiver','Invocation.launch','Invocation.receive_native','Invocation.confirm_native','Invocation.cleanup_owned','Invocation.snapshot'],
 J/'entry_loader.py':['Load.read','Load.load'],
 B/'public_observation_unit.py':['System.process_identity','Effects.fingerprint','Effects.table','Effects.relay_peer','Effects.run_owned','Effects.collect_public','Effects.current','Effects.release_custody'],
 B/'public_relay.py':['peer_credentials','Relay.validate_data','Relay.validate_commit','Relay.start','Relay.serve','Relay.stop'],
 B/'public_contract.py':['relay_qualified','collect_records','validate_record'],
 B/'unit_policy.py':['authority','current','Controller.selected','Controller.restore','Controller.compile_restored','Controller.final','Controller.gate','Controller.postclose'],
 G/'runtime.py':['Ownership.acquire','Ownership.close','Ownership.finish','Files.read','Files.copy','authorization_factory','validate_operation_entry_state','qualify_controller_lock','legacy_identity','sample','remember_relevance','restore_sample_history','run_native','native_wait','Context.native_snapshot','Context.emit_native_fallback','final_operation','gate_operation','postclose_operation'],
 G/'entry.py':['bootstrap_read','launch','execute_context']}
locations=[]
for path,names in selectors.items():
    raw=path.read_bytes();tree=ast.parse(raw);found={}
    for node in tree.body:
        if isinstance(node,ast.FunctionDef):found[node.name]=node
        if isinstance(node,ast.ClassDef):
            for method in node.body:
                if isinstance(method,ast.FunctionDef):found[node.name+'.'+method.name]=method
    for name in names:
        check('MAPPED_DEFINITION_'+name,name in found)
        node=found[name];locations.append(dict(path=str(path),sha256=hashlib.sha256(raw).hexdigest(),name=name,line=node.lineno,endLine=node.end_lineno))

claims=json.loads((HERE/'claim-and-mode-map.json').read_bytes());dag=json.loads((HERE/'task-dag.json').read_bytes());methods=json.loads((HERE/'method-map.json').read_bytes())
check('UNADOPTED_ONLY',claims['profileAuthorized'] is False and claims['actualEvidenceAccepted'] is False and dag['implementationSelected'] is False)
check('TEN_FALSE',len(claims['guarantees'])==10 and all(value is False for value in claims['guarantees'].values()))
check('SIX_NULL_UNSUPPORTED',len(claims['unsupportedEvidence'])==6 and all(x['value'] is None and type(x['reason']) is str for x in claims['unsupportedEvidence'].values()))
check('NO_COMPLETE_IDENTITY_FROM_SAMPLES',claims['identityComplete'] is False and claims['kernelIdentityComplete'] is False)
check('NO_PROPOSED_CURRENT_BUSINESS_ACCEPTANCE',claims['business06']['status']=='NO_ACCEPTANCE_BRIDGE_ESTABLISHED' and claims['business06']['ordinaryGateSatisfied'] is False)
check('NINE_MODES',len(claims['modeRows'])==9 and {x['mode'] for x in claims['modeRows']}=={'parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'})
check('ALL_ACTUAL_MODES_OWED',all(x['actual'].startswith('UNEXECUTED_OWED') for x in claims['modeRows']))
check('NO_CREDIT_OR_CLEANUP',claims['C8'] is False and claims['credit'] is False and claims['cleanupAuthorized'] is False and claims['sourceWrites']==[])
ids={node['id'] for node in dag['nodes']}
check('FINITE_DAG_UNIQUE',len(ids)==len(dag['nodes']))
done=set()
while len(done)<len(ids):
    ready={node['id'] for node in dag['nodes'] if set(node['depends'])<=done}
    check('DAG_HAS_PROGRESS_'+str(len(done)),bool(ready-done));done|=ready
check('NO_NODE_AUTHORITY',all(node['authorityNow'] is False for node in dag['nodes']))
check('THIRTEEN_CONCRETE_BOUNDARIES',len(methods['rows'])==13 and all(type(x['owed']) is str and len(x['owed'])>30 for x in methods['rows']))
text=(HERE/'design.md').read_text()
for phrase in ('directly owned-child','SELECTED_WORKER_BINDING_UNPROVED','main-mapped','Order17/default4000','Replayb8/wholef9','ordinary interface cannot return admissionTrue'):
    check('DESIGN_REQUIRED_'+phrase,phrase in text)
for path in HERE.iterdir():
    check('OUTPUT_ONLY_OWN_DIRECTORY',path.parent==HERE)
(HERE/'input-pins.json').write_text(json.dumps(PINS,indent=2)+'\n')
(HERE/'source-locations.json').write_text(json.dumps(locations,indent=2)+'\n')
(HERE/'checks.json').write_text(json.dumps(dict(kind='FINITE_CONSUMER_INTEGRATION_DESIGN_CHECKS',passed=len(CHECKS),failed=0,checks=CHECKS,subjectFunctionsExecuted=0,actualRuntimeActions=0),indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),inputPinRecords=len(PINS),mappedDefinitions=len(locations),targetExecutions=0,actualActions=0)))
