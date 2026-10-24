"""Finite current author/caller/input/produced-schema bindings; no target calls."""
from pathlib import Path
import json,hashlib,stat,ast,shlex
H=Path(__file__).absolute().parent;T=H.parents[2];S=T/'early/gateway80-source07-install-input-author/resume1';ROOT=next(p for p in H.parents if p.name=='ui-studio')
PINS=[];CHECKS=[]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def check(n,v):
 if v is not True:raise ValueError(n)
 CHECKS.append(n)
def bind(p,h=None,size=None,mode=None):
 check('public path:'+str(p),'/runtime/' not in str(p) and '/gateway80-fr04-root-install01/' not in str(p))
 raw=p.read_bytes();st=p.lstat();check('regular:'+str(p),stat.S_ISREG(st.st_mode) and not p.is_symlink())
 if h is not None:check('sha:'+str(p),sha(raw)==h)
 if size is not None:check('bytes:'+str(p),len(raw)==size)
 if mode is not None:check('mode:'+str(p),stat.S_IMODE(st.st_mode)==mode)
 PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(st.st_mode)));return raw
m=json.loads(bind(S/'manifest.json','044755a1f70943e4eb7523a8a60a45e7feb4ff442a23d91f0ddf8df6cd76072f',4025,420))
for r in m['files']:bind(S/r['path'],r['sha256'],r['bytes'],r['mode'])
check('21payloads',len(m['files'])==21);lines=bind(S/'SHA256SUMS','05af2360a826d1c9ece0a7c5c0f8d15b132e80c1a8ddeb1fc88a53d8287e506c').decode().splitlines();check('22checksum',len(lines)==22)
for line in lines:
 h,n=line.split('  ',1);check('checksum:'+n,sha((S/n).read_bytes())==h)
check('membership',{p.name for p in S.iterdir()}=={r['path'] for r in m['files']}|{'manifest.json','SHA256SUMS'})
for r in json.loads((S/'input-read-receipt.json').read_bytes())['references']:bind(ROOT/r['path'],r['sha256'],r['bytes'],r.get('mode'))
app=json.loads(bind(T/'resume2-gateway80-failed-resource-source07-one-unit-root-applicability.json','b16b54eb0c8e1b3f64c72176472012b9ddd41572c6f736ff85b8551bbc8a2285',10837,420))
for name,v in json.loads((S/'applicability-required-fields.json').read_bytes())['requiredScalars'].items():check('actual conditional app:'+name,type(app[name])is type(v) and app[name]==v)
check('conditional only',app['actualRuntimeAuthorized'] is False and app['actualInstallationAuthorizedByThisRecord'] is False and app['installationPreparationAuthorized']['metadataAuthorIndependentReviewAndExactActualScopeRequired'] is True)
cfg=json.loads((S/'input-bindings.json').read_bytes());src=Path(cfg['source']);k=json.loads((src/'contract.json').read_bytes());current=json.loads((H/'critical-results.json').read_bytes());scope=current['producedScopes'][0];c=scope['candidate']
check('newapp used',current['newConditionalApplicabilitySha256']=='b16b54eb0c8e1b3f64c72176472012b9ddd41572c6f736ff85b8551bbc8a2285')
check('fixed27/5',current['passed']==27 and current['failure'] is None and len(current['cases'])==5 and current['extraTargetCases']==0 and current['realBoundaryCalls']==[])
for key,target in [('subject','subject'),('retainedFailure','retainedFailure'),('limits','limits'),('priorNamespaces','priorNamespaces'),('physicalPythonRoles','expectedPhysicalPythonRoles'),('typedRoleContract','typedRoleContract'),('observationExecutables','expectedObservationExecutables')]:check('current derived:'+key,c[key]==k[target])
check('oldindex matches current frozen',c['oldIndexSha256']==k['frozenEvidence']['terminalIndexSha256'])
protocol=ast.parse((src/'protocol.py').read_bytes());source=next(ast.literal_eval(n.value) for n in protocol.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='SOURCE')
check('expected source ancestry only',c['sourceDigest']==source==app['expectedSharedSourceSha256'] and c['currentFactsObserved'] is False)
check('allowed candidate fields',set(c)<=set(k['authorityAllowedFields']))
for key,want in dict(authorizedBy='root',authorized=True,expectedWrapperExit=1,newNativeInvocations=0,sourceWrites=[],cleanup=False,normalRoute='HARD_HOLD',credit=False,compileObligation='NONE_NODE_ONLY_UNCHANGED_SOURCE',distinctFailedEntrypointAuthorized=True,exactIndependentCodeReviewsQualified=True,legacyReportedCanonicalPredicateSatisfied=False,physicalNFactFinalizeOnly=True,actualInstallationAuthorized=False,actualGuardClosingAuthority=False,rootInputPins={},newDirectoryPins={}).items():check('preserved flag:'+key,type(c[key])is type(want) and c[key]==want)
check('current external map',c['externalPins']=={str(ROOT/p):h for p,h in k['externalSourcePins'].items()})
expected={str(src/'manifest.json'):cfg['sourceSha256'],**{x['path']:x['sha256'] for x in cfg['reviews'].values()}}
check('current exact review graph',scope['reviewPins']==expected)
check('current exact owner graph',scope['ownerPins']=={k['typedOwnerPaths'][who]:r['sha256'] for who,r in cfg['owners'].items()})
check('destination prospective only',scope['destination']==str(T/'runtime/obs009-gateway80-offtree03-20261019'/k['namespace']) and scope['outsideDirectory']==str(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-fr04-root-install01'))
check('source NORMAL06 preserved',c['subject']['code06ManifestSha256']==k['subject']['code06ManifestSha256']=='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
f=json.loads((S/'final-bindings.json').read_bytes());body=shlex.split((S/'metadata-author.first-read.bash').read_text().split('-B -c ',1)[1])[0];check('exact lexical caller argument',sha(body.encode())==f['finalPythonArgumentSha256'])
check('exact source/current result',sha((S/'metadata-author.py').read_bytes())==current['authorSha256']==f['authorSha256'] and sha((S/'metadata-author.first-read.bash').read_bytes())==current['callerSha256']==f['callerSha256'])
for i in range(1,4):
 attempt=json.loads((S/('critical-attempt0%d.json'%i)).read_bytes());check('original source stable:'+str(i),attempt['authorSha256']==f['authorSha256'] and attempt['callerSha256']==f['callerSha256'])
# Full PREUSE assessment and conditions, already scoped public dependency.
p=T/'resume-architecture/resume2/gateway80-source07-preuse-applicability';mm=json.loads(bind(p/'manifest.json','572809ccb13c2ece5a0a5e57d6222d79865a601334515367a6347b0ac37230a9'))
for r in mm['files']:bind(p/r['path'],r['sha256'],r['bytes'],r['mode'])
result=dict(checks=len(CHECKS),detail=CHECKS,pins=PINS,subjectPayloads=21,checksumRows=22,currentCriticalChecks=27,currentCases=5,extraTargetCases=0,actualTargetEffects=0,fullPreflightClaimed=False,staticCurrentCandidateSatisfiesRetainedFields=True)
(H/'finite-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(checks=len(CHECKS),pinRecords=len(PINS),current27cases5=True,actualTargetEffects=0)))
