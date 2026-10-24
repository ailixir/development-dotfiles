"""Public source/evidence hashing and JSON reconciliation only; no product execution."""
from pathlib import Path
import hashlib
import json
import datetime
import re

HERE=Path(__file__).resolve().parent
PACK=HERE.parent
ROOT=HERE.parents[6]
RUN=PACK/'execution01'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
compact=lambda rows:sha(json.dumps(rows,separators=(',',':')).encode())

def pin(path, expected):
    assert sha(path.read_bytes())==expected, str(path)

for path,expected in [
    (PACK/'architecture-review/review.md','383c24c3c1500bb93eea2d154e45c62f2b7cdac29b709147dafb61a755f33d34'),
    (RUN/'receipt.md','b983c3fa241619be3848b3c8d82ac91513ec33f455bce25c670e7693a931e5cd'),
    (RUN/'results.json','c676185859b5a5a471025861cc7a04f4b9456bac7d9606391775d4d33ab0f6a3'),
    (RUN/'manifest.json','c1f42f11ff6e9c74d615a47a9684cce67e8e32d23b9d5848bfb056ca13f011ce'),
    (RUN/'validated-four-file-application-binding.json','a8ece9d9f506d574ddd9ad1b629bb6541ee7b2d8911b4feb68dc916ec4fd852f')]:pin(path,expected)
for folder in [PACK,RUN]:
    for entry in load(folder/'manifest.json')['files']:
        raw=(folder/entry['path']).read_bytes()
        assert len(raw)==entry['bytes'] and sha(raw)==entry['sha256'],entry['path']

binding=load(PACK/'staged-binding.json')
application=load(RUN/'validated-four-file-application-binding.json')
for entry,applied in zip(binding['paths'],application['paths'],strict=True):
    assert entry['path']==applied['path']
    assert entry['originalSha256']==applied['requiredActualBeforeSha256']
    assert entry['greenSha256']==applied['validatedCandidateSha256']
    for stage,key in [('before','originalSha256'),('red','redSha256'),('green','greenSha256')]:
        pin(PACK/stage/entry['path'],entry[key])
    pin(ROOT/entry['path'],entry['originalSha256'])
    pin(Path(applied['validatedSandboxPath']),entry['greenSha256'])
    before=(PACK/'before'/entry['path']).read_bytes()
    red=(PACK/'red'/entry['path']).read_bytes()
    green=(PACK/'green'/entry['path']).read_bytes()
    if '/test/' in entry['path']:
        assert red==green and green.startswith(before)
    else:assert before==red
for field,name in [('testsPatchSha256','tests.patch'),('productPatchSha256','product.patch'),('combinedPatchSha256','combined.patch')]:
    assert binding[field]==application[field]
    pin(PACK/name,binding[field])
def reconstruct_patch(name):
    lines=(PACK/name).read_text().splitlines(keepends=True)
    i=0; outputs={}
    while i<len(lines):
        assert lines[i].startswith('--- a/')
        target=lines[i][6:].rstrip('\n')
        assert lines[i+1]=='+++ b/'+target+'\n'
        source=(PACK/'before'/target).read_text().splitlines(keepends=True)
        i+=2;pos=0;output=[]
        while i<len(lines) and not lines[i].startswith('--- a/'):
            match=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',lines[i]);assert match
            start,old_count,new_start,new_count=map(int,match.groups())
            assert start-1>=pos
            output.extend(source[pos:start-1]);pos=start-1
            assert len(output)==new_start-1
            i+=1;consumed=produced=0
            while i<len(lines) and not lines[i].startswith(('@@ ','--- a/')):
                line=lines[i];assert line[0] in ' +-'
                if line[0] in ' -':assert source[pos]==line[1:];pos+=1;consumed+=1
                if line[0] in ' +':output.append(line[1:]);produced+=1
                i+=1
            assert (consumed,produced)==(old_count,new_count)
        output.extend(source[pos:]);outputs[target]=''.join(output).encode()
        assert outputs[target]==(PACK/'green'/target).read_bytes()
    return outputs
product_outputs=reconstruct_patch('product.patch');test_outputs=reconstruct_patch('tests.patch')
assert reconstruct_patch('combined.patch')=={**product_outputs,**test_outputs}

results=load(RUN/'results.json')
sandbox=Path(results['sandbox'])
seed=sandbox.parent/'seed-receipt.json'
pin(seed,results['seedReceiptSha256'])
before=load(RUN/'before-inputs.json');red=load(RUN/'red-inputs.json')
green=load(RUN/'green-inputs.json');after=load(RUN/'after-inputs.json')
assert len(before['copied492Inputs'])==len(red['sources'])==len(green['sources'])==len(after['green492Sources'])==492
maps=[{r['path']:r['sha256'] for r in rows} for rows in [before['copied492Inputs'],red['sources'],green['sources'],after['green492Sources']]]
assert all(len(x)==492 for x in maps)
assert maps[2]==maps[3]
assert {k for k in maps[0] if maps[0][k]!=maps[1][k]}=={e['path'] for e in binding['paths'] if '/test/' in e['path']}
assert {k for k in maps[1] if maps[1][k]!=maps[2][k]}=={e['path'] for e in binding['paths'] if '/src/' in e['path']}
for row in after['green492Sources']:pin(sandbox/row['path'],row['sha256'])
for rows in [before['actualRTSeven'],before['actualProtected18']]:
    for row in rows:pin(ROOT/row['path'],row['sha256'])
assert len(before['actualRTSeven'])==7 and len(before['actualProtected18'])==18
for row in before['actualRTSeven']:
    assert maps[0][row['path']]==row['sha256']
    assert maps[2][row['path']]==row['sha256']
for inv in [red,green]:assert compact(inv['sources'])==inv['sourceDigest']

delta=load(RUN/'sandbox-dist-delta.json')
for inv in [delta['before'],delta['after']]:
    assert len(inv['files'])==238 and compact(inv['files'])==inv['digest']
old={r['path']:r['sha256'] for r in delta['before']['files']}
new={r['path']:r['sha256'] for r in delta['after']['files']}
assert old.keys()==new.keys()
assert sorted(k for k in old if old[k]!=new[k])==delta['changedPaths']==[
    'run/browser.js','run/browser.js.map','run/observedBootstrap.d.ts',
    'run/observedBootstrap.js','run/observedBootstrap.js.map']
assert delta['before']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
assert delta['after']['digest']=='9ef78477c75c1dab2410c5671f5ef9495a6788360a18841b668007486a7bc39d'
for name,folder in [('sandbox',sandbox/'studio-runner/dist'),('pristine',sandbox.parent/'pristine-dist'),('actual',ROOT/'studio-runner/dist')]:
    start=before['distInventories'][name];end=after['distInventories'][name]
    assert start==delta['before']
    assert end==(delta['after'] if name=='sandbox' else delta['before'])
    actual=[{'path':str(p.relative_to(folder)),'sha256':sha(p.read_bytes())} for p in sorted(folder.rglob('*')) if p.is_file()]
    assert actual==end['files'] and compact(actual)==end['digest']

stages=['redTypes','red','green','unit','greenTypes','lint','nativeDeadline','nativeF3']
assert [r['stage'] for r in results['runs']]==stages
reports={};evidence=[];previous=None
for run in results['runs']:
    path=ROOT/run['resultPath'];pin(path,run['resultSha256']);actual=load(path)
    assert actual==run['actual']
    label=path.name.removesuffix('-results.json')
    base=path.parent
    pin(base/(label+'.log'),actual['logSha256'])
    bpath=base/(label+'-before.json');apath=base/(label+'-after.json')
    pin(bpath,run['beforeManifestSha256']);pin(apath,run['afterManifestSha256'])
    b=load(bpath);a=load(apath)
    assert b['files']==a['files'] and b['digest']==a['digest']==before['expectedActualSource']
    assert b['dist']==a['dist']==delta['before']
    assert actual['sourceStable'] is actual['testInputStable'] is actual['distStable'] is True
    assert actual['testInputDigestBefore']==actual['testInputDigestAfter']==b['digest']
    assert actual['exit']==(1 if run['stage']=='red' else 0)
    started=datetime.datetime.fromisoformat(actual['started'])
    assert previous is None or started>previous
    previous=started+datetime.timedelta(seconds=actual['elapsedSeconds'])
    if 'vitestReportSha256' in actual:
        reportpath=base/(label+'-vitest.json');pin(reportpath,actual['vitestReportSha256'])
        report=load(reportpath);reports[run['stage']]=report
        assert all(report[k]==v for k,v in actual['vitest'].items())
        cases=[c for s in report['testResults'] for c in s['assertionResults']]
        assert [{'file':str(Path(s['name']).relative_to(sandbox/'studio-runner')),
                 'fullName':c['fullName'],'status':c['status'],'durationMs':c.get('duration')}
                for s in report['testResults'] for c in s['assertionResults']]==run['allCases']
        assert len(cases)==report['numTotalTests']
        assert sum(c['status']=='passed' for c in cases)==report['numPassedTests']
        assert sum(c['status']=='failed' for c in cases)==report['numFailedTests']
        assert report.get('numTodoTests',0)==0
    evidence.append({'stage':run['stage'],'resultSha256':run['resultSha256'],'logSha256':actual['logSha256'],
                     'reportSha256':actual.get('vitestReportSha256'),'rawExit':actual['exit'],
                     'rootBeforeAfterExact':True})

cases=lambda stage:[c for s in reports[stage]['testResults'] for c in s['assertionResults']]
failed=[c for c in cases('red') if c['status']=='failed']
assert len(failed)==1 and failed[0]['fullName']==load(PACK/'expected-red.json')['primaryFullName']
assert len(failed[0]['failureMessages'])==1
message=failed[0]['failureMessages'][0]
assert message.startswith('AssertionError: expected false to be true')
assert 'guided-start-deadline.test.ts:266:23' in message
assert all(x not in message for x in ['finally','TimeoutError','Unhandled','cleanup-oracle'])
assert len(cases('red'))==9 and sum(c['status']=='skipped' for c in cases('red'))==8
assert len(cases('green'))==9 and sum(c['status']=='passed' for c in cases('green'))==2
assert sum(c['status']=='skipped' for c in cases('green'))==7
assert len(cases('unit'))==14 and all(c['status']=='passed' for c in cases('unit'))
assert len(cases('nativeDeadline'))==9 and all(c['status']=='passed' for c in cases('nativeDeadline'))
inventory=load(PACK/'original-case-assertion-inventory.json')
assert [c['fullName'] for c in cases('unit')[:12]]==[c['fullName'] for c in inventory['unit']['oldCases']]
assert [c['fullName'] for c in cases('nativeDeadline')[:7]]==[c['fullName'] for c in inventory['fixture']['oldCases']]
assert [c['fullName'] for c in cases('nativeDeadline')]==load(RUN/'before-native.json')['expectedNineFullNames']
f3=[c for c in cases('nativeF3') if c['status']=='passed']
assert len(cases('nativeF3'))==5 and len(f3)==1 and sum(c['status']=='skipped' for c in cases('nativeF3'))==4
assert f3[0]['fullName']==load(RUN/'before-native.json')['f3FullName']
assert all(not c['failureMessages'] for stage in ['green','unit','nativeDeadline','nativeF3'] for c in cases(stage))
assert datetime.datetime.fromisoformat(load(RUN/'genuine-red.json')['capturedAt'])<datetime.datetime.fromisoformat(green['capturedAt'])
assert results['runs'][5]['actual']['command'][-4:]==[e['path'].removeprefix('studio-runner/') for e in binding['paths']]
for row in results['canonicalExecutables']:
    path=Path(row['path']);pin(path,row['sha256']);assert oct(path.stat().st_mode & 0o777)=='0o755'

out={'decision':'READY_FOR_ROOT_INTEGRATION_OF_NARROW009_FIX','mandatoryFindings':[],
     'runtimeReplayed':False,'sourceOrDistApplied':False,'publicOnlyEvidenceInspection':True,
     'fourFileBindings':application['paths'],'runs':evidence,'catalogCount':492,'distCount':238,
     'sandboxBeforeDist':delta['before']['digest'],'sandboxGreenDist':delta['after']['digest'],
     'changedDistPaths':delta['changedPaths'],'actualRt7Protected18RehashedUnchanged':True,
     'oldUnit12AndNative7NamesRetained':True,'genuineControlledRedExact':True,
     'historicalCauseProved':False,'fullTierGateSupplied':False}
(HERE/'independent-evidence-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'decision':out['decision'],'checksSha256':sha((HERE/'independent-evidence-checks.json').read_bytes())}))
