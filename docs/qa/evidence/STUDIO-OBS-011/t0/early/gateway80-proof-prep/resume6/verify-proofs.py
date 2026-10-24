"""Read-only source06 strict proof verifier. No runtime/observer/main/native API."""
from pathlib import Path
import ast,hashlib,json,re,sys
D=Path(__file__).resolve().parent
P=D.parent/'resume5'
sha=lambda b:hashlib.sha256(b).hexdigest()
def required(ok,msg):
    if not ok:raise AssertionError(msg)
def text(root,name):
    required(isinstance(name,str) and not Path(name).is_absolute() and '..' not in Path(name).parts,'PROOF_PATH')
    return (root/name).read_text()
def replay(raw,oldroot,newroot):
    lines=raw.splitlines(True);i=0;count=0
    while i<len(lines):
        required(lines[i].startswith('--- '),'PATCH_OLD_HEADER');a=lines[i][4:].rstrip('\n');i+=1
        required(lines[i].startswith('+++ '),'PATCH_NEW_HEADER');b=lines[i][4:].rstrip('\n');i+=1
        an=None if a=='/dev/null' else a.removeprefix(oldroot+'/')
        bn=None if b=='/dev/null' else b.removeprefix(newroot+'/')
        required(a=='/dev/null' or a.startswith(oldroot+'/'),'PATCH_OLD_GENERATION')
        required(b=='/dev/null' or b.startswith(newroot+'/'),'PATCH_NEW_GENERATION')
        source='' if an is None else text(P if oldroot=='resume5' else D,an)
        rows=source.splitlines(True);out=[];pos=0
        while i<len(lines) and lines[i].startswith('@@ '):
            h=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);required(h is not None,'HUNK_HEADER');i+=1
            oldn=int(h[2] or 1);newn=int(h[4] or 1);start=int(h[1])-1 if oldn else int(h[1])
            required(start>=pos,'NO_FUZZ_OR_REORDER');out.extend(rows[pos:start]);pos=start;oc=nc=0
            while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
                kind=lines[i][:1];payload=lines[i][1:];required(kind in (' ','-','+'),'HUNK_LINE')
                if kind in (' ','-'):required(pos<len(rows) and rows[pos]==payload,'EXACT_CONTEXT');pos+=1;oc+=1
                if kind in (' ','+'):out.append(payload);nc+=1
                i+=1
            required((oc,nc)==(oldn,newn),'HUNK_COUNTS')
        out.extend(rows[pos:]);result=''.join(out);expected='' if bn is None else text(D if newroot=='resume6' else P,bn)
        required(result==expected,'FULL_POSTIMAGE_EQUALITY');count+=1
    return count

def verify(final=True):
    oldraw=(P/'manifest.json').read_bytes();required(sha(oldraw)=='607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab','OLD05_SEAL')
    old=json.loads(oldraw)
    for member in old['files']:
        p=P/member['path'];raw=p.read_bytes();required(sha(raw)==member['sha256'] and len(raw)==member['bytes'] and p.stat().st_mode&0o777==member['mode'],'OLD109_PRESERVED')
    older=P.parent/'resume4';olderraw=(older/'manifest.json').read_bytes();required(sha(olderraw)=='43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce','OLD04_SEAL')
    for member in json.loads(olderraw)['files']:
        p=older/member['path'];required(sha(p.read_bytes())==member['sha256'] and p.stat().st_mode&0o777==member['mode'],'OLD93_PRESERVED')
    for row in json.loads((D/'input-pins06.json').read_text())['records']:
        required('preexisting-baseline.json' not in row['path'],'PROTECTED_BASELINE_NOT_AN_INPUT')
        p=Path(row['path']);raw=p.read_bytes();required(sha(raw)==row['sha256'] and len(raw)==row['bytes'] and p.stat().st_mode&0o777==row['mode'],'PUBLIC_INPUT_PIN')
    proof=json.loads((D/'successor-diff.json').read_text());required(proof['currentPreparationGeneration']=='resume6' and proof['subjectPreviousGeneration']=='resume5','CURRENT_GENERATION')
    for row in proof['sourceRecords']:
        for side,root in [('old',P),('new',D)]:
            pin=row[side]
            if pin is not None:required(sha((root/row['path']).read_bytes())==pin['sha256'] and len((root/row['path']).read_bytes())==pin['bytes'],'SOURCE_ROLE_HASH')
    forward=replay((D/'strict-successor.diff.patch').read_text(),'resume5','resume6')
    reverse=replay((D/'strict-successor.reverse.patch').read_text(),'resume6','resume5')
    required(forward==reverse==proof['changedSourceRecords'],'BIDIRECTIONAL_COUNT')
    scopes=[json.loads((root/'scope.json').read_text()) for root in (P,D)]
    for key in ['label','repository','workspace','runtime','phaseIds','phases','node','helm','dependencies','noRetry','noSignals','noCleanupByDriver']:
        required(scopes[0][key]==scopes[1][key],'NATIVE_SCOPE_FROZEN:'+key)
    for member in old['files']:
        if member['path'].startswith('banks/') or member['path'] in ['case-map.json','input-manifest.json','source-guards.json','vitest.gateway80.config.mjs','helper.patch','tests.patch']:
            required(sha((D/member['path']).read_bytes())==member['sha256'],'BANK_OR_NATIVE_INPUT_FROZEN')
    total=0
    for name,count in [('boundary-control-results.json',121),('revision-control-results.json',70),('report-admission-control-results.json',24),('admission-control-results.json',33),('revision06-control-results.json',85)]:
        v=json.loads((D/name).read_text());required(v['allExpected'] is True and len(v['checks'])==count,'PURE_CHECK_RESULT:'+name);total+=count
    snapshots=json.loads((D/'final-test-source-pins.json').read_text());post={r['path']:r for r in snapshots.get('postReplaySourceChanges',[])}
    for row in snapshots['pins']:
        expected=post[row['path']]['newSha256'] if row['path'] in post else row['sha256']
        required(sha((D/row['path']).read_bytes())==expected,'TEST_REPLAY_SOURCE_BINDING')
    runtime=['run-private.py','capture-admission.py','verified-inputs.py','verify-final.py','exit-gate.py','postclose.py','final-controls.py']
    leafsha=sha((D/'verified-inputs.py').read_bytes())
    for name in runtime:
        tree=ast.parse((D/name).read_bytes())
        required(not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('kill','terminate','send_signal') for n in ast.walk(tree)),'NO_SIGNALS')
        required(not any(isinstance(n,ast.Call) and ast.unparse(n.func)=='subprocess.run' for n in ast.walk(tree)),'NO_RUN_TIMEOUT')
        if name in ['run-private.py','capture-admission.py','verify-final.py','exit-gate.py','postclose.py']:required(leafsha in (D/name).read_text(),'ENTRY_LEAF_PIN')
    for site in json.loads((D/'interpretation-sites.json').read_text())['interpretationSites']:
        required(sha((D/site['file']).read_bytes())==site['sourceSha256'],'READER_MAP_SOURCE_PIN')
    if final:
        raw=(D/'manifest.json').read_bytes();m=json.loads(raw);required(m['preparationGeneration']=='resume6','FINAL_MANIFEST_GENERATION')
        actual={str(p.relative_to(D)) for p in D.rglob('*') if p.is_file()};expected={r['path'] for r in m['files']}|{'manifest.json','SHA256SUMS'}
        required(actual==expected,'EXACT_FINAL_PAYLOAD_MEMBERSHIP')
        for row in m['files']:
            p=D/row['path'];required(not p.is_symlink() and sha(p.read_bytes())==row['sha256'] and len(p.read_bytes())==row['bytes'] and p.stat().st_mode&0o777==row['mode'],'FINAL_MEMBER_HASH_MODE')
        for line in (D/'SHA256SUMS').read_text().splitlines():
            digest,name=line.split('  ',1);required(sha((D/name).read_bytes())==digest,'FINAL_CHECKSUM')
        required('manifest.json' not in {r['path'] for r in m['files']} and 'SHA256SUMS' not in {r['path'] for r in m['files']},'NO_SELF_HASH_CYCLE')
    return {'status':'VERIFIED_SOURCE06_PROOFS_ONLY','old05Members':109,'old04Members':93,'strictForwardFiles':forward,'strictReverseFiles':reverse,'sourceControls':total,'finalManifestChecked':final,'actualNativeOrRuntimeActions':0}
if __name__=='__main__':print(json.dumps(verify('--preseal' not in sys.argv)))
