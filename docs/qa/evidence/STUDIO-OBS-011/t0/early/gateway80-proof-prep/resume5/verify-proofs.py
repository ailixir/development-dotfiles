"""Pure source/hash/strict-text reconstruction checks; no runtime/helper mains.
Generated proof members take their current hashes from the final manifest only.
"""
from pathlib import Path
import hashlib,json,re,stat
D=Path(__file__).resolve().parent
P=D.parent/'resume4'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def need(ok,why):
    if not ok:raise ValueError(why)

def replay(text,old_prefix,new_prefix):
    lines=text.splitlines(True);i=0;seen=[]
    while i<len(lines):
        need(lines[i].startswith('--- '+old_prefix),'OLD_HEADER')
        name=lines[i][len('--- '+old_prefix):].rstrip('\n');i+=1
        need(i<len(lines) and lines[i]=='+++ '+new_prefix+name+'\n','NEW_HEADER');i+=1
        source=(P/name if old_prefix=='resume4/' else D/name).read_text().splitlines(True)
        output=[];cursor=0
        while i<len(lines) and not lines[i].startswith('--- '):
            header=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);need(header,'HUNK_HEADER');i+=1
            start=int(header[1]);count=int(header[2] or 1);index=start-1 if count else start
            need(index>=cursor,'HUNK_ORDER');output.extend(source[cursor:index]);cursor=index
            removed=added=0
            while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
                line=lines[i];i+=1;need(line and line[0] in ' +-','HUNK_LINE')
                if line[0] in ' -':
                    need(cursor<len(source) and source[cursor]==line[1:],'STRICT_PREIMAGE_NO_FUZZ')
                    cursor+=1;removed+=1
                if line[0] in ' +':output.append(line[1:]);added+=1
            need(removed==count and added==int(header[4] or 1),'HUNK_COUNTS')
        output.extend(source[cursor:])
        target=(D/name if new_prefix=='resume5/' else P/name).read_text()
        need(''.join(output)==target,'STRICT_RECONSTRUCTION')
        seen.append(name)
    need(len(seen)==len(set(seen)),'DUPLICATE_FILE_DELTA')
    return sorted(seen)

def verify(require_final_manifest=True):
    old=json.loads((P/'manifest.json').read_text());proof=json.loads((D/'successor-diff.json').read_text())
    need(sha(P/'manifest.json')==proof['previousManifestSha256'],'OLD_MANIFEST')
    old_rows={r['path']:r for r in old['files']}
    for row in old['files']:
        need(sha(P/row['path'])==row['sha256'],'OLD_MEMBER_DRIFT')
    generated=set(proof['generatedCommonFiles'])
    rows=proof['nonGeneratedCommonComparisons']
    need(set(r['path'] for r in rows)==set(old_rows)-generated,'EXACT_COMPARISON_DOMAIN')
    changed=[]
    for row in rows:
        name=row['path'];p=D/name
        need(row['oldSha256']==old_rows[name]['sha256'],'OLD_HASH_ASSERTION')
        need(row['newSha256']==sha(p),'CURRENT_HASH_ASSERTION')
        need(row['newMode']==stat.S_IMODE(p.stat().st_mode),'CURRENT_MODE_ASSERTION')
        need(row['changed']==(row['oldSha256']!=row['newSha256']),'CHANGE_CLASSIFICATION')
        if row['changed']:changed.append(name)
    need(sorted(changed)==proof['strictDeltaCoverage'],'PRECISE_NON_GENERATED_COVERAGE')
    forward=replay((D/'strict-successor.diff.patch').read_text(),'resume4/','resume5/')
    reverse=replay((D/'strict-successor.reverse.patch').read_text(),'resume5/','resume4/')
    need(forward==reverse==sorted(changed),'EXACT_BIDIRECTIONAL_COVERAGE')
    actual_changed=sorted(name for name,row in old_rows.items() if sha(D/name)!=row['sha256'])
    result={'status':'PURE_STATIC_HASH_AND_STRICT_DIFF_CHECKS_PASSED','nonGeneratedComparisons':len(rows),
            'strictDeltaCoverage':forward,'strictForwardAndReverseExact':True,
            'actualChangedCommonMembers':actual_changed,
            'generatedCommonMembersExcludedFromPatchAndDescriptorCurrentHashAssertions':sorted(generated),
            'selfAndGeneratedHashesAuthority':'manifest.json files entries; no self hash asserted here',
            'allDescriptorCurrentHashAndModeAssertionsVerified':True,'nativeExecutions':0,
            'readiness':False,'released':False}
    if require_final_manifest:
        manifest=json.loads((D/'manifest.json').read_text())
        for row in manifest['files']:
            need(sha(D/row['path'])==row['sha256'],'FINAL_MANIFEST_MEMBER')
            need(stat.S_IMODE((D/row['path']).stat().st_mode)==row['mode'],'FINAL_MANIFEST_MODE')
        for line in (D/'SHA256SUMS').read_text().splitlines():
            expected,name=line.split('  ',1);need(sha(D/name)==expected,'CHECKSUM_SIDECAR')
        record=json.loads((D/'diff-validation.json').read_text())
        need(record==result,'GENERATED_VALIDATION_RECORD_DRIFT')
    return result

if __name__=='__main__':
    result=verify()
    print(json.dumps({'strictDeltaFiles':len(result['strictDeltaCoverage']),
                      'allCurrentHashAssertionsVerified':True,'nativeExecutions':0}))
