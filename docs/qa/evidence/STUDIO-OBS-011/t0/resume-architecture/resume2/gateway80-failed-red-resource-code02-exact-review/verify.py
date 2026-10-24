"""Finite named public source/data consistency; never runs subject functions."""
import ast,hashlib,json,stat
from pathlib import Path
R=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'early/gateway80-failed-red-resource-prep/resume2'
O=Path(__file__).parent
checks=[];pins={}
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    checks.append(name)
def read(p,h=None,size=None,mode=None):
    p=Path(p);p=p if p.is_absolute() else R/p
    check('PUBLIC_SCOPE:'+str(p),str(p).startswith(str(R)+'/') and '/runtime/' not in str(p) and '/private/' not in str(p) and 'baseline.json' not in p.name)
    raw=p.read_bytes();got=hashlib.sha256(raw).hexdigest();actual=stat.S_IMODE(p.stat().st_mode)
    check('EXACT_PIN:'+str(p),(h is None or got==h) and (size is None or len(raw)==size) and (mode is None or actual==mode))
    pins[str(p)]={'path':str(p),'sha256':got,'bytes':len(raw),'mode':actual}
    return raw
def packet(p,h):
    m=json.loads(read(p/'manifest.json',h))
    for row in m['files']:read(p/row['path'],row['sha256'],row['bytes'],row['mode'])
    return m
m=packet(D,'aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558')
check('SUBJECT_116',len(m['files'])==m['memberCount']==116)
old=packet(D.parent/'resume1','e9515051d3ce31bf075296b94dafcea5db7c3ac59c44850ba5a9c05d7323162b')
six=packet(T/'early/gateway80-proof-prep/resume6','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
check('FROZEN_CODE01_66_SOURCE06_137',len(old['files'])==66 and len(six['files'])==137)
for rel,h in [('resume-architecture/resume2/gateway80-failed-red-resource-exact-review','d77de630c3411ff232f7e8788d67113609160bfee224c14dded0f7ed642b5b42'),('qa/gateway80-failed-red-resource-exact-review','1021c6eb6a44581e5ce96b9069d89923536054b1e0e6ca32059d913de5b296a5')]:packet(T/rel,h)
inputs=json.loads(read(D/'input-pins.json'))
for key in ('preparedInputs','additionalPreparedInputs','code02AdoptedInputs'):
    for row in inputs[key]:read(row['path'],row['sha256'],row['bytes'],row['mode'])
check('INPUT_PIN_GROUPS_149_4_6',list(map(lambda key:len(inputs[key]),('preparedInputs','additionalPreparedInputs','code02AdoptedInputs')))==[149,4,6])
check('CONTRACT_UNCHANGED',(D/'contract.json').read_bytes()==(D.parent/'resume1/contract.json').read_bytes())
cases=json.loads(read(D/'case-preservation.json'))
for group in cases['groups']:
    current=json.loads(read(D/group['file'],group['code02Sha256']))
    prior=json.loads(read(D.parent/'resume1'/group['file'],group['code01Sha256']))
    a=[x['name'] for x in current['checks']];b=[x['name'] for x in prior['checks']]
    check('RETAINED_EXACT_IDS:'+group['file'],a==b==group['semanticIds'] and len(a)==group['retained'])
check('RETAINED114',sum(x['retained'] for x in cases['groups'])==114)
names=('entry.py','failed_gateway.py','custody.py','protocol.py')
raws={n:read(D/n) for n in names};trees={n:ast.parse(raw) for n,raw in raws.items()}
api=json.loads(read(D/'api-map.json'))
for name,rows in api['signatures'].items():
    functions={(node.name,node.lineno,node.end_lineno):node for node in ast.walk(trees[name]) if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef))}
    for row in rows:
        node=functions.get((row['function'],row['line'],row['endLine']))
        check('API:'+name+':'+row['function']+':'+str(row['line']),node is not None and ast.unparse(node.args)==row['signature'])
imap=json.loads(read(D/'interpretation-map.json'))
for row in imap['reachedInterpretationSites']:
    check('INTERPRETATION:'+str(row),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee'] for n in ast.walk(trees[row['file']])))
check('REACHED_59_CLASSES13',len(imap['reachedInterpretationSites'])==imap['reachedInterpretationSiteCount']==59 and len(imap['inputClasses'])==imap['inputClassCount']==13)
guard=read(D/'guard-failed-red.bash').decode();bind=read(D/'bind-command.template.bash').decode()
check('LITERAL_GUARD_EMBEDDED',guard in bind)
body=guard.split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
check('NO_RUNTIME_ASSERT',not any(isinstance(node,ast.Assert) for tree in [*trees.values(),ast.parse(body)] for node in ast.walk(tree)))
sink=next(n for n in trees['protocol.py'].body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
check('EXACT_COMMON_FAILURE_SINK',ast.get_source_segment(raws['protocol.py'].decode(),sink) in body)
install=json.loads(read(D/'install-map.json'));auth=json.loads(read(D/'authorization.template.json'))
check('SIX_INSTALL_CODE_PINS',len(install['files'])==6 and api['exactCurrentInstalledPins']==auth['codePins']=={r['source']:r['sha256'] for r in install['files']})
check('INSTALL_MODES_SCOPE',install['newDirectoryMode']==0o700 and all(r['installedMode']==0o600 and Path(r['destination']).parent==Path(install['N']) for r in install['files']))
check('INACTIVE_AUTHORITY',auth['authorized'] is False and auth['exactIndependentCodeReviewsQualified'] is False and auth['actualInstallationAuthorized'] is False and auth['actualGuardClosingAuthority'] is False)
check('ALL197_AUTHOR_EXPECTED_IDS',sum(json.loads(read(D/n))['passed'] for n in ('check-results.json','extra-check-results.json','optimized-bootstrap-results.json','code02-check-results.json'))==197)
for line in (D/'SHA256SUMS').read_text().splitlines():
    h,name=line.split('  ',1);check('CHECKSUM:'+name,hashlib.sha256((D/name).read_bytes()).hexdigest()==h)
result={'kind':'FINITE_SOURCE_API_PIN_CONSISTENCY','passed':len(checks),'checks':checks,'subjectManifestSha256':hashlib.sha256((D/'manifest.json').read_bytes()).hexdigest(),'uniqueNamedPublicPins':len(pins),'actualSubjectFunctionsOrOperationalActions':0}
(O/'source-checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'kind':'EXACT_NAMED_PUBLIC_INPUTS_ONLY','files':list(pins.values()),'count':len(pins),'runtimeOrPrivateOrProtectedBaselineReadStatHash':False},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'pins':len(pins),'actualOperations':0}))
