"""Source-only synchronized embeds/templates. No live input is followed."""
import ast,hashlib,json
from pathlib import Path
H=Path(__file__).absolute().parent;O=H.parent/'resume4';T=H.parents[2];R=next(p for p in H.parents if p.name=='ui-studio')
def sha(b):return hashlib.sha256(b).hexdigest()
def load(n):return json.loads((H/n).read_bytes())
def put(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
k=load('contract.json')
k['priorNamespaces'][1]['directory']['path']=str(R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition02')
k['priorIndexPins']={str(T/'resume2-gateway80-failed-resource-code02-negative-failed-index.json'):'8b1f8f9be540788d05b66923fd7fc60c7d9df19f254868dacde87d0819db8761',str(T/'resume2-gateway80-source04-n02-frozen-code-control-index.json'):'64775b9a524c86ea7ed8b061b11c603042f8bcf827b41a58634b0e403c4fab36'}
k['authorityAllowedFields']=sorted(set(load('authorization.template.json'))|{'kind','binaryHashes','binaryModes','binaryWitnesses'})
common={'authorizedBy','role','mode','releaseSha256','subjectHoldSha256','oldIndexSha256','credit','cleanup','retainedFailure','inputPins','typedRoleBinding','typedActorRosterComplete','typedPriorActors','typedActorEvidencePins'}
controls={}
for n in ['setup-ownership.template.json','negative-status.template.json','guard-admission.template.json','archive-decision.template.json','actual-review-adoption.template.json','close-permit.template.json','wrapper-result.template.json']:
    v=load(n);fields=set(v)|common
    if v['role']=='FAILED_GUARD_ADMISSION':fields|={'requestedLaunch','requestedLaunchOperatorTrace'};fields-={'configuredLaunch','configuredLaunchOperatorTrace'}
    if v['role']=='SETUP_OWNERSHIP_ADMISSION':fields|={'successfulSetupHelpers'};fields.discard('helpers')
    controls[v['role']]=sorted(fields)
k['controlAllowedFields']=controls
put('contract.json',k)
# Add only independently sanitized in-memory metadata to the already closed sink.
p=H/'protocol.py';s=p.read_text();s=s.replace('finalizationOwner=self.finalizer_label,namespaceCreation=self.namespace_state)','finalizationOwner=self.finalizer_label,namespaceCreation=self.namespace_state,selfText=getattr(owner,"provisional_self_text",None) if owner is not None else None)')
registry=json.loads((O/'source-reason-registry.json').read_bytes())['registries']
def reasons(text):
    found=set()
    for n in ast.walk(ast.parse(text)):
        if isinstance(n,ast.Call):
            f=ast.unparse(n.func);i=1 if f in ('need','P.need','require') else 0 if f.endswith(('Hold','ValueError')) else None
            if i is not None and len(n.args)>i and isinstance(n.args[i],ast.Constant) and type(n.args[i].value)is str:found.add(n.args[i].value)
    return found
for n in ('protocol.py','failed_gateway.py','factory.py','installer.py'):registry['PROTOCOL_HOLD']=sorted(set(registry['PROTOCOL_HOLD'])|reasons((H/n).read_text()))
for n in ('entry.py','install-cli.py'):registry['BOOTSTRAP_VALUE_ERROR']=sorted(set(registry['BOOTSTRAP_VALUE_ERROR'])|reasons((H/n).read_text()))
a=s.index('STAGES=');b=s.index('\nREASON_REGISTRY=',a);oldstages=ast.literal_eval(s[a+7:b]);stages=tuple(dict.fromkeys([*oldstages,'N02_CUSTODY','N02_MEMBERSHIP','SELF_TEXT_VALIDATION','TYPED_OWNER_RULINGS','PRIOR_N02_CUSTODY']))
s=s[:a]+'STAGES='+repr(stages).replace("'",'"')+s[b:]
a=s.index('REASON_REGISTRY=');b=s.index('\nclass BootstrapValueError',a);s=s[:a]+'REASON_REGISTRY='+repr(registry).replace("'",'"')+s[b:];p.write_text(s)
block=s[s.index('STAGES='):s.index('# END SINGLE OUTER FAILURE SINK')]
def renamed(v):
    for a,b in [('failed-red-resource-disposition02','failed-red-resource-disposition03'),('gateway80_failed_red03_','gateway80_failed_red04_'),('gateway80_fr03_','gateway80_fr04_'),('GATEWAY_FR03_','GATEWAY_FR04_'),('gateway80-fr03-root-install01','gateway80-fr04-root-install01'),('gateway80-failed-red-resource-prep/resume4','gateway80-failed-red-resource-prep/resume5'),('code04-exact-review','code05-exact-review'),('SOURCE04','SOURCE05'),('source04','source05'),('N02_CUSTODY','N03_CUSTODY'),('N02_MEMBERSHIP','N03_MEMBERSHIP')]:v=v.replace(a,b)
    return v
for n in ('guard-failed-red.bash','install-loader.bash'):
    p=H/n;v=renamed((O/n).read_text());a=v.index('STAGES=');b=v.index('\ndef require(ok):',a);v=v[:a]+block+v[b:];p.write_text(v)
p=H/'install-cli.py';v=p.read_text();a=v.index('# CLOSED_FAILURE_BLOCK_START');b=v.index('# CLOSED_FAILURE_BLOCK_END',a);p.write_text(v[:a]+'# CLOSED_FAILURE_BLOCK_START\n'+block+v[b:])
# The new per-phase root memory argument closes the last-author recursion without
# a further writer. It is an actor attestation, never an observed wait or image.
p=H/'guard-failed-red.bash';g=p.read_text()
g=g.replace('[[ "$#" == 1 && "${GATEWAY_FR04_SETUP_SHA-}" =~ ^[0-9a-f]{64}$ ]]','[[ "$#" == 1 && "${GATEWAY_FR04_SETUP_SHA-}" =~ ^[0-9a-f]{64}$ && "${GATEWAY_FR04_SETUP_COMPLETION_SHA-}" =~ ^[0-9a-f]{64}$ ]]')
g=g.replace('set -- "$1" "$GATEWAY_FR04_SETUP_SHA"','set -- "$1" "$GATEWAY_FR04_SETUP_SHA" "$GATEWAY_FR04_SETUP_COMPLETION_SHA" "$GATEWAY_FR04_SETUP_COMPLETION_BUFFER"')
g=g.replace('  "$GATEWAY_FR04_PYTHON" -B -c', '  [[ "$#" == 4 && "$2" =~ ^[0-9a-f]{64}$ && "$3" =~ ^[0-9a-f]{64}$ ]] || return 1\n  "$GATEWAY_FR04_PYTHON" -B -c')
g=g.replace('path,expected,mode,authority,*control=sys.argv[1:]\n require(len(control)==1)','path,expected,mode,authority,control,completion_sha,completion_buffer=sys.argv[1:]\n require(type(completion_buffer)is str and len(completion_buffer)<=65536)\n completion_raw=completion_buffer.encode("utf-8","strict")\n require(len(completion_raw)<=65536 and hashlib.sha256(completion_raw).hexdigest()==completion_sha)')
g=g.replace('status=ns["execute"](mode,authority,control[0] if control else None,failure_sink=sink)','status=ns["execute"](mode,authority,control,failure_sink=sink,completion_raw=completion_raw,completion_sha=completion_sha)')
g=g.replace('[[ "$1" == \'1\' && "$#" -le 2 ]]','[[ "$1" == \'1\' && ( "$#" == 1 || "$#" == 4 ) ]]')
g=g.replace('if gateway80_failed_red04_invoke gate "$2"; then','if gateway80_failed_red04_invoke gate "$2" "$3" "$4"; then')
g=g.replace('[[ "$#" == 1 && "$1" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR04_SETUP_SHA-}" ]]','[[ "$#" == 3 && "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR04_SETUP_SHA-}" ]]')
g=g.replace('readonly GATEWAY_FR04_SETUP_SHA="$1"','readonly GATEWAY_FR04_SETUP_SHA="$1"\n  readonly GATEWAY_FR04_SETUP_COMPLETION_SHA="$2"\n  readonly GATEWAY_FR04_SETUP_COMPLETION_BUFFER="$3"')
p.write_text(g);(H/'binding-functions.bash').write_text(g)
(H/'bind-command.template.bash').write_text('# INERT: RECIPE05.md supplies exact separate-status/readonly-buffer steps.\n'+g)
put('source-reason-registry.json',dict(kind='SOURCE05_CLOSED_LITERAL_REASON_REGISTRY',registries=registry,stages=stages,oldReasonBackfill=False))
binding=dict(kind=k['typedRoleContract']['kind'],legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,roleContractSha256=sha(json.dumps(k['typedRoleContract'],sort_keys=True,separators=(',',':'),allow_nan=False).encode()),typedOwnerRecordPins={p:None for p in k['typedOwnerPaths'].values()},newCodeRecordPins={str(T/p):None for p in ('early/gateway80-failed-red-resource-prep/resume5/manifest.json','resume-architecture/resume2/gateway80-failed-red-resource-code05-exact-review/manifest.json','qa/gateway80-failed-red-resource-code05-exact-review/manifest.json')})
for p in H.glob('*.template.json'):
    if p.name in ('authorization.template.json','root-candidate.template.json','install-scope.template.json','owner-decisions.template.json') or p.name.startswith('owner-ruling-'):continue
    v=json.loads(p.read_bytes());v['typedRoleBinding']=binding;v['typedActorRosterComplete']=False;v['typedPriorActors']=k['knownPostBaseActors'];v['typedActorEvidencePins']=k['typedMetadataPins'];put(p.name,v)
admission=load('guard-admission.template.json')
for old,new in [('configuredLaunch','requestedLaunch'),('configuredLaunchOperatorTrace','requestedLaunchOperatorTrace')]:
    if old in admission:admission[new]=admission.pop(old)
put('guard-admission.template.json',admission)
setup=load('setup-ownership.template.json');setup['successfulSetupHelpers']=setup.pop('helpers',[]);setup['bindingBufferSha256']=sha(g.encode());setup['bindingBufferBytes']=len(g.encode());put('setup-ownership.template.json',setup)
for n in ('authorization.template.json','root-candidate.template.json'):
    a=load(n);a['priorNamespaces']=k['priorNamespaces'];put(n,a)
scope=load('install-scope.template.json');scope['candidate']=load('root-candidate.template.json')
for name in ('codePins','newCodeRecordPins','typedOwnerRecordPins','binaryHashes','binaryModes','binaryWitnesses'):scope['candidate'].pop(name,None)
put('install-scope.template.json',scope)
put('completion-attestation.template.json',dict(kind='ROOT_OPERATOR_ATTESTATION',unit=k['subject']['label'],controlSha256=None,roleContractSha256=binding['roleContractSha256'],readonlyBuffer=False,separatelyCaptured=False,actors=[]))
put('completion-author-row.template.json',dict(pid=None,ppid=None,kind='EXTERNAL_ROOT_CONTROL_AUTHOR',start=None,argvHash=None,fullFingerprint=None,completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus=None,directWaitClaimed=False,qualified=False,requiredDisposition='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence='CURRENT_SHA_PINNED_CONTROL_PATH_NO_SELF_HASH'))
schema=load('control-schema.json');schema.update(typedRoleBinding=binding,typedOwnerPaths=k['typedOwnerPaths'],priorNamespaces=k['priorNamespaces'],knownPostBaseActors=k['knownPostBaseActors'],lastAuthor='Control retains null completion; exact separately captured ROOT_OPERATOR_ATTESTATION readonly SAME argv buffer fills ONLY pending completion. No further writer/probe, Popenwait/image or self-completion. Every later phase rebinds current raw controlSHA and all still-null immutable setup/control rows. Wrong/unknown/extra/duplicate/conflicting/precompletion status HOLD.',successfulSetupHelpers='Separate strict actual foreground0 helper rows; historical failed/external/metadata actors never coerced into helper0.',actualGuardArgumentShape='invoke MODE CONTROL_SHA COMPLETION_SHA SAME_READONLY_COMPLETION_BUFFER; negative exit1 uses separately bound setupSHA+completionSHA+buffer; gate exit1 PERMIT_SHA COMPLETION_SHA BUFFER',actualScopeOrPolicy=False);put('control-schema.json',schema)
print(json.dumps(dict(status='SOURCE05_EMBEDS_AND_TEMPLATES_ONLY',actualTargetOperations=0)))
