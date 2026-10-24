"""Prepared source/metadata and synthetic-only checks. Never open/stat/hash log."""
import ast,hashlib,json,pathlib,stat,xml.etree.ElementTree as ET
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-checkstyle-public-log-projection-prep/resume1')
O=pathlib.Path(__file__).parent
LOG='docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-c8-check01.log'
def guard(p):assert not str(p).endswith(LOG),'ACTUAL_LOG_ACCESS_FORBIDDEN'
def sha(p):guard(p);return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def read(p):guard(p);return json.loads(pathlib.Path(p).read_text())
checks=[];pins=[]
def check(label,value):assert value,label;checks.append({'check':label,'passed':True})
check('exact six-member manifest',sha(D/'manifest.json')=='c7da5688e57c1c0cb4708c7ff69b1c2789d1561c4016952e1042803085fea1b0')
for f in read(D/'manifest.json')['files']:
 p=D/f['path'];check('prepared member '+f['path'],sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
policy=read(D/'policy.json')
for key in ['sourceGuard','checkstyleConfig','verifiedCustodySource']:
 f=policy[key];check('declared source '+key,sha(f['path'])==f['sha256']);pins.append(f)
index_path=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01/root-terminal-evidence-index-01.json')
check('terminal index pin',sha(index_path)=='f3d5b283f86fe0196d570f0a04002c758a292689203ddb93a6fe1a4c8d62ebcb')
index=read(index_path);bound=[x for x in index['facts'] if x['path']==policy['input']['path']]
check('frozen public input metadata only',len(bound)==1 and {k:bound[0][k] for k in ['path','sha256','bytes']}==policy['input'] and bound[0]['bytes']==633488)
pins.append({'path':str(index_path),'sha256':sha(index_path)})
guards=read(policy['sourceGuard']['path']);config=ET.fromstring(pathlib.Path(policy['checkstyleConfig']['path']).read_bytes())
rules={x.attrib['name'].split('.')[-1].removesuffix('Check') for x in config.iter('module')}
check('public source whitelist source digest',guards['sourceDigest']=='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277')
check('config grammar static no reader includes',bool(rules) and all(isinstance(x,str) and x for x in rules))
# This inspected script reads only the already-verified preparation projector.
s={'__file__':str(D/'test_pure.py')};exec(compile(ast.parse((D/'test_pure.py').read_text()),'<inspected14 synthetic-only tests>','exec'),s)
check('14 inspected synthetic cases',len(s['tests'])==14)
project=s['project'];root='/PUBLIC_REPO';path='backend/src/main/java/Owned.java';paths={path};allowed={'LineLength'}
base='[ant:checkstyle] [ERROR] '+root+'/'+path+':9:2: PRIVATE_BAIT [LineLength]'
adversarial=[]
for name,text,expected,unknown in [
 ('upper line bound',base.replace(':9:2:',':1000000:1000000:'),1,0),
 ('over line bound',base.replace(':9:2:',':1000001:2:'),0,1),
 ('over column bound',base.replace(':9:2:',':9:1000001:'),0,1),
 ('negative line',base.replace(':9:2:',':-1:2:'),0,1),
 ('unexpected severity',base.replace('[ERROR]','[INFO]'),0,1),
 ('relative path',base.replace('/PUBLIC_REPO/',''),0,1),
 ('prefix collision',base.replace('/PUBLIC_REPO/','/PUBLIC_REPO_OTHER/'),0,1),
 ('nested message brackets',base.replace('PRIVATE_BAIT','PRIVATE_BAIT [UNKNOWN_TAG]'),1,0),
 ('escape control in path',base.replace('Owned.java','Owned\x1b[2J.java'),0,1),
 ('no official ant prefix','[ERROR] PRIVATE_BAIT '+path+':9:2: text [LineLength]',0,0),
 ('duplicate and unknown',base+'\n'+base+'\n[ant:checkstyle] PRIVATE_BAIT',2,1)]:
 out=project(text,root,paths,allowed)
 check('independent pure '+name,out['matchedRows']==expected and out['unqualifiedCheckstyleLines']==unknown and out['completeDiagnosticInventoryClaimed'] is False and out['currentHeadOrCauseOrC8Credit'] is False and 'PRIVATE_BAIT' not in repr(out))
 for row in out['facts']:check('closed row '+name,set(row)=={'file','line','column','rule','severity'} and row['file']==path and type(row['line']) is int)
 adversarial.append({'case':name,'matched':out['matchedRows'],'unqualified':out['unqualifiedCheckstyleLines']})
driver=ast.parse((D/'run_projection.py').read_text());main=next(x for x in driver.body if isinstance(x,ast.FunctionDef) and x.name=='main')
check('optimized Python guard precedes bootstrap',isinstance(main.body[0],ast.If) and ast.unparse(main.body[0].test)=='not __debug__' and isinstance(main.body[0].body[0],ast.Raise) and 'OPTIMIZED_PYTHON_FORBIDDEN' in ast.unparse(main.body[0]))
code=(D/'run_projection.py').read_text()
check('only fixed projection output',code.count("actual.write('projection.json', result)")==1)
check('authorization-only before bound data reads',code.index("assert set(actual.members()) == {'root-authorization.json'}")<code.index("guards = json.loads(fixed_input(policy['sourceGuard']))")<code.index("log = fixed_input(policy['input'])"))
check('root authorizer/purpose/pins required',all(x in code for x in ["auth['authorized'] is True","auth['authorizedBy'] == 'root'","auth['C8Credit'] is False","auth['purpose'] == 'ONE_FROZEN_PUBLIC_CHECKSTYLE_SOURCE_PROJECTION'","SHA(manifest_raw) == auth['manifestSha256']","SHA(buffers['policy.json']) == auth['policySha256']"]))
check('four exact custody definitions selected',"{'Hold', 'need', 'member_name', 'Custody'}" in code and 'assert len(selected) == 4' in code)
check('no local runtime module import',not any(isinstance(x,ast.ImportFrom) and x.module in ['failed_resource','projector'] for x in driver.body))
check('same raw fixed-input buffer returned after hash','assert SHA(b) == record[\'sha256\']' in code and 'return b' in code)
check('reader has no process/native caller',not any(isinstance(x,ast.Import) and any(y.name in ['subprocess','fcntl'] for y in x.names) for x in driver.body))
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins,'inputBindingMetadataOnly':policy['input'],'actualLogReadStatHash':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'allPassed':True,'authorSyntheticCases':14,'independentPureCases':adversarial,'staticSourceOnlyDriverChecks':True,'runtimeReaderInvokedOrImported':False,'actualLogReadStatHash':False,'newRuntimeOsNativePrivateActions':0},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'syntheticCases':14,'independentPureCases':len(adversarial),'actualLogReadStatHash':False}))
