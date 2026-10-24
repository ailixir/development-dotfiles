"""Closed pure source predicate composition, not a loader/diagnostic execution."""
import ast,builtins,hashlib,json,os,pathlib,re,socket,subprocess,sys,types,ctypes,fcntl,time
from unittest.mock import patch
from contextlib import ExitStack
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'early/gateway80-failed-red-resource-prep/resume2'
O=pathlib.Path(__file__).parent
sink=(O/'closed-source-model-results.json').open('x')
def verified(p,h):
    raw=p.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=h:raise ValueError('EXTERNAL_RAW_PIN')
    return raw
index=json.loads(verified(T/'resume2-gateway80-failed-resource-code02-negative-failed-index.json','8b1f8f9be540788d05b66923fd7fc60c7d9df19f254868dacde87d0819db8761'))
rows={r['path']:r for r in index['members']}
authority=json.loads(verified(pathlib.Path(index['N']['path'])/'root-authorization.json',rows['root-authorization.json']['sha256']))
contract=json.loads(verified(D/'contract.json','f45d5b644d4863158cc6f8d560fd5b4ef55592e6b07baa9d526799dce5abfcee'))
protocol=verified(D/'protocol.py','7420eefc62e4a5a652a4b35a09b783fd7c7ea378af16a211686ebd6fd78e36b2')
source=verified(D/'failed_gateway.py','cbc8a9e34b70697227afbde28312ef9e6233f5d147b700e73a2af834fc9311a9')
tree=ast.parse(source)
unit=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Unit')
loader=next(n for n in unit.body if isinstance(n,ast.FunctionDef) and n.name=='load_libraries')
start=next(i for i,n in enumerate(loader.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='required_binaries' for t in n.targets))
# Exact three production statements, unchanged; preceding I/O/compilation and
# subsequent H reads are not executed or represented as successful.
fragment=loader.body[start:start+3]
if len(fragment)!=3 or not isinstance(fragment[-1],ast.Expr):raise ValueError('PREDICATE_SPAN')
wrapped=ast.FunctionDef(name='production_binary_predicate',args=ast.arguments(posonlyargs=[],args=[ast.arg(arg='self')],kwonlyargs=[],kw_defaults=[],defaults=[]),body=fragment,decorator_list=[])
model=ast.fix_missing_locations(ast.Module(body=[wrapped],type_ignores=[]))
compiled_protocol=compile(protocol,'<verified-pure-protocol>','exec')
compiled_model=compile(model,'<exact-load-libraries-three-statement-predicate>','exec')
def denied(*args,**kwargs):raise AssertionError('REAL_EFFECT_DENIED')
def audit(event,args):
    if event=='open' or event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')) or event in ('fcntl.flock','fcntl.lockf'):raise AssertionError('PERSISTENT_DENY:'+event)
sys.addaudithook(audit)
P=types.ModuleType('_pure_verified_protocol');ns={'P':P}
with ExitStack() as guards:
    for obj,names in ((builtins,('open',)),(os,('open','stat','lstat','read','write','close','getpid','getppid','getuid','umask','fork','kill','system')),(socket,('socket','create_connection')),(subprocess,('Popen','run')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):guards.enter_context(patch.object(obj,name,denied))
    exec(compiled_protocol,P.__dict__);exec(compiled_model,ns)
    if P.authority(authority,contract) is not authority:raise AssertionError('AUTHORITY_SHAPE')
    required=index['rootOperatorAuthorizationDefect']['requiredBinaryHashes']
    node='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin/node'
    helm='/opt/homebrew/Cellar/helm/4.2.0/bin/helm'
    owner=types.SimpleNamespace(a=authority,original={'nodeCanonicalPath':node,'nodeSha256':required[node],'helmCanonicalPath':helm,'helmSha256':required[helm]})
    try:ns['production_binary_predicate'](owner)
    except P.Hold as error:
        if error.args!=('EXACT_BINARY_MODES_HASHES',):raise
    else:raise AssertionError('FIVE_CANNOT_SATISFY_SEVEN')
    missing=sorted(set(required)-set(authority['binaryHashes']))
    if missing!=sorted([node,helm]) or len(required)!=7 or len(authority['binaryHashes'])!=5:raise AssertionError('EXACT_MISSING_SET')
    old=set(contract['finiteUnion']['numericIds']);new={86096,96486}
    if len(old)!=2253 or old&new or len(old|new)!=2255:raise AssertionError('EXACT_UNION')
result={'kind':'CLOSED_PURE_EXACT_SOURCE_PREDICATE_COMPOSITION','checksPassed':4,'actualRootAuthorityShapeAcceptedByExistingPurePredicate':True,'exactThreeStatementLoadLibrariesBinaryPredicate':'EXACT_BINARY_MODES_HASHES','requiredUniqueBinaryPaths':7,'actualAuthorizedUniqueBinaryPaths':5,'missingRoleNames':['canonicalNode24','canonicalHelm'],'oldNumericCount':2253,'addedNumbers':[86096,96486],'addedAlreadyPresent':[],'prospectiveNumericCount':2255,'numericOnlyAbsenceObligations':[73492,86096,96486],'actualObservedHoldCause':'NOT_ESTABLISHED','fullLoadLibrariesOrRegisterOrDiagnosticExecuted':False,'libraryCompatibilityProved':False,'actualOperations':0,'limitation':'Only existing pure authority and exact three production binary-map statements executed; no preceding or following loader call and no actual tool mode or process fact acquired.'}
sink.write(json.dumps(result,indent=2)+'\n');sink.flush();sink.close()
print(json.dumps({'pureChecks':4,'actualOperations':0,'diagnosticExecuted':False}))
