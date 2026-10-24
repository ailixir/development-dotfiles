"""Only prepared source03 metadata; no runtime or native operations."""
from pathlib import Path
import ast,hashlib,json
P=Path(__file__).absolute().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(n,v): (P/n).write_text(json.dumps(v,indent=2)+'\n')
source=json.loads((P/'source-binding.json').read_text())
schema=json.loads((P/'public-observation.schema.json').read_text()); schema['properties']['schemaVersion']['const']=2
schema['required']=list(dict.fromkeys(schema['required']+['networkAccounting']))
props={k:{'type':'boolean'} for k in ('workerStarted','requestCompleted','deadlineExceeded','callerInterrupted')}
props.update({k:dict(type='integer',minimum=0,maximum=cap) for k,cap in [('acquiredSockets',2),('successfulSocketCloses',2),('connectCalls',1),('requestStarts',1)]})
props['workerTermination']=dict(type='string',enum=['NOT_STARTED','TERMINATED','UNRESOLVED'])
props['networkCompletionElapsedNs']=dict(type=['integer','null'],minimum=0,maximum=14000000000)
schema['properties']['networkAccounting']=dict(type='object',additionalProperties=False,required=list(props),properties=props)
schema['x-strict-collector']='public_contract.validate_record additionally enforces exact type/network cross-field invariants. Root relay receipt/control/native drain mandatory; schema alone cannot qualify.'
put('public-observation.schema.json',schema)
policy=json.loads((P/'public-policy.json').read_text()); policy['schemaVersion']=2
policy.pop('httpTimeoutSeconds',None)
policy.update(observationEnvelopeSeconds=15,workBudgetSeconds=12,networkTerminationBudgetSeconds=14)
policy['transport']='ONE_EXPLICIT_NUMERIC_LOOPBACK_SOCKET_TLS_GET_NO_RETRY'
policy['durableWriter']='ROOT_ONLY_FD_CUSTODIED_DATA_ACK_COMMIT_RELAY'
policy['nativeValidation']='UNEXECUTED_REQUIRED_SEPARATE_AUTHORIZATION'
policy['controlDelivery']='two exact child environment values, canonical base64url control and SHA256; no arbitrary file/JavaToolOptions'
put('public-policy.json',policy)
ns={'__name__':'_metadata_only_source03'};exec(compile((P/'public_observation_unit.py').read_bytes(),'<metadata-only-definitions>','exec'),ns)
a=json.loads((P/'runtime-root-release.template.json').read_text())
a.update(postimageSha256=source['postimageSha256'],candidateSourceDigest=source['candidateVirtualWholeSourceDigest'],controlMembers=sorted(ns['CONTROL_MEMBERS']),
 installedPlatformQualificationReviewed=False,auxiliaryNamespaceActuallyAuthorized=False,observerControlSha256=None,launchControlBase64=None,
 relayCustody={'ownerUid':None,'outputChain':None,'shortParentChain':None,'createShortExactly0700':False})
a['reviewRecords'].update(platformQualification={'path':None,'sha256':None},auxiliaryNamespaceRoot={'path':None,'sha256':None})
a['artifactPins']={n:sha((P/n).read_bytes()) for n in sorted(ns['ARTIFACTS'])}
a['adapterSha256']=a['artifactPins']['public_observation_unit.py'];a['guardSha256']=a['artifactPins']['guard-public-observe.bash']
a['collectorProvenance'].update(observerPostimageSha256=a['postimageSha256'],schemaSha256=a['artifactPins']['public-observation.schema.json'],collectorSha256=a['artifactPins']['public_contract.py'])
put('runtime-root-release.template.json',a)
control=dict(schemaVersion=1,protocolVersion=2,unit='obs011-t0-c8-public-error-observe01',**{'class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'},method='actualPublishedWrongPasswordAnnotatesEarlierSecretFill',
 amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath='/private/tmp/obs011-pub-observe01/r.sock',enrollmentNonce=None,
 workBudgetNs=12000000000,networkBudgetNs=14000000000,totalBudgetNs=15000000000,bodyByteCap=262144,headerByteCap=16384,chunkLineByteCap=128,trailerByteCap=8192,frameByteCap=16384,ackByteCap=256,commitByteCap=512)
put('launch-control.template.json',control)
print('Updated inert source03 schema/policy/control/release metadata')
