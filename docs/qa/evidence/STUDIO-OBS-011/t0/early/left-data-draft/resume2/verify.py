from pathlib import Path
import re, json, hashlib, difflib, datetime
root = Path.cwd()
out = root / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/left-data-draft/resume2'
old = out.parent
main = root / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/left-main-draft'
def sha(b): return hashlib.sha256(b).hexdigest()
def mask(s):
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), s)
def balanced(s):
    stack=[]; pairs={'}':'{',')':'(',']':'['}
    for c in mask(s):
        if c in '{([': stack.append(c)
        if c in '})]':
            assert stack and stack.pop() == pairs[c]
    return not stack
def apply_patch(base, patch):
    original=base.splitlines(True); lines=patch.splitlines(True)
    assert lines[0].startswith('--- ') and lines[1].startswith('+++ ')
    result=[]; cursor=0; i=2
    while i < len(lines):
        h=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]); assert h,lines[i]
        start=int(h[1])-1 if int(h[1]) else 0
        assert start >= cursor
        result += original[cursor:start]; cursor=start; i+=1
        while i < len(lines) and not lines[i].startswith('@@'):
            line=lines[i]; flag=line[0]; value=line[1:]
            assert flag in ' +-'
            if flag in ' -':
                assert original[cursor] == value, (cursor, original[cursor], value)
                cursor+=1
            if flag in ' +': result.append(value)
            i+=1
    result += original[cursor:]
    return ''.join(result)
def patch_sections(text):
    result={}
    for section in re.split(r'(?m)(?=^--- a/)',text):
        if not section: continue
        path=section.splitlines()[0][6:]
        assert path not in result
        result[path]=section
    return result
manifest=json.loads((out/'manifest.json').read_text())
old_manifest=json.loads((old/'manifest.json').read_text())
main_manifest=json.loads((main/'manifest.json').read_text())
assert len(manifest['files']) == 5 and len(main_manifest['files']) == 11
assert set(f['path'] for f in manifest['files']).isdisjoint(f['path'] for f in main_manifest['files'])
assert sha((old/'left-data-draft.patch').read_bytes()) == '44b178b913f0b4125a668a726a6b48d9584dce2a9cb250e57d672cad5c5dc259'
assert sha((old/'manifest.json').read_bytes()) == '3c7b6fdcd526c85427f4540127d92cc24a55a00eec0421ce756765fb2505e1b2'
assert sha((main/'left-main-draft.patch').read_bytes()) == '2aa33a36595d5dc1a61fc76c7cb7cd97ccd829563d1718f8706d1611936a98dd'
assert sha((main/'manifest.json').read_bytes()) == '174b5d34348b86f97762aa70a75e5c8682509708a9232aaf6fffbde213c9f9ea'
review=root/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/left-drafts/review.md'
assert sha(review.read_bytes()) == 'ec6e8645291f8c1521aea5c023ffcaef3410513fc1b519b8b48401667c06dbb5'
checks=[]; overlay={}; before_count=0; after_count=0
for f, prior in zip(manifest['files'],old_manifest['files']):
    assert f['path']==prior['path'] and f['beforeSha256']==prior['beforeSha256']
    assert f['beforeTestMethods']==prior['beforeTestMethods'] and f['afterTestMethods']==prior['afterTestMethods']
    original=(root/f['path']).read_bytes(); assert sha(original)==f['beforeSha256']
    candidate=b'' if f['operation']=='delete' else (out/'repo'/f['path']).read_bytes()
    assert (None if f['operation']=='delete' else sha(candidate))==f['afterSha256']
    if f['operation']!='delete':
        assert balanced(candidate.decode()); assert set(f['beforeTestMethods']).issubset(f['afterTestMethods'])
    if not f['path'].endswith('/GuidedPublicationMigrationTest.java') and f['operation']!='delete':
        assert candidate==(old/'repo'/f['path']).read_bytes()
    overlay[f['path']]=candidate.decode()
    before_count+=len(f['beforeTestMethods']); after_count+=len(f['afterTestMethods'])
    checks.append({'path':f['path'],'actualPreimageMatches':True,'candidateSha256':f['afterSha256'],'existingMethodsPreservedOrNamedRetirement':True})
assert (before_count,after_count)==(80,78)
data_patch=(out/'left-data-draft.patch').read_text(); main_patch=(main/'left-main-draft.patch').read_text()
assert sha(data_patch.encode())==manifest['patchSha256']
sections=patch_sections(data_patch+main_patch); assert len(sections)==16
assembly=[]
for f in manifest['files']+main_manifest['files']:
    source=(root/f['path']).read_text(); assert sha(source.encode())==f['beforeSha256']
    after=apply_patch(source,sections[f['path']])
    expected='' if f['operation']=='delete' else ((out if f in manifest['files'] else main)/'repo'/f['path']).read_text()
    assert after==expected
    assert (None if f['operation']=='delete' else sha(after.encode()))==f['afterSha256']
    assembly.append({'path':f['path'],'reconstructedExactlyInMemory':True,'sha256':f['afterSha256'],'operation':f['operation']})
# The separate correction touches only the new J2/J4/J8 method, never earlier head methods.
p='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java'
a=(old/'repo'/p).read_text(); b=overlay[p]
start='  /** Ports the retired adapter\'s Java-held negatives through the real head writer. */'
end='  private static PublicationContracts.Commit changedCommand('
assert a[:a.index(start)]==b[:b.index(start)]
assert a[a.index(end):]==b[b.index(end):]
assert b.count('"J8 SQL immutable-expiry guard rejects the UPDATE before commit"')==1
block=b[b.index('// J8 SQL tier:'):b.index('// A transaction-local receipt trigger')]
assert 'publications.commit(' not in block
assert block.index('t.setRollbackOnly()') < block.index('db.jdbc.update(')
for oracle in ['DataAccessException.class','PSQLException.class','getSQLState()).isEqualTo("P0001")','getServerErrorMessage().getMessage()','.isEqualTo("guided identity is immutable")','commandRows(db.jdbc, command)','.isEqualTo(before)']: assert oracle in block,oracle
assert 'RuntimeException.class' not in b[b.index(start):b.index(end)]
fixture='backend/src/test/java/com/citi/put/checks/studio/support/GuidedPublicationEvidenceFixture.java'
a=(root/fixture).read_text(); b=overlay[fixture]
start='  public static void captureSharedBootstrap('; end='  private record Exercise('
assert a[a.index(start):a.index(end,a.index(start))]==b[b.index(start):b.index(end,b.index(start))]
assert a[a.index('  private static boolean contains('):]==b[b.index('  private static boolean contains('):]
s011=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text()); migrations=[]
for f in s011['files']:
    if f['path'].startswith('backend/src/main/resources/db/migration/'):
        assert sha((root/f['path']).read_bytes())==f['sha256']; migrations.append(f)
assert len(migrations)==22
allow=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/left-v20-allowed-matches.json').read_text())
v20=allow['matches'][0]['path']; assert sha((root/v20).read_bytes())==allow['sourceSha256']
for item in allow['matches']:
    line=(root/item['path']).read_text().splitlines()[item['line']-1]
    assert line==item['text'] and sha(line.encode())==item['lineSha256']
pattern=json.loads((old/'historical-grep.json').read_text())['pattern']
v18='HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|readHistoricalV18|historical-v18'
hits_before=[];hits_after=[];before_v18=[];after_v18=[]
for file in sorted((root/'backend/src').rglob('*')):
    if not file.is_file(): continue
    try: source=file.read_text()
    except UnicodeDecodeError: continue
    path=str(file.relative_to(root)); candidate=overlay.get(path,source)
    for text, broad, specific in [(source,hits_before,before_v18),(candidate,hits_after,after_v18)]:
        for no,line in enumerate(text.splitlines(),1):
            if re.search(pattern,line): broad.append({'path':path,'line':no,'text':line})
            if re.search(v18,line): specific.append({'path':path,'line':no,'text':line})
assert (len(hits_before),len(hits_after),len(before_v18),len(after_v18))==(78,4,70,0)
assert hits_after==[{k:v for k,v in item.items() if k in ('path','line','text')} for item in allow['matches']]
mutants=[]
for item in json.loads((out/'mutants/manifest.json').read_text())['mutants']:
    source=(root/item['path']).read_text() if item['base']=='frozen-production' else overlay[item['path']]
    assert sha(source.encode())==item['baseSha256']
    patch=(out/'mutants'/(item['id']+'.patch')).read_text(); assert sha(patch.encode())==item['patchSha256']
    after=apply_patch(source,patch); assert sha(after.encode())==item['mutantSha256'] and balanced(after)
    mutants.append({'id':item['id'],'inMemoryReconstruction':True,'runtimeExecuted':False})
result={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'draftOnly':True,'noRuntimeProof':True,'noQaLifecycleApproval':True,'sourceChecks':checks,'candidateLexicalBalanceOnly':True,'preservedOriginalDraftReviewAndMainPackageHashes':True,'combinedAtomicUnit':{'paths':16,'overlap':False,'patchConcatenationSha256':sha((data_patch+main_patch).encode()),'reconstructedFiles':assembly},'caseCounts':{'before':80,'after':78,'existingHeadMethodsDropped':0,'runtimeInvocationCounts':'unexecuted'},'J8SqlTier':{'rollbackOnlyBeforeWrite':True,'noCommitCalled':True,'exactCauseStateServerMessageAssertions':True,'completeRowSnapshotAssertionRetained':True,'javaExpiryBranchProved':False,'originalJavaExpiryBranchProved':False,'newMandatoryJavaExpiryGate':False},'fixtureHelpersExact':['captureSharedBootstrap','contains onward'],'immutableMigrationFiles':migrations,'grep':{'broadBefore':78,'broadAfter':4,'afterMatches':hits_after,'allowlistExact':True,'v18Before':70,'v18After':0,'V20WholeFileSha256':allow['sourceSha256']},'mutants':mutants,'limitations':['No Java compiler, formatter, PostgreSQL, test, Gradle, Node, Docker or provider invoked','All reds/greens/mutants unexecuted','Narrow independent re-review and root application/gate rulings required','Lexical delimiters and in-memory reconstruction are not semantic Java proof']}
(out/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'paths':16,'balancedCandidates':4,'mutants':len(mutants),'sourceCases':[before_count,after_count],'immutableMigrations':22,'broad':[78,4],'v18':[70,0],'combinedPatchSha256':result['combinedAtomicUnit']['patchConcatenationSha256']}))
