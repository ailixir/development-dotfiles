"""Independent read-only reconstruction/case audit. Writes only this review directory."""
from pathlib import Path
import hashlib, json, re, collections, xml.etree.ElementTree as ET

ROOT = Path.cwd()
BASE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early'
OUT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts'
def sha(b): return hashlib.sha256(b).hexdigest()
def load(p): return json.loads(p.read_text())
def digest_tree(p): return {str(x.relative_to(p)): sha(x.read_bytes()) for x in sorted(p.rglob('*')) if x.is_file()}
def lex(s):
    # Preserve literals atomically; discard only comments/whitespace.
    pat = r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S'
    return [m.group() for m in re.finditer(pat,s) if not m.group().startswith(('//','/*'))]
def balanced(ts, i, a='(',b=')'):
    assert ts[i]==a
    n=0
    for j in range(i,len(ts)):
        n += ts[j]==a
        n -= ts[j]==b
        if n==0:return j
    raise AssertionError('unbalanced')
def tests(s):
    ts=lex(s); out=[]; i=0
    while i<len(ts):
        if ts[i]!='@': i+=1;continue
        j=i+2
        while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
        kind=''.join(ts[i+1:j])
        if kind.split('.')[-1] not in ('Test','ParameterizedTest'):i+=1;continue
        begin=i
        if ts[j]=='(':j=balanced(ts,j)+1
        ann=[]
        while ts[j]=='@':
            a=j;j+=2
            while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
            if ts[j]=='(':j=balanced(ts,j)+1
            ann.extend(ts[a:j])
        while ts[j]!='(':j+=1
        name=ts[j-1]; end=balanced(ts,j)
        out.append({'method':name,'headerTokens':ts[begin:end+1], 'parameterized':kind.endswith('ParameterizedTest'),'providerTokens':ann})
        i=end+1
    return out
def assertion_roots(s):
    ts=lex(s);out=[]
    for i,t in enumerate(ts):
        if (t.startswith('assertThat') or t in ('assertThrows','assertEquals','assertTrue','assertFalse','fail')) and i+1<len(ts) and ts[i+1]=='(':
            end=balanced(ts,i+1);out.append(ts[i:end+1])
    return out
def testbody(s,name):
    ts=lex(s)
    for i,t in enumerate(ts):
        if t==name and ts[i+1]=='(':
            end=balanced(ts,i+1);j=end+1
            while j<len(ts) and ts[j] not in ('{',';'):j+=1
            if j<len(ts) and ts[j]=='{':return ts[j+1:balanced(ts,j,'{','}')]
    raise AssertionError(name)
def undo_env(ts):
    members={x['afterPerClassEnvironmentMember']:x['beforeStaticField'] for x in load(BASE/'gs-t2-draft/state-reader-map.json')}
    out=[];i=0
    while i<len(ts):
        if ts[i:i+2]==['ENV','.']:
            out.append(members[ts[i+2]]);i+=3
        else:out.append(ts[i]);i+=1
    return out
def undo_directwaits(ts):
    out=[];i=0
    prefix=['org','.','awaitility','.','Awaitility','.','await','(',')']
    while i<len(ts):
        if ts[i:i+len(prefix)]!=prefix:out.append(ts[i]);i+=1;continue
        j=i+len(prefix);timeout=None;until=None
        while ts[j]=='.':
            method=ts[j+1];assert ts[j+2]=='(';end=balanced(ts,j+2);args=ts[j+3:end]
            if method=='atMost':timeout=args[args.index('ofMillis')+2]
            if method=='until':until=args;j=end+1;break
            j=end+1
        assert until and timeout and ts[j]==';'
        j+=1
        # Original helper final fresh read was expanded at each call site.
        arrow=next(k for k in range(len(until)-1) if until[k:k+2]==['-','>'])
        expr=until[arrow+2:]
        expected=['assertThat','(']+expr+[')', '.', 'isTrue','(',')',';']
        assert ts[j:j+len(expected)]==expected
        out+=['await','(']+until+[',',timeout,')',';'];i=j+len(expected)
    return out
def native_names(case, source):
    if not case['parameterized']: return [case['method']+'()']
    pt=case['providerTokens']; h=case['headerTokens'];start=h.index('(',h.index(case['method']))
    args=h[start+1:-1]; segments=[];last=0
    for i,t in enumerate(args):
        if t==',':segments.append(args[last:i]);last=i+1
    segments.append(args[last:]);params=[x[-1] for x in segments]
    if 'EnumSource' in pt:
        enumname=pt[pt.index('EnumSource')+2]; tokens=lex(source);start=tokens.index(enumname,tokens.index('enum'))+1
        assert tokens[start]=='{';end=tokens.index(';',start) if ';' in tokens[start:balanced(tokens,start,'{','}')+1] else balanced(tokens,start,'{','}')
        vals=[[x] for x in tokens[start+1:end] if re.match(r'^[A-Z_0-9]+$',x)]
    else:
        start=pt.index('{');end=balanced(pt,start,'{','}');content=pt[start+1:end]
        if 'CsvSource' in pt:
            vals=[[v.strip() for v in json.loads(t).split(',')] for t in content if t.startswith('"')]
        else:
            vals=[[json.loads(t) if t.startswith('"') else t] for t in content if t!=',']
    assert all(len(v)==len(params) for v in vals)
    return ['['+str(i+1)+'] '+', '.join(k+'='+v for k,v in zip(params,row)) for i,row in enumerate(vals)]
def apply(patch,base):
    lines=patch.splitlines(keepends=True); result={};i=0
    while i<len(lines):
        if not lines[i].startswith('--- '):i+=1;continue
        old=lines[i][4:].strip();new=lines[i+1][4:].strip();i+=2
        path=new.removeprefix('b/'); src=[] if old=='/dev/null' else base[path].decode().splitlines(keepends=True)
        dst=[];pos=0
        while i<len(lines) and not lines[i].startswith('--- '):
            m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i])
            if not m:i+=1;continue
            start=int(m[1])-1 if int(m[1]) else 0
            assert start>=pos,(path,start,pos)
            dst+=src[pos:start];pos=start;i+=1
            oldcount=newcount=0
            while i<len(lines) and not lines[i].startswith(('@@','--- ')):
                l=lines[i]
                if l.startswith(' '):assert src[pos]==l[1:];dst.append(l[1:]);pos+=1;oldcount+=1;newcount+=1
                elif l.startswith('-'):assert src[pos]==l[1:];pos+=1;oldcount+=1
                elif l.startswith('+'):dst.append(l[1:]);newcount+=1
                elif l.startswith('\\'):pass
                else:raise AssertionError((path,l))
                i+=1
            assert oldcount==int(m[2] or 1) and newcount==int(m[4] or 1),(path,oldcount,newcount)
        dst+=src[pos:];result[path]=''.join(dst).encode()
    return result


OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts-rereview'

audit={'scope':'independent corrected draft static re-review only; no Java/compiler/probe execution','packages':{},'loops':[]}
prior=load(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts/audit.json')
assert digest_tree(BASE/'gs-t-draft')==prior['previousGsTStart']
audit['originalGsTUnchanged']=True
for folder,cb,forms in [
    ('gs-t2-draft','candidates',[('candidate.patch','actual'),('incremental-from-reviewed.patch','reviewed')]),
    ('it-s-draft','repo',[('it-s-incremental.patch','preimage'),('it-s-from-s011.patch','actual'),('incremental-from-reviewed.patch','reviewed')])]:
    old=BASE/folder;d=old/'resume2'
    # Nested corrected packages are new, not modifications of original package artifacts.
    oldnow={p:sha((old/p).read_bytes()) for p in prior['inputs'][folder]}
    assert oldnow==prior['inputs'][folder]
    assert {str(p.relative_to(old)) for p in old.rglob('*') if p.is_file() and not str(p.relative_to(old)).startswith('resume2/')}==set(prior['inputs'][folder])
    man=load(d/'manifest.json');rows=man['owned'] if isinstance(man,dict) else man
    expected={r['path']:(d/cb/r['path']).read_bytes() for r in rows}
    pre={r['path']:(d/'preimages'/r['path']).read_bytes() for r in rows if (d/'preimages'/r['path']).exists()}
    original={r['path']:(ROOT/r['path']).read_bytes() for r in rows if (ROOT/r['path']).exists()}
    reviewed={r['path']:(old/cb/r['path']).read_bytes() for r in rows}
    bases={'preimage':pre,'actual':original,'reviewed':reviewed}
    for patchname,basekey in forms:
        changes=apply((d/patchname).read_text(),bases[basekey]);recon=dict(bases[basekey]);recon.update(changes)
        assert recon==expected,(folder,patchname)
    if folder=='it-s-draft':
        for r in rows:
            for suffix,bkey in [('incremental','preimage'),('from-s011','actual'),('from-reviewed','reviewed')]:
                patch=d/'patches'/(Path(r['path']).stem+'.'+suffix+'.patch')
                assert apply(patch.read_text(),bases[bkey])=={r['path']:expected[r['path']]}
    for r in rows:
        assert sha(expected[r['path']])==r['candidateSha256']
        if r['path'] in pre:assert sha(pre[r['path']])==r['preimageSha256']
        if r['path'] in original:assert sha(original[r['path']])==r.get('actualS011Sha256',r['preimageSha256'])
        else:assert r.get('operation')=='new'
    artifact=load(d/'artifact-manifest.json')
    for path,h in artifact.items():assert sha((d/path).read_bytes())==h,(folder,path)
    section={'snapshot':digest_tree(d),'files':[],'patchFormsReconstruct':forms,'perFilePatchCount':18 if folder=='it-s-draft' else 0,'artifactEntriesVerified':len(artifact),'originalPackageInputsUnchanged':True}
    loops=load(d/'loop-edits.json')
    for r in loops:
        full=expected[r['path']].decode();assert full.count(r['replacement'])==1
        assert sha(r['replacement'].encode())==r['newSha256']
        assert re.match(r'^[A-Za-z_$][\w$]*$',r['classIdentifier'])
        block=lex(r['replacement']);assert block.count('terminal')>=4
        assert block.count('dontCatchUncaughtExceptions')==1
        assert block.count('pollInSameThread')==1
        assert block.count('step')>=4
        # Every fresh true return marks terminal first; only the already-terminal guard skips assignment.
        returns=[i for i,t in enumerate(block) if block[i:i+3]==['return','true',';']]
        for i in returns:
            assert block[i-4:i]==['terminal','=', 'true',';'] or block[i-4:i]==['(', 'terminal', ')','{'],(r['id'],block[i-6:i+3])
        obj='bridgePoll' if folder=='gs-t2-draft' else 'itsPoll'
        assert ['if','(','!',obj,'.','terminal',')','{',obj,'.','step','(',')',';','}'] in [block[i:i+15] for i in range(len(block)-14)]
        assert block.count('failure')>=4,(r['id'],block.count('failure'))
        record={'id':r['id'],'path':r['path'],'literalOccurrenceCount':1,'classIdentifier':r['classIdentifier'],'sha256':r['newSha256'],'terminalReturns':len(returns),'sameThreadAndNoUncaught':True,'guardedTimeoutFallback':True}
        audit['loops'].append(record)
    for path,b in expected.items():
        oldtext=pre.get(path,b'').decode();text=b.decode();bt=tests(oldtext);at=tests(text);assert bt==at,(path,'test identities')
        assertions=assertion_roots(text)
        if folder=='it-s-draft':
            norm=[' '.join(x).replace('itsPoll . waited','waited').replace('itsPoll . waiting','waiting') for x in assertions]
            assert [' '.join(x) for x in assertion_roots(oldtext)]==norm,(path,'assertions')
            inverse=text
            for row in loops:
                if row['path']!=path:continue
                blocktext=' '.join(lex(row['replacement']))
                blocktext=blocktext.replace('boolean terminal ;','').replace('if ( terminal ) { return true ; }','').replace('terminal = true ;','')
                blocktext=blocktext.replace('if ( ! itsPoll . terminal ) { itsPoll . step ( ) ; }','itsPoll . step ( ) ;')
                inverse=inverse.replace(row['replacement'],blocktext)
            assert lex(inverse)==lex(reviewed[path].decode()),(path,'unexpected non-latch source delta')
        else:
            unrolled=text
            for r in loops:
                if r['path']==path:unrolled=unrolled.replace(r['replacement'],r['originalReviewedBlock'])
            assert lex(unrolled)==lex(reviewed[path].decode()),(path,'surrounding reviewed bridge unchanged')
            for case in bt:assert testbody(oldtext,case['method'])==undo_directwaits(undo_env(testbody(unrolled,case['method']))),(path,case['method'])
        f={'path':path,'preimage':sha(oldtext.encode()) if oldtext else None,'candidate':sha(b),'testMethods':len(bt),'testAnnotations':bt,'assertionRootsBefore':len(assertion_roots(oldtext)),'assertionRootsAfter':len(assertions),'sleepsBefore':len(re.findall(r'\.sleep\s*\(',oldtext)),'sleepsAfter':len(re.findall(r'\.sleep\s*\(',text))}
        if bt:
            xml=next((ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-task-outputs/test/xml').glob('*.'+Path(path).stem+'.xml'));root=ET.parse(xml).getroot();native=[n.attrib['name'] for n in root.findall('testcase')]
            derived=[n for c in bt for n in native_names(c,oldtext)]
            assert collections.Counter(native)==collections.Counter(derived)
            f['nativeB1CaseNames']=native;f['sourceExpectedNativeNames']=derived;f['B1XmlSha256']=sha(xml.read_bytes());f['invocations']=len(derived)
        section['files'].append(f)
    audit['packages'][folder]=section

bridge=BASE/'gs-t2-draft/resume2';its=BASE/'it-s-draft/resume2'
fixture='backend/src/test/java/com/citi/put/checks/studio/guided/bridge/support/GuidedBridgeFixture.java'
assert (bridge/'candidates'/fixture).read_bytes()==(BASE/'gs-t2-draft/candidates'/fixture).read_bytes()
audit['bridgeFixtureUnchanged']=True
transport='backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java'
assert sha((its/'preimages'/transport).read_bytes())=='10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5'
for row in load(bridge/'main-s011-hashes.json'):assert sha((ROOT/row['path']).read_bytes())==row['sha256']
assert {r['path'] for r in load(bridge/'main-s011-hashes.json')}=={str(p.relative_to(ROOT)) for p in (ROOT/'backend/src/main').rglob('*') if p.is_file()}
audit['mainS011FileHashesVerified']=len(load(bridge/'main-s011-hashes.json'))
expectedbindings={
    'gs-t2-draft/resume2/receipt.md':'0605ee3ce49c6a54c9a9a9d934836d3b3a4186742c44434d08f492432a7e2551',
    'gs-t2-draft/resume2/candidate.patch':'fe9568cfdcc9e1c6f4401447a86efb6f2b2d9a2294e5b480778ced20a2cad11f',
    'gs-t2-draft/resume2/artifact-manifest.json':'59213292afeb9407e6b9dabd8591c683c95716bec4f5362ada6a3449a28bf70e',
    'it-s-draft/resume2/receipt.md':'72f40ad88ccf568f5d72c15d99df3d7956d76f3af52af982a499398a66497f98',
    'it-s-draft/resume2/it-s-incremental.patch':'33fb03760387df2e089a22a52716da7aeaedbf958cc73a88c4a3dd1dcf8d6a4e',
    'it-s-draft/resume2/it-s-from-s011.patch':'d27a2eefd674ed68ca085fc751404b778873df001aa76a9f6b5c869f41038d16',
    'it-s-draft/resume2/artifact-manifest.json':'4a30cce14acaf25fb611b560be964a84390449a66b7dfd0b827c9d3fec50c45c',
}
for path,h in expectedbindings.items():assert sha((BASE/path).read_bytes())==h,(path,'dispatch digest')
audit['dispatchDigestsVerified']=expectedbindings

# Validate exact emitted source block methods independently of the author generation checks.
conf=its/'conformance';bindings=load(conf/'bindings.json');java=(conf/'WaitConformance.java').read_text()
assert sha(java.encode())==bindings['generatedJavaSha256']
assert len(bindings['cases'])==26 and bindings['modesPerSite']==9
loopmap={r['id']:r for r in load(bridge/'loop-edits.json')+load(its/'loop-edits.json')}
for row in bindings['cases']:
    literal=loopmap[row['id']]['replacement'];assert sha(literal.encode())==row['deliveredBoundSha256']
    assert row['separateFinalStatementSha256']==sha(row['separateOriginalFinalStatement'].encode())
    # Full generated method contents are checked below by source-aware transformation comparison.
    block=testbody(java,row['variantMethods'][1]);delivered=lex(literal)
    if row['id'].startswith('GuidedBridge'):
        delivered=lex(literal.replace(loopmap[row['id']]['condition'],'condition.getAsBoolean()').replace('TimeUnit.MILLISECONDS.toNanos('+str(loopmap[row['id']]['timeoutMillis'])+')','TimeUnit.MILLISECONDS.toNanos(timeout)'))
    elif row['id']=='Transport-actual-stop':delivered=lex(literal.replace('return;','return "COMPLETED";'))
    assert any(block[i:i+len(delivered)]==delivered for i in range(len(block)-len(delivered)+1)),(row['id'],'generated delivered block')
    isbridge=row['id'].startswith('GuidedBridge')
    if isbridge:
        original=(bridge/'preimages'/row['path']).read_text()
        helper=original[original.index('  static void await('):original.rfind('\n}')]
        assert sha(helper.encode())==row['originalBoundSha256']
        originaltokens=testbody(original,'await')
    else:
        original=(its/'preimages'/row['path']).read_text()
        originaltext=loopmap[row['id']]['originalLoop']
        assert original.count(originaltext)==1
        assert sha(originaltext.encode())==row['originalBoundSha256']
        originaltokens=lex(originaltext)
        if row['id']=='Transport-actual-stop':originaltokens=lex(originaltext.replace('return;','return "COMPLETED";'))
    originalmethod=testbody(java,row['variantMethods'][0])
    assert any(originalmethod[i:i+len(originaltokens)]==originaltokens for i in range(len(originalmethod)-len(originaltokens)+1)),(row['id'],'generated original control flow')
    if row['separateOriginalFinalStatement']:
        statement=lex(row['separateOriginalFinalStatement'])
        assert row['separateOriginalFinalStatement'] in original,(row['id'],'actual original final check')
        assert any(originalmethod[i:i+len(statement)]==statement for i in range(len(originalmethod)-len(statement)+1)),(row['id'],'generated original final check')
for jar in load(conf/'classpath.json')['jars']:assert sha(Path(jar['path']).read_bytes())==jar['sha256']
audit['conformance']={'generatedJavaSha256':sha(java.encode()),'sites':len(bindings['cases']),'modesPerSite':9,'plannedComparisons':234,'executionStatus':'UNEXECUTED','all26DeliveredBlocksPresentAfterNamedAdapters':True,'allLocalClasspathHashesVerified':True}
for folder,data in audit['packages'].items():assert digest_tree(BASE/folder/'resume2')==data['snapshot']
assert digest_tree(BASE/'gs-t-draft')==prior['previousGsTStart']
(OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'paths':sum(len(x['files']) for x in audit['packages'].values()),'loops':len(audit['loops']),'methods':{k:sum(f['testMethods'] for f in v['files']) for k,v in audit['packages'].items()},'invocations':{k:sum(f.get('invocations',0) for f in v['files']) for k,v in audit['packages'].items()},'itsAssertions':sum(f['assertionRootsBefore'] for f in audit['packages']['it-s-draft']['files']),'conformancePlannedComparisons':234,'noCompilerOrProbeRun':True},indent=2))
