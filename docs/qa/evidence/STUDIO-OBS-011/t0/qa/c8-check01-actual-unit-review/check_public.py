"""Independent finite public-data review; no imported execution modules or native actions."""
import ast, collections, hashlib, json, pathlib, re, stat
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

R = pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01')
O = pathlib.Path(__file__).parent
def read(p): return json.loads(pathlib.Path(p).read_text())
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(n, x): (O/n).write_text(json.dumps(x, indent=2, sort_keys=True)+'\n')
errors=[]
def check(v,label):
    if not v: errors.append(label)
index=read(R/'root-terminal-evidence-index-01.json')
check(sha(R/'root-terminal-evidence-index-01.json')=='f3d5b283f86fe0196d570f0a04002c758a292689203ddb93a6fe1a4c8d62ebcb','index pin')
pins=[]
for f in index['facts']:
    p=pathlib.Path(f['path']); b=p.read_bytes()
    ok=hashlib.sha256(b).hexdigest()==f['sha256'] and len(b)==f['bytes']
    check(ok,'terminal pin:'+str(p));pins.append({'path':str(p),'sha256':f['sha256'],'verified':ok})
release=read(R/'root-actual-unit-release.json'); install=read(R/'runtime-install.json')
for f in install['installMap']:
    for p in [pathlib.Path(f['source']),R/f['runtimeRelativePath']]:
        check(sha(p)==f['sha256'],'installed source hash:'+str(p))
    check(stat.S_IMODE((R/f['runtimeRelativePath']).stat().st_mode)==f['mode'],'installed mode:'+f['runtimeRelativePath'])
    check((release['executionPackagePins']|release['controlPackagePins'])[f['runtimeRelativePath']]==f['sha256'],'release install pin')
for f in release['actualReviewBindings'].values():
    for stem in ['manifest','review']:check(sha(f[stem+'Path'])==f[stem+'Sha256'],'prior review binding:'+stem)
for stem in ['rootOrderingAdoption','freshPreparationFacts']:
    check(sha(release[stem+'Path'])==release[stem+'Sha256'],'release binding:'+stem)
check(install['rootReleaseSha256']==sha(R/'root-actual-unit-release.json'),'install release')
check(install['compositionManifestSha256']==release['compositionManifestSha256'],'composition binding')
composition=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/composed-resume1/manifest.json')
check(sha(composition)==release['compositionManifestSha256'],'actual composition manifest')
plan=read(R/'execution/successor-plan.json');cat=read(R/'execution/successor-catalog.json')
check(sha(R/'execution/successor-plan.json')==release['expectedPlanSha256'],'plan')
check(sha(R/'execution/successor-catalog.json')==release['expectedCatalogSha256'],'catalog')
owned=read(R/'owned-full-check/receipt.json'); facts=read(R/'root-terminal-readonly-facts-01.json')
lineage=read(R/'root-live-phase-lineage-01-limited.json')
actual=read('docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-c8-check01-results.json')
assess=read(R/'full-check/assessment.json'); coverage=read(R/'full-check/coverage-proof.json')
before=read(R/'full-check/source-before.json');after=read(R/'full-check/source-after.json')
check(before==after==facts['source'],'recorded source/mode snapshots exact')
identities={(x['pid'],x['start']) for x in owned['ownedIdentities']}
current={(x['pid'],x['start']) for x in facts['recordedCurrentProof']}
check(len(identities)==2438 and len(current)==2439 and identities<=current,'finite resource union')
keeper=lineage['phaseKeeper']
check(current==identities|{(keeper['pid'],keeper['start'])},'exact recorded plus known keeper union')
check(all(x['proof']=='PID_ABSENT' for x in facts['recordedCurrentProof']),'current finite absence')
state_counts=collections.Counter(x['executableState'] for x in owned['ownedIdentities'])
check(state_counts=={'NON_JAVA':2255,'JAVA':38,'UNKNOWN':145},'historical classifications')
flags={k:owned[k] for k in index['allStickyFlags']}
check(flags==index['allStickyFlags'],'sticky flag preservation')
check(owned['collectorInvocations']==1 and owned['compileReconcileInvocations']==0,'one native no reconcile')
check([owned[k] for k in ['collectorExit','rawNativePhaseExit','phaseExit']]==[1,1,1],'nonzero receipt')
manifest=read(R/'full-check/preserved-public-evidence.json'); refs=manifest['taskArchiveReferences']
public={};xmlcases=[]; file_counts={};physical_errors=[]
for group,rows in refs.items():
    file_counts[group]=len(rows)
    if group=='jacocoExecFiles':continue  # binary metadata only, no stat/hash/read
    for f in rows:
        p=pathlib.Path(f['path']); b=p.read_bytes();s=p.stat()
        if hashlib.sha256(b).hexdigest()!=f['sha256'] or len(b)!=f['bytes'] or stat.S_IMODE(s.st_mode)!=int(f['mode'],8) or s.st_mtime_ns!=f['mtimeNs']:
            physical_errors.append({'group':group,'path':str(p)})
        if group=='xmlFiles':
            root=ET.fromstring(b)
            for case in root.iter('testcase'):
                children={x.tag for x in case}
                status='FAIL' if 'failure' in children else 'ERROR' if 'error' in children else 'SKIP' if 'skipped' in children else 'PASS'
                xmlcases.append({'task':f['task'],'class':case.attrib['classname'],'name':case.attrib['name'],'status':status})
        if group=='guidedCohortFiles':public[(f['task'],p.name)]=json.loads(b)
check(not physical_errors,'public physical archive hashes/bytes/modes/mtime')
for pair in manifest['primary']:
    for role in ['original','archive']:
        f=pair[role];p=pathlib.Path(f['path']);s=p.stat()
        check(sha(p)==f['sha256'] and s.st_size==f['bytes'] and stat.S_IMODE(s.st_mode)==int(f['mode'],8) and s.st_mtime_ns==f['mtimeNs'],'primary custody:'+role)
    check(pair['original']['sha256']==pair['archive']['sha256'],'primary equality')
key=lambda x:(x['task'],x['class'],x['name'],x['status'])
check(collections.Counter(map(key,xmlcases))==collections.Counter(map(key,actual['testcases'])),'XML collector full status multiset')
identity=lambda x:(x['task'],x['class'],x['name'])
check(collections.Counter(map(identity,xmlcases))==collections.Counter(map(identity,cat['expectedCaseIdentities'])),'XML catalog identity multiset')
counts=collections.Counter(x['status'] for x in xmlcases)
skips=read(plan['skipPath'])
# Extract only reviewed pure definitions; no module imports/main or actual helper execution.
tree=ast.parse((R/'execution/execution_checks.py').read_text())
selected=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in ['catalog_errors','reconcile_admission_errors']]
g={'collections':collections,'GAPS':list(flags)}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<reviewed pure predicates>','exec'),g)
catalog_errors=g['catalog_errors'](actual['testcases'],cat,skips)
hard_errors=g['reconcile_admission_errors'](owned,assess)
check('STANDARD_RECONCILE_PRIOR_OBSERVATION_GAP_HOLD' in hard_errors,'old gap hard hold')
check('STANDARD_RECONCILE_ASSESSMENT_EVIDENCE_HOLD' in hard_errors,'old evidence hard hold')
derived_pin=plan['sourceMethodCoverage'];check(sha(derived_pin['path'])==derived_pin['sha256'],'source method catalog pin')
derived=read(derived_pin['path'])
tree=ast.parse((R/'execution/public_cohort_checks.py').read_text())
selected=[x for x in tree.body if isinstance(x,(ast.Assign,ast.FunctionDef))]
g={'collections':collections};exec(compile(ast.Module(body=selected,type_ignores=[]),'<reviewed pure public contracts>','exec'),g)
guards=[read(x['path']) for x in refs['guardTallies']]
joins=g['verify_public_joins'](public,xmlcases,derived,guards)
check(not joins['errors'],'public cohort joins')
oldjoin=read(R/'full-check/public-join-proof.json')
check(joins['cohortSummaries']==oldjoin['cohortSummaries'],'public cohort summary equality')
log=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-c8-check01.log')
projected=[]
for n,line in enumerate(log.read_text().splitlines(),1):
    if re.fullmatch(r'> Task :[A-Za-z0-9_:.-]+(?: (?:FAILED|SKIPPED|UP-TO-DATE|NO-SOURCE|FROM-CACHE))?',line) or re.fullmatch(r'BUILD (?:FAILED|SUCCESSFUL)(?: in [A-Za-z0-9 .]+)?',line):
        projected.append({'lineOrdinal':n,'rawLine':line})
events=assess['taskEventProof']['events']
check(all({'lineOrdinal':x['lineOrdinal'],'rawLine':x['rawLine']} in projected for x in events),'native task event provenance')
check(any(x['rawLine'].startswith('BUILD FAILED') for x in projected),'build failed marker')
check(not any(x['rawLine'].startswith('BUILD SUCCESSFUL') for x in projected),'no successful build')
# Check every original/archive join against finite current public archive facts only.
allowed={x['path']:x for rows in refs.values() for x in rows}
joinerrors=[]
for row in assess['originalPublicArchiveJoins']:
    archive=row['archive'];original=row['original'];reference=allowed.get(archive['path'])
    check(reference is not None,'archive join manifest membership')
    check(all(archive[k]==original[k]==reference[k] for k in ['sha256','bytes','mtimeNs','mode']),'archive original recorded metadata equality')
static_catalog=read(R/'execution/static-resource-catalog.json')['resources']
for item in coverage['staticResources']:
    candidate=item['catalog'];fact=item['originalFact'];entry=item['dependencyEntryFact']
    check(candidate in static_catalog,'static exact catalog membership')
    check(fact['path'] in allowed,'static current public membership')
    check(fact['sha256']==candidate['resourceSha256']==entry['sha256'] and fact['bytes']==candidate['resourceBytes']==entry['bytes'] and entry['entry']==candidate['dependencyEntry'],'static exact public output/entry metadata')
    check(fact['generator']==candidate['generator'] and fact['reportRelativePath']==candidate['reportRelativePath'],'static generator/path identity')
check(coverage['staticOutputOccurrences']==9 and coverage['staticDistinctResources']==3,'honest partial static scope')
check(coverage['reportDisposition']=='NO_CURRENT_REPORT_ESTABLISHED' and not coverage['reportArtifacts'] and not coverage['lineRatios'],'no current report or floors established')
write('input-pins.json',{'terminalIndexSha256':sha(R/'root-terminal-evidence-index-01.json'),'terminalPins':pins,'installedSourcePairs':len(install['installMap']),'errors':errors})
write('task-build-projection.json',{'scope':'Only exact task/build lines, no failure bodies','lines':projected,'headerOnlyIsCompletionProof':False})
write('current-data-results.json',{'errors':errors,'publicPhysicalErrors':physical_errors,'publicFileCounts':file_counts,'binaryExecFilesMetadataOnly':3,'xmlCases':len(xmlcases),'xmlCounts':dict(counts),'taskCounts':dict(collections.Counter(x['task'] for x in xmlcases)),'failedIdentities':[x for x in xmlcases if x['status'] in ['FAIL','ERROR']],'catalogErrors':catalog_errors,'ordinaryReconcileHardErrors':hard_errors,'publicCohortResults':joins,'originalOwnedCount':len(identities),'originalOwnedStateCounts':dict(state_counts),'currentFiniteUnion':len(current),'currentProofCounts':dict(collections.Counter(x['proof'] for x in facts['recordedCurrentProof'])),'allStickyFlags':flags,'sourceBeforeAfterCurrentEqual':before==after==facts['source'],'noNewNativeOrOSObservation':True,'noPrivateBodyReads':True,'coverageReportDisposition':coverage['reportDisposition'],'noStandaloneCompile0Proved':True})
print(json.dumps({'reviewErrors':errors,'publicPhysicalErrors':len(physical_errors),'caseCounts':dict(counts),'ordinaryHardErrors':hard_errors,'publicJoinErrors':joins['errors'],'publicFileCounts':file_counts},indent=2))
