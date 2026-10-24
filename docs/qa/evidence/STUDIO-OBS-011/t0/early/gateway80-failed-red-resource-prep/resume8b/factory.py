"""Reviewed pure source03 authorization preflight/finalize; no effects/import fallthrough."""
from pathlib import PurePosixPath
import copy

def canonical(path):
    return type(path)is str and path.startswith('/') and str(PurePosixPath(path))==path and '..' not in PurePosixPath(path).parts and '\x00' not in path

def graph(base,k):
    P.need(type(base)is dict,'FACTORY_BASE_TYPE');P.authority_shape(base,k)
    P.need(type(base.get('newDirectoryPins'))is dict and base['newDirectoryPins']=={} and base.get('rootInputPins')=={},'FACTORY_NO_PRECREATE_N_FACT')
    P.need(base.get('externalPins')=={str(R/path):h for path,h in k['externalSourcePins'].items()},'FACTORY_EXTERNAL_GRAPH')
    P.need(base.get('priorNamespaces')==k['priorNamespaces'] and base.get('oldIndexSha256')==k['frozenEvidence']['terminalIndexSha256'],'FACTORY_PRIOR_AND_INDEX')
    expected={str(R/'docs/qa/evidence/STUDIO-OBS-011/t0'/p) for p in ('early/gateway80-failed-red-resource-prep/resume8b/manifest.json','resume-architecture/resume2/gateway80-failed-red-resource-code08b-exact-review/manifest.json','qa/gateway80-failed-red-resource-code08b-exact-review/manifest.json')}
    P.need(base.get('exactIndependentCodeReviewsQualified') is True and type(base.get('newCodeRecordPins'))is dict and set(base['newCodeRecordPins'])==expected and all(P.pin(h) for h in base['newCodeRecordPins'].values()),'FACTORY_EXACT_SOURCE_REVIEWS')
    P.typed_authority(base,k)
    return P.binary_requirements(base,k)

def validate(candidate,k,code_buffers,witnesses,records,physical=None):
    P.authority(candidate,k)
    P.need(type(code_buffers)is dict and set(code_buffers)==set(k['installedCode']) and all(type(raw)is bytes and P.sha(raw)==candidate['codePins'][name] for name,raw in code_buffers.items()),'FACTORY_EXACT_SIX_BUFFERS')
    P.need(candidate.get('externalPins')=={str(R/path):h for path,h in k['externalSourcePins'].items()},'FACTORY_EXTERNAL_GRAPH')
    P.need(candidate.get('rootInputPins')=={},'FACTORY_NO_FUTURE_CONTROL_CYCLE')
    P.need(candidate.get('priorNamespaces')==k['priorNamespaces'] and candidate.get('oldIndexSha256')==k['frozenEvidence']['terminalIndexSha256'],'FACTORY_PRIOR_AND_INDEX')
    expected_records={str(R/'docs/qa/evidence/STUDIO-OBS-011/t0'/p) for p in ('early/gateway80-failed-red-resource-prep/resume8b/manifest.json','resume-architecture/resume2/gateway80-failed-red-resource-code08b-exact-review/manifest.json','qa/gateway80-failed-red-resource-code08b-exact-review/manifest.json')}
    P.need(candidate.get('exactIndependentCodeReviewsQualified') is True and type(candidate.get('newCodeRecordPins'))is dict and set(candidate['newCodeRecordPins'])==expected_records and all(P.pin(h) for h in candidate['newCodeRecordPins'].values()),'FACTORY_EXACT_SOURCE_REVIEWS')
    P.need(type(records)is dict and set(records)==expected_records|set(k['typedOwnerPaths'].values()) and all(type(records[p])is bytes and P.sha(records[p])==candidate['newCodeRecordPins'][p] for p in expected_records),'FACTORY_REVIEW_CONSUMED_BUFFERS')
    P.owner_records(candidate,k,{p:records[p] for p in k['typedOwnerPaths'].values()})
    source_path=str(R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume8b/manifest.json')
    source_hash=candidate['newCodeRecordPins'][source_path];source=P.decode(records[source_path])
    P.need(type(source)is dict and type(source.get('files'))is list,'FACTORY_SOURCE_MANIFEST_SHAPE')
    listed={r['path']:r for r in source['files'] if type(r)is dict and type(r.get('path'))is str}
    P.designated_author(candidate,candidate,k,str(N/'root-authorization.json'),'NEW_ROOT_AUTHORIZATION',{name:row['sha256'] for name,row in listed.items()})
    P.need(len(listed)==len(source['files']) and all(name in listed and listed[name].get('sha256')==candidate['codePins'][name] and listed[name].get('bytes')==len(code_buffers[name]) and listed[name].get('mode')==0o644 for name in k['installedCode']),'FACTORY_SOURCE_CODE_GRAPH')
    for path,raw in records.items():
        if path==source_path or path in k['typedOwnerPaths'].values():continue
        review=P.decode(raw)
        P.need(type(review)is dict and review.get('subjectManifestSha256')==source_hash and type(review.get('mandatoryFindingCount'))is int and review['mandatoryFindingCount']==0 and review.get('verdict') in ('CONDITIONAL_EXACT_SOURCE_ONLY_SUPPORT','CONDITIONAL_EXACT_SOURCE_SUPPORT','PASS','SOURCE_ONLY_SUPPORT'),'FACTORY_INDEPENDENT_REVIEW_SUBJECT')
    required=P.binary_requirements(candidate,k)
    P.need(type(witnesses)is dict and set(witnesses)==set(required),'FACTORY_SEVEN_WITNESSES')
    for path,h in required.items():
        w=witnesses[path]
        P.need(type(w)is dict and set(w)=={'path','sha256','mode','dev','ino','uid','bytes','mtimeNs','ctimeNs','acquisition'} and w['path']==path and w['sha256']==h and w['mode']==candidate['binaryModes'][path] and w['acquisition']=='SAME_BUFFER_NOFOLLOW_FD','FACTORY_WITNESS_BINDING')
        P.need(all(type(w[x])is int and w[x]>=0 for x in ('mode','dev','ino','uid','bytes','mtimeNs','ctimeNs')),'FACTORY_WITNESS_TYPES')
    P.need(candidate.get('binaryWitnesses')==witnesses,'FACTORY_SAME_WITNESSES')
    if physical is None:P.need(candidate.get('newDirectoryPins')=={},'FACTORY_NO_PRECREATE_N_FACT')
    else:
        P.need(type(physical)is dict and set(physical)=={'path','uid','dev','ino','mode'} and physical['path']==str(N) and all(type(physical[x])is int and physical[x]>=0 for x in ('uid','dev','ino','mode')) and physical['mode']==0o700,'FACTORY_OPENED_N_FACT')
        P.need(candidate.get('newDirectoryPins')=={str(N):physical},'FACTORY_FINAL_N_BINDING')
    return candidate

def preflight(base,k,code_buffers,witnesses,records):
    P.need(type(base)is dict and all(name not in base for name in ('binaryHashes','binaryModes','binaryWitnesses')),'FACTORY_NO_CALLER_BINARY_MAP')
    required=graph(base,k)
    P.need(type(witnesses)is dict and set(witnesses)==set(required),'FACTORY_SEVEN_WITNESSES')
    candidate=copy.deepcopy(base)
    candidate['kind']='FAILED_RESOURCE_SOURCE08_FAILED_RESOURCE_ROOT_AUTHORIZATION'
    for label in ('physicalNFactFinalizeOnly','actualInstallationAuthorized','actualGuardClosingAuthority'):candidate.pop(label,None)
    candidate['binaryHashes']=dict(required)
    candidate['binaryModes']={path:witnesses[path].get('mode') for path in required}
    candidate['binaryWitnesses']=copy.deepcopy(witnesses)
    validate(candidate,k,code_buffers,witnesses,records)
    return dict(kind='PENDING_INSTALLATION_DRAFT_OUTSIDE_E',authority=False,NFact=False,candidate=copy.deepcopy(candidate),contractSha256=P.sha(code_buffers['contract.json']),codePins=dict(candidate['codePins']))

def finalize(draft,k,code_buffers,witnesses,records,physical):
    P.need(type(draft)is dict and draft.get('kind')=='PENDING_INSTALLATION_DRAFT_OUTSIDE_E' and draft.get('authority') is False and draft.get('NFact') is False and draft.get('contractSha256')==P.sha(code_buffers['contract.json']) and draft.get('codePins')==draft['candidate']['codePins'],'FACTORY_SAME_VALIDATED_DRAFT')
    validate(draft['candidate'],k,code_buffers,witnesses,records)
    result=copy.deepcopy(draft['candidate']);result['newDirectoryPins']={str(N):dict(physical)}
    return validate(result,k,code_buffers,witnesses,records,physical)
