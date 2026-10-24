"""Read-only exact public-packet checks; no source execution or external input opens."""
from pathlib import Path
import ast, difflib, hashlib, json, stat

ROOT=Path.cwd()
REVIEW=Path(__file__).absolute().parent
B=REVIEW.parent.parent/'early/gateway80-failed-red-resource-prep/resume8b'
O=B.with_name('resume8')
checks=[];pins=[]
def check(name,ok):
    if not ok: raise AssertionError(name)
    checks.append(name)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def pin(path,expected=None):
    raw=path.read_bytes();s=path.lstat()
    row=dict(path=str(path.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(s.st_mode))
    check('regular-public-'+row['path'],stat.S_ISREG(s.st_mode) and row['mode']==0o644)
    if expected:
        check('pin-'+row['path'],all(row[k]==expected[k] for k in ('sha256','bytes','mode') if k in expected))
    pins.append(row);return raw
raw=pin(B/'manifest.json');m=json.loads(raw)
check('exact-manifest',len(raw)==6592 and sha(raw)=='7fec05dfe1ea4d59447b10f2b79ed9516c0a56fce51236581381edc001f7e8e6')
check('33-unique-payloads',len(m['files'])==33 and len({r['path'] for r in m['files']})==33)
data={r['path']:pin(B/r['path'],r) for r in m['files']}
check('exact-membership',set(p.name for p in B.iterdir())==set(data)|{'manifest.json','SHA256SUMS'})
sums=pin(B/'SHA256SUMS').decode().splitlines();expected={**{n:sha(r) for n,r in data.items()},'manifest.json':sha(raw)}
rows=[line.split('  ',1) for line in sums]
check('34-checksum-rows',len(rows)==34 and len({p for h,p in rows})==34 and {p:h for h,p in rows}==expected)
bindings=json.loads(data['static-bindings.json'])
delta=[]
for r in bindings['sourceBindings']:
    n=r['path'];old=pin(O/n);new=data[n]
    check('source-binding-'+n,sha(old)==r['oldSha256'] and sha(new)==r['currentSha256'] and (old==new)==r['rawUnchanged'])
    delta.extend(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),'resume8/'+n,'resume8b/'+n))
    if n in ('failed_gateway.py','protocol.py','factory.py','install-cli.py','control-author-cli.py','install-loader.bash','control-author-loader.bash'):
        transformed=old.decode().replace('resume8/','resume8b/').replace("resume8'","resume8b'").replace('code08-exact-review','code08b-exact-review')
        if n=='failed_gateway.py':
            needle='        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)'
            check('one-normalization-site',transformed.count(needle)==1)
            transformed=transformed.replace(needle,'        path=self.s.path(path)\n'+needle)
        check('minimal-source-transform-'+n,transformed.encode()==new)
check('complete-exact-source-delta', ''.join(delta).encode()==data['source-delta.patch'])
oldk=json.loads((O/'contract.json').read_bytes());k=json.loads(data['contract.json'])
check('raw-contract-unchanged',(O/'contract.json').read_bytes()==data['contract.json'])
check('all29-fixed-policy',len(k['externalSourcePins'])==29 and set(k['externalSourcePins'])==set(k['externalInputModes']) and k['externalSourcePins']==oldk['externalSourcePins'] and k['externalInputModes']==oldk['externalInputModes'] and sum(v==0o600 for v in k['externalInputModes'].values())==1 and sum(v==0o644 for v in k['externalInputModes'].values())==28 and all(type(v)is int for v in k['externalInputModes'].values()))
for group in ('limits','priorNamespaces','frozenEvidence','subject'):
    check('unchanged-'+group,k[group]==oldk[group])
def node(raw,name):
    body=ast.parse(raw).body
    for part in name.split('.'):
        found=next(n for n in body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==part)
        body=found.body
    return ast.dump(found,include_attributes=False)
for r in bindings['unchangedComponents']:
    check('unchanged-component-'+r['component'],node((O/r['path']).read_bytes(),r['component'])==node(data[r['path']],r['component']))
caller=json.loads(data['caller-bindings.json']);trace=json.loads(data['trace-bearing-composition.json'])
for r,t in zip(caller['currentCallerSources'],trace['payloads'],strict=True):
    n=r['path'];payload=data[n];prefix=data[t['firstReadPrefix']].decode()
    check('caller-pin-count-'+n,r['sha256']==sha(payload)==t['payloadSha256'] and len(payload)==r['bytes']==t['payloadBytes'] and r['firstReadCap']==len(payload)+1 and t['payloadPath']==str(B/n))
    check('prefix-'+n,str(B/n) in prefix and '-n '+str(len(payload)+1)+' ' in prefix and '== '+str(len(payload))+' ]]' in prefix and '# STOP HERE:' in prefix and 'builtin eval' not in prefix.split('# STOP HERE:')[0])
    check('807-argv-'+n,t['staged807Argv'][-2:]==[sha(payload),str(len(payload))])
for r in trace['literalComponents']:pin(B/r['path'],r)
check('caller-CLI-pin',caller['controlAuthorCliSha256']==sha(data['control-author-cli.py']))
check('caller-operator-pin',caller['operatorHelperSha256']==sha(data['operator-completion.js']))
refs=json.loads(data['unchanged-proof-references.json'])
for r in refs['completeConditionCarriers']+refs['proofReferences']:
    check('public-reference-only',not '/runtime/' in r['path'] and not 'preexisting-baseline' in r['path'])
    pin(ROOT/r['path'],r)
author=json.loads(data['dispatcher-results.json'])
check('author-45-four-scenarios',author['passed']==45 and len(author['scenarios'])==4 and author['failure'] is None and author['realBoundaryCalls']==[])
for n,h in author['sourceHashes'].items():check('author-target-pin-'+n,sha(data[n])==h)
fixture=pin(B.parent/'resume4/checks.py')
check('literal-fixture-pin',sha(fixture)==author['literalFakeFsAuditSourceSha256'])
record=dict(kind='QUINN_SOURCE08B_READ_ONLY_EXACT_PACKET_VERIFICATION',checks=checks,passed=len(checks),pins=pins,payloadCount=33,checksumRows=34,sourceTargetEffects=0,externalRegistryInputsOpened=False,oldSuiteExecution=False)
with (REVIEW/'static-results.json').open('x') as f:json.dump(record,f,indent=2);f.write('\n')
print(json.dumps(dict(passed=len(checks),pins=len(pins),payloads=33,checksumRows=34)))
