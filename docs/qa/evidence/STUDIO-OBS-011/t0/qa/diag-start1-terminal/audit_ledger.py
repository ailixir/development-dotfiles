"""Closed value-free ledger/default-partition inspection; never emits private values or paths."""
from pathlib import Path
import json,hashlib,re,os,tempfile,stat,collections,xml.etree.ElementTree as ET,datetime
ROOT=Path.cwd();BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011';T0=BASE/'t0';OUT=T0/'qa/diag-start1-terminal'
sha=lambda b:hashlib.sha256(b).hexdigest()
def pairs(items):
    d={}
    for k,v in items:
        if k in d:raise ValueError('DUPLICATE_KEY')
        d[k]=v
    return d
def strict(data):return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('NON_JSON_CONSTANT')))
def validate(schema,value):
    allowed={'$schema','title','description','type','additionalProperties','properties','required','const','enum','minimum','maximum','pattern','items','maxItems'}
    assert set(schema)<=allowed
    if 'type' in schema:
        t=schema['type'];assert {'object':isinstance(value,dict),'array':isinstance(value,list),'integer':type(value) is int,'boolean':type(value) is bool,'string':isinstance(value,str)}[t]
    if 'const' in schema:assert type(value) is type(schema['const']) and value==schema['const']
    if 'enum' in schema:assert any(type(value) is type(x) and value==x for x in schema['enum'])
    if 'minimum' in schema:assert value>=schema['minimum']
    if 'maximum' in schema:assert value<=schema['maximum']
    if 'pattern' in schema:assert re.search(schema['pattern'],value)
    if isinstance(value,dict):
        assert set(schema.get('required',[]))<=set(value)
        if schema.get('additionalProperties') is False:assert set(value)<=set(schema['properties'])
        for k,v in value.items():
            if k in schema.get('properties',{}):validate(schema['properties'][k],v)
    if isinstance(value,list):
        if 'maxItems' in schema:assert len(value)<=schema['maxItems']
        for item in value:validate(schema['items'],item)

schemafile=T0/'early/diag-start1-draft/event-schema.json';schema=strict(schemafile.read_bytes())
public=T0/'diagnostic-default-partial/validated-ledger.json';raw=public.read_bytes();ledger=strict(raw);validate(schema,ledger)
assert len(raw)<=16384 and len(ledger['events'])<=32
assert ledger['closed'] and ledger['restored'] and not ledger['truncated'] and not ledger['instrumentationFailed']
assert ledger['writesFailed']==ledger['writersPending']==ledger['observersPending']==ledger['markerAttempts']==ledger['markerCompleted']==ledger['markerFailed']==0
assert ledger['writeAttempts']==ledger['writesCompleted']>0
nullhash=sha(b'null');lastseq=0;lastelapsed=-1;context_seen=False
for event in ledger['events']:
    for key in ['case','epoch','producer','sessionHash']:assert event[key]==ledger[key]
    assert event['contextHash'] in {nullhash,ledger['contextHash']}
    if context_seen:assert event['contextHash']==ledger['contextHash']
    if event['contextHash']==ledger['contextHash']:context_seen=True
    assert event['seq']>lastseq and event['elapsedMs']>=lastelapsed;lastseq=event['seq'];lastelapsed=event['elapsedMs']
assert ledger['case']==ledger['epoch'] and ledger['events'][-1]['event']=='OWNER_CLOSE'
assert context_seen and [e['seq'] for e in ledger['events']]==list(range(1,len(ledger['events'])+1))
stops=[x for x in ledger['events'] if x['event']=='STOP_ENTRY'];aborts=[x for x in ledger['events'] if x['event']=='ABORT_ENTRY']
assert len([x for x in stops if x['first']])==1 and len([x for x in aborts if x['first']])==1
assert [x['stopCount'] for x in stops]==list(range(1,len(stops)+1))

receipt=strict((T0/'diagnostic-default-partial/receipt.json').read_bytes());assert sha(raw)==receipt['ledgerSha256']
roots={}
for base in {Path(tempfile.gettempdir()),Path('/private/tmp'),Path(os.environ.get('TMPDIR','/private/tmp'))}:
    for root in base.glob('obs007-joined-*'):
        if any(sha(str(p).encode())==receipt['sourceTempRootHash'] for p in [root,root.resolve()]):roots[str(root)]=root
assert len(roots)==1;privateRoot=next(iter(roots.values()));producer=privateRoot/'p4-revocation-producers'
private=producer/('diag-start1-'+str(ledger['case'])+'-1.json')
for p,mode in [(privateRoot,0o700),(producer,0o700),(private,0o600)]:
    assert not p.is_symlink() and stat.S_IMODE(p.stat().st_mode)==mode and p.stat().st_uid==os.getuid()
assert private.read_bytes()==raw
assert any(sha(str(p).encode())==receipt['sourceFilePathHash'] for p in [private,private.resolve()])
assert not (producer/'diag-start1-failed').exists() and not list(producer.glob('diag-start1-*.tmp'))

sitesfile=T0/'early/diag-start1-draft/call-site-map.json';sites=strict(sitesfile.read_bytes())
for path,h in sites['hashes'].items():assert sha((ROOT/'studio-runner/dist'/path).read_bytes())==h
for row in sites['sites']:
    line=(ROOT/'studio-runner/dist'/row['file']).read_text().splitlines()[row['line']-1]
    assert sha(line.encode())==row['lineSha256']
candidate=(T0/'early/diag-start1-draft/repo/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java').read_text()
embedded=re.search(r'const diagRoot=%s,diagSites=(\[.*?\]),diagDistHashes=(\{.*?\});',candidate)
assert strict(embedded[1])==sites['sites'] and strict(embedded[2])==sites['hashes']

pre=strict((T0/'resume2-diag-default-partition-preliminary.json').read_bytes());cofile=ROOT/pre['cohort']['path'];co=strict(cofile.read_bytes());coRoot=cofile.parent
assert sha(cofile.read_bytes())==pre['cohort']['sha256']
flags=['auditComplete','privacyComplete','producersDrained','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete']
assert all(co[k] is True for k in flags) and co['retentionFailures']==0 and co['finalScansAttempted'] is True
assert co['runId']==cofile.parent.parent.name and co['cohortId']==cofile.parent.name and co['lane']=='test' and co['profile']=='original4000' and co['declaredOutputCeiling']==4000
gradle=(ROOT/'backend/build.gradle.kts').read_text();default=re.search(r'val joinedDefaultMethods = setOf\(([\s\S]*?)\n\)',gradle)[1];expected=set(re.findall(r'"([^"]+)"',default))
inv=co['invocations'];assert len(inv)==len(expected)==46 and {x['method'] for x in inv}==expected
assert all(x['passed'] is True and x['afterEachComplete'] is True and x['variant']=='singleton' and x['displayLabel']==x['method']+'()' for x in inv)
xmlfile=ROOT/pre['xml']['path'];assert sha(xmlfile.read_bytes())==pre['xml']['sha256'];xml=ET.parse(xmlfile).getroot();cases=xml.findall('testcase')
assert len(cases)==46 and all(c.find('failure') is None and c.find('error') is None and c.find('skipped') is None for c in cases)
assert collections.Counter(x.attrib['name'] for x in cases)==collections.Counter(x['displayLabel'] for x in inv)
allfacts={}
for path in coRoot.glob('*.json'):allfacts[path.name]={'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())}
auditfinal=strict((coRoot/'audit-final.json').read_bytes())
assert all(auditfinal[k] is True for k in ['auditComplete','producersDrained','contextClosed']) and auditfinal['runId']==co['runId'] and auditfinal['cohortId']==co['cohortId'] and auditfinal['lane']=='test'
selected='actualGuidedReleasedValueInjectedFailureRedactsProducedSinks'
for x in inv:
    base='test-'+str(x['invocationOrdinal'])+'-'+x['method']+'-'+x['variant']
    privacy=strict((coRoot/('privacy-'+base+'.json')).read_bytes())
    assert all(privacy[k] is True for k in ['auditComplete','privacyComplete','producersDrained'])
    assert privacy['method']==x['method'] and privacy['invocationOrdinal']==x['invocationOrdinal'] and privacy['lane']=='test'
    for phase in ['after-each','final']:
        model=strict((coRoot/('model-budget-evidence-'+base+'-'+phase+'.json')).read_bytes());response=strict((coRoot/('responses-'+base+'-'+phase+'.json')).read_bytes())
        assert model['complete'] is True and model['invocationOrdinal']==x['invocationOrdinal'] and model['declaredFixtureCeiling']==4000
        assert response['diagnosticFailures']==0 and response['invocationOrdinal']==x['invocationOrdinal'] and response['method']==x['method'] and response['phase']==phase
inventory=co['finalSinkInventory']['sinks'];ledgerrows=[x for x in inventory if x['sha256']==sha(raw) and x['bytes']==len(raw)]
assert len(ledgerrows)==1
assert ledgerrows[0]['sinkNameSha256']==sha(('startup-diagnostic/'+private.name).encode())

# Hash selected session/context values in memory only. Never retain raw private payloads/paths.
bindings=[]
targets={ledger['sessionHash']:'session',ledger['contextHash']:'context'}
def walk(value,hits):
    if isinstance(value,str):
        h=sha(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode())
        if h in targets:hits.add(targets[h])
    elif isinstance(value,dict):
        for v in value.values():walk(v,hits)
    elif isinstance(value,list):
        for v in value:walk(v,hits)
for path in privateRoot.rglob('*'):
    if path.suffix not in {'.json','.jsonl','.journal','.owner'}:continue
    if path.is_symlink() or not path.is_file() or path.stat().st_size>2_000_000:continue
    hits=set()
    try:walk(strict(path.read_bytes()),hits)
    except (ValueError,UnicodeError):
        if path.suffix not in {'.jsonl','.journal'}:continue
        for line in path.read_bytes().splitlines():
            try:walk(strict(line),hits)
            except (ValueError,UnicodeError):pass
    if hits:bindings.append({'privatePathSha256':sha(str(path).encode()),'contentSha256':sha(path.read_bytes()),'matches':sorted(hits)})
assert sum(set(x['matches'])=={'context','session'} for x in bindings)>=1
audit={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'independent sealed default partition/ledger only; overall native/restoration outcome is assessed separately in terminal-audit.json','schemaSha256':sha(schemafile.read_bytes()),'ledgerSha256':sha(raw),'ledgerBytes':len(raw),'case':ledger['case'],'epoch':ledger['epoch'],'sessionHash':ledger['sessionHash'],'contextHash':ledger['contextHash'],'eventCount':len(ledger['events']),'entireActualSchemaValidated':True,'duplicateKeysAndNonJsonConstantsRejected':True,'closedAndDescriptorsRestored':True,'allWriteDrainMarkerCountersValid':True,'privateOriginalEqualsPublicCopy':True,'privateRootAndProducer0700Ledger0600':True,'noMarkerOrTemporaryFile':True,'all12DistSitesAnd5FullFilesEqual':True,'cohortSha256':sha(cofile.read_bytes()),'cohortSixFlagsVerified':True,'all46CasesPassedClosedAndMatchActualGradleSetXml':True,'perInvocationPrivacyModelResponseFilesVerified':230,'allDefaultCohortFileFacts':allfacts,'ledgerInFinalPrivacySinkInventory':True,'privateCorrelationHashOnly':bindings,'selectedOriginalMethod':selected,'selectedInvocationOrdinal':next(x['invocationOrdinal'] for x in inv if x['method']==selected),'events':ledger['events'],'originalB1CauseProved':False,'newNativeRunOrRestorationClaimed':False}
(OUT/'default-ledger-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({k:audit[k] for k in ['ledgerSha256','ledgerBytes','eventCount','all46CasesPassedClosedAndMatchActualGradleSetXml','ledgerInFinalPrivacySinkInventory','privateCorrelationHashOnly','originalB1CauseProved']},indent=2))
