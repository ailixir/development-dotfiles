from pathlib import Path
import hashlib, json, re, subprocess
ROOT=Path.cwd()
OUT=ROOT/"docs/qa/evidence/STUDIO-OBS-011/t0/early/left-main-draft"
DATA=ROOT/"docs/qa/evidence/STUDIO-OBS-011/t0/early/left-data-draft"
manifest=json.loads((OUT/"manifest.json").read_text())
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
write=lambda n,v:(OUT/n).write_text(json.dumps(v,indent=2)+"\n")
paths=[p for p in (ROOT/"backend/src").rglob("*") if p.is_file() and p.suffix in (".java",".yml",".yaml",".sql")]
before={str(p.relative_to(ROOT)):p.read_text() for p in paths}
after=dict(before)
for f in manifest["files"]:
    after[f["path"]]=(OUT/"repo"/f["path"]).read_text()
    assert sha(before.get(f["path"],(ROOT/f["path"]).read_text()))==f["beforeSha256"]
    assert sha(after[f["path"]])==f["afterSha256"]
# Lexical mask strips comments and literals while retaining offsets/newlines.
# Used only to count delimiters, inventory constructions, and compare token streams.
def mask(s, literals=True):
    pat=r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    def repl(m):
        if not literals and not m[0].startswith(("//","/*")):return m[0]
        return ''.join('\n' if x=='\n' else ' ' for x in m[0])
    return re.sub(pat,repl,s)

def balanced(s):
    stack=[]
    for c in mask(s):
        if c in '([{':stack.append(c)
        elif c in ')]}':
            if not stack or stack.pop()!={')':'(',']':'[','}':'{'}[c]:return False
    return not stack

def constructions(files):
    result=[]
    pat=re.compile(r'\bnew\s+(?P<type>(?:[A-Za-z_$][\w$]*\.)*(?:StudioExecutionProperties|Dispatcher|Sse))\s*\(')
    for path,s in sorted(files.items()):
        if not path.endswith('.java'):continue
        msk=mask(s)
        for m in pat.finditer(msk):
            start=m.end(); i=start; depth=1
            while depth:
                if msk[i]=='(':depth+=1
                elif msk[i]==')':depth-=1
                i+=1
            args=s[start:i-1]
            masked_args=msk[start:i-1]
            depth2=0; count=1 if masked_args.strip() else 0
            for c in masked_args:
                if c in '([{<':depth2+=1
                elif c in ')]}>':depth2-=1
                elif c==',' and not depth2:count+=1
            result.append({'path':path,'line':s.count('\n',0,m.start())+1,'type':m['type'],'arity':count,'arguments':args.strip()})
    return result
construct_before=constructions(before)
construct_after=constructions(after)
assert len(construct_before)==len(construct_after)
constructor_changes=[]
for b,a in zip(construct_before,construct_after):
    assert b['path']==a['path'] and b['type']==a['type']
    if b['arguments']!=a['arguments']:
        constructor_changes.append({'before':b,'after':a})
        assert b['path'] in {f['path'] for f in manifest['files']}
assert [(c['before']['type'],c['before']['arity'],c['after']['arity']) for c in constructor_changes]==[
    ('Dispatcher',5,4),('Sse',8,7),('StudioExecutionProperties',11,11),('StudioExecutionProperties.Dispatcher',5,4)]
write('positional-constructions.json',{'before':construct_before,'after':construct_after,'changed':constructor_changes,'outerRecordUnchangedArity':True,'notes':['The changed outer 11-argument call retains every outer argument; only its nested Dispatcher expression changes.','No imported/fully qualified/unqualified Dispatcher/Sse construction outside owner and C6 test requires an edit.']})
symbols=['isCanonical','updateAuthoring','allocationIds','isApiAssigned','providerName','getSecretName','pollIntervalOrDefault','readIntervalOrDefault']
greps={}
for symbol in symbols+['CANONICAL','API_ASSIGNED','pollInterval','readInterval','OBSERVED_SCHEDULE_AUTH_REQUIRED','read-interval:','read-interval-ms:','isTerminal','readIntervalMs']:
    pat=re.compile(r'\b'+re.escape(symbol)+r'\b') if symbol[-1].isalnum() else re.compile(re.escape(symbol))
    def matches(files):
        return [{'path':p,'line':i,'text':line.strip()} for p,s in sorted(files.items()) for i,line in enumerate(s.splitlines(),1) if pat.search(line)]
    greps[symbol]={'before':matches(before),'candidateOverlay':matches(after)}
for sym in symbols:
    assert len(greps[sym]['before'])==1 and not greps[sym]['candidateOverlay']
assert not [h for h in greps['OBSERVED_SCHEDULE_AUTH_REQUIRED']['before'] if h['path'].startswith('backend/src/main/java/')]
assert len(greps['isTerminal']['before'])>0
write('before-after-grep.json',{'scope':'all backend/src Java/YAML/SQL, candidate non-data overlay only; no CLN-F2 overlay','exactWordProofRegex':r'\b(isCanonical|updateAuthoring|allocationIds|isApiAssigned|providerName|getSecretName|pollIntervalOrDefault|readIntervalOrDefault)\b','positiveControl':'isTerminal remains present before and after; each removed symbol itself present in its original declaring file','results':greps})
base='backend/src/main/java/com/citi/put/checks/studio/'
prop=base+'StudioExecutionProperties.java'
record_info={}
for name in ['StudioExecutionProperties','Quotas','Dispatcher','Callback','Sse']:
    get=lambda s:re.search(r'public record '+name+r'\(([\s\S]*?)\)\s*\{',s).group(1)
    b=get(before[prop]); a=get(after[prop]); expected=b
    if name=='Dispatcher':expected=expected.replace(', Duration pollInterval','')
    if name=='Sse':expected=expected.replace('      Duration readInterval,\n','')
    assert a==expected
    record_info[name]={'beforeComponents':b.strip(),'afterComponents':a.strip(),'expectedRetainedComponentTypesNamesOrder':True}
secrets=base+'secrets/StudioSecretsService.java'
commentfree=lambda s:re.sub(r'/\*[\s\S]*?\*/','',s)
assert commentfree(before[secrets])==commentfree(after[secrets])
exception=base+'secrets/SecretAlreadyExistsException.java'
assert re.findall(r'super\([^\n]+\);',before[exception])==re.findall(r'super\([^\n]+\);',after[exception])
yaml='backend/src/main/resources/application.yml'
yaml_removed='      read-interval: ${STUDIO_SSE_READ_INTERVAL:750ms}\n'
assert before[yaml].replace(yaml_removed,'')==after[yaml]
assert [l for l in before[yaml].splitlines(True) if 'read-interval-ms:' in l]==[l for l in after[yaml].splitlines(True) if 'read-interval-ms:' in l]
block=lambda s:re.search(r'^  observed-replay:\n(?:(?!^  [a-z]).*\n)*',s,re.M).group(0)
assert block(before[yaml])==block(after[yaml])
service=base+'StudioService.java'
service_edit=next(f for f in manifest['files'] if f['path']==service)['edits']
assert len(service_edit)==1
assert before[service].replace(service_edit[0]['before'],'')==after[service]
# Full remaining Gradle content is exact deletion of the two separately named rule blocks.
gradle='backend/build.gradle.kts'
bg=(ROOT/gradle).read_text(); ag=(OUT/'repo'/gradle).read_text()
gradle_edits=next(f for f in manifest['files'] if f['path']==gradle)['edits']
assert len(gradle_edits)==2
for e in gradle_edits:
    assert e['after']==''
    bg=bg.replace(e['before'],'',1)
assert bg==ag
assert 'studio.compile' not in ag
floors=re.findall(r'minimum = "([0-9.]+)".toBigDecimal\(\)',ag)
assert floors==['0.70','0.75','0.75','0.75','0.75']
for package in ['dispatch','internal','recovery','sse']:
    assert 'includes = listOf("com.citi.put.checks.studio.'+package+'")' in ag
kill='backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioKillSwitchWiringTest.java'
assert before[kill].replace('new StudioExecutionProperties.Dispatcher(false, null, null, null, null)','new StudioExecutionProperties.Dispatcher(false, null, null, null)')==after[kill]
method_names=lambda s:re.findall(r'@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b(?:(?!@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b)[\s\S])*?\bvoid\s+(\w+)\s*\(',s)
assert method_names(before[kill])==method_names(after[kill])
assert len(method_names(before[kill]))==6
account=ROOT/base/'guided/account'
assert account.is_dir() and not list(account.iterdir())
for f in manifest['files']:
    assert balanced((OUT/'repo'/f['path']).read_text()) if f['path'].endswith('.java') else True
write('preservation.json',{'exactSequentialEditsOnly':True,'realSourceFilesStillBeforeHashes':all(sha((ROOT/f['path']).read_text())==f['beforeSha256'] for f in manifest['files']),'recordComponents':record_info,'StudioServiceOutsideAliasByteEqual':True,'StudioSecretsServiceCommentStrippedByteEqual':True,'exceptionConstructorSuperMessageEqual':True,'applicationYmlOnlyOneLeafRemoved':True,'readIntervalMsLinesByteEqual':True,'observedReplayBlockByteEqual':True,'observedReplayBlockSha256':sha(block(before[yaml])),'gradleOutsideTwoRulesByteEqual':True,'coverageFloorsAfter':floors,'coverageTaskWiringByteEqual':True,'killSwitchOnlyFinalNullRemoved':True,'killSwitchTestMethodsUnchanged':method_names(before[kill]),'accountDirectory':{'exists':True,'entries':[],'patchOperation':'none; Git cannot represent an empty directory'},'javaBalancedLexicalDelimiters':True,'notProofOf':'compilation, Spring binding, complete runtime behavior, QA verdict, lane exit'})
checks=[]
for name,patches in [('non-data',[OUT/'left-main-draft.patch']),('atomic-with-data',[OUT/'left-main-draft.patch',DATA/'left-data-draft.patch'])]:
    cmd=['git','apply','--check',*[str(p.relative_to(ROOT)) for p in patches]]
    r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True)
    checks.append({'name':name,'argv':cmd,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'readOnly':True})
    assert r.returncode==0,r.stderr
inputs=['AGENTS.md','.codex/skills/aiox-dev/SKILL.md','.aiox-core/development/agents/dev.md','.aiox-core/constitution.md','.aiox-core/core-config.yaml','docs/qa/evidence/STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261018-CODEX.md','docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v5.json','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v4.md','docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md','docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/t0-proposal.md','docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/qa-cosign.md','docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md',str((DATA/'manifest.json').relative_to(ROOT)),str((DATA/'receipt.md').relative_to(ROOT)),str((DATA/'left-data-draft.patch').relative_to(ROOT))]
write('input-hashes.json',{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in inputs})
test_paths=['backend/src/test/java/com/citi/put/checks/studio/InferenceMigrationLatestIT.java','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationRaceTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedPublicPresentationIT.java','backend/src/test/java/com/citi/put/checks/studio/guided/GuidedReplayingPrefixMigrationIT.java','backend/src/test/java/com/citi/put/checks/studio/StudioServiceWriteAuthorizationTest.java','backend/src/test/java/com/citi/put/checks/studio/secrets/StudioSecretsServiceTest.java',kill,'backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceTest.java']
write('current-test-inventory.json',[{'path':p,'sha256':sha(before[p]),'package':re.search(r'^package ([^;]+);',before[p],re.M).group(1),'testMethodNames':method_names(before[p]),'executedByThisDraft':False} for p in test_paths])
assert not list((ROOT/'backend/src/main/java/com/citi/put/checks/studio').glob('compile/**/*.java'))
write('static-review.json',{'draftOnly':True,'testsOrBuildsRun':False,'patchChecks':checks,'javaFileCount':sum(f['path'].endswith('.java') for f in manifest['files']),'fileCount':len(manifest['files']),'constructorCount':len(construct_before),'constructorChanges':len(constructor_changes),'unownedDependencyPaths':[],'residuals':['Static lexical checks are not a compiler or binding proof.','All runtime tests/compile/formatter/full JaCoCo task execution remain pending after root gates.','CLN-F2 broad grep has four unowned V20 generic verifyHistorical residual lines, retained by root instruction in Dara draft; needs root ruling.','Empty account directory can only be removed from filesystem at application time; no Git file deletion exists.']})
print(json.dumps({'fileCount':len(manifest['files']),'positionalConstructions':len(construct_before),'patchChecks':[{k:c[k] for k in ['name','exitCode']} for c in checks],'realSourcesUntouched':True}))
