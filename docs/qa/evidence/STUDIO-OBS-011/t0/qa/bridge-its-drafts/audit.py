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

audit={'scope':'static only; no Java execution/compiler/test or gate approval','inputs':{},'bridge':{},'its':{}}
previous=BASE/'gs-t-draft'
audit['previousGsTStart']=digest_tree(previous)
for folder,patchnames in [('gs-t2-draft',['candidate.patch']),('it-s-draft',['it-s-incremental.patch','it-s-from-s011.patch'])]:
    d=BASE/folder
    audit['inputs'][folder]=digest_tree(d)
    man=load(d/'manifest.json'); rows=man['owned'] if isinstance(man,dict) else man
    cb='candidates' if folder=='gs-t2-draft' else 'repo'
    pre={r['path']:(d/'preimages'/r['path']).read_bytes() for r in rows if (d/'preimages'/r['path']).exists()}
    original={r['path']:(ROOT/r['path']).read_bytes() for r in rows if (ROOT/r['path']).exists()}
    expected={r['path']:(d/cb/r['path']).read_bytes() for r in rows}
    for patchname in patchnames:
        recon=apply((d/patchname).read_text(), original if 'from-s011' in patchname else pre)
        assert recon==expected,(folder,patchname)
    for r in rows:
        assert sha(expected[r['path']])==r['candidateSha256']
        if r['path'] in pre:assert sha(pre[r['path']])==r['preimageSha256']
        if r['path'] in original:assert sha(original[r['path']])==r.get('actualS011Sha256',r['preimageSha256'])
        else:assert r.get('operation')=='new'
    section=audit['bridge' if folder=='gs-t2-draft' else 'its']
    section['reconstructedPaths']=list(expected)
    section['files']=[]
    for path,data in expected.items():
        old=pre.get(path,b'').decode();new=data.decode();before=tests(old);after=tests(new)
        assert before==after,(path,'test signature/annotation preservation')
        ba=assertion_roots(old);aa=assertion_roots(new)
        norm=lambda roots:[[t for t in row] for row in roots]
        if folder=='it-s-draft':
            # Explicit local holder rebinding only; compare ordered full assertion arguments.
            normed=[]
            for row in aa:
                row=' '.join(row).replace('itsPoll . waited','waited').replace('itsPoll . waiting','waiting')
                normed.append(row)
            assert [' '.join(x) for x in ba]==normed,(path,'ordered assertion root argument mismatch')
        section['files'].append({'path':path,'preimage':sha(old.encode()) if old else None,'candidate':sha(data),'methods':len(before),'cases':before,'assertionRootCountBefore':len(ba),'assertionRootCountAfter':len(aa),'sleepBefore':len(re.findall(r'\.sleep\s*\(',old)),'sleepAfter':len(re.findall(r'\.sleep\s*\(',new))})
    section['testMethods']=sum(x['methods'] for x in section['files'])
    if folder=='gs-t2-draft':
        for f in section['files']:
            if not f['methods']:continue
            old=(d/'preimages'/f['path']).read_text();new=(d/cb/f['path']).read_text()
            for c in f['cases']:
                assert testbody(old,c['method'])==undo_directwaits(undo_env(testbody(new,c['method']))),(f['path'],c['method'],'original test body mismatch after explicit ownership and wait inverse')
            f['allTestBodiesExactAfterEnvironmentAndWaitInverse']=True

# Independently compose actual Transport through its preceding GS-T full candidate.
tp=next(x for x in audit['its']['reconstructedPaths'] if x.endswith('/GuidedServiceTransportFaultIT.java'))
gspath=next(p for p in previous.rglob('GuidedServiceTransportFaultIT.java') if 'candidate' in str(p) or '/repo/' in str(p))
assert gspath.read_bytes()==(BASE/'it-s-draft/preimages'/tp).read_bytes()
audit['its']['transportBatonSha256']=sha(gspath.read_bytes())

# Parse actual B1 XML, not the author JSON's count fields.
xmlroot=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-task-outputs/test/xml'
for section in ('bridge','its'):
    for f in audit[section]['files']:
        if not f['methods']:continue
        simple=Path(f['path']).stem;xml=next(xmlroot.glob('*.'+simple+'.xml'));r=ET.parse(xml).getroot(); names=[x.attrib['name'] for x in r.findall('testcase')]
        f['B1']={'path':str(xml.relative_to(ROOT)),'sha256':sha(xml.read_bytes()),'tests':len(names),'suiteTimeSeconds':float(r.attrib['time']),'failed':int(r.attrib['failures'])+int(r.attrib['errors']),'skipped':int(r.attrib['skipped']),'caseNames':names}
        # Every plain test identity must occur once by its actual native case name.
        for c in f['cases']:
            if not c['parameterized']:assert sum(n==c['method']+'()' for n in names)==1,(simple,c['method'])
        source=(BASE/('gs-t2-draft/preimages' if section=='bridge' else 'it-s-draft/preimages')/f['path']).read_text()
        derived=[name for c in f['cases'] for name in native_names(c,source)]
        assert collections.Counter(derived)==collections.Counter(names),(simple,'independently source-derived native names',derived,names)
        f['independentExpectedNames']=derived
        f['sourceDerivedInvocationCount']=len(derived)

# Original orphan closure: remove exact source bodies, then prove none of nine names is called.
orph=load(BASE/'gs-t2-draft/orphan-helpers.json')['GuidedBridgeIntegrationTest']
ip=BASE/'gs-t2-draft/preimages/backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java'
itext=ip.read_text()
for name,body in orph.items():assert itext.count(body)==1;itext=itext.replace(body,'')
remaining=lex(itext)
audit['bridge']['orphanCallsAfterClosureRemoval']={name:sum(remaining[i]==name and remaining[i+1]=='(' for i in range(len(remaining)-1)) for name in orph}
assert not any(audit['bridge']['orphanCallsAfterClosureRemoval'].values())
audit['previousGsTEnd']=digest_tree(previous)
assert audit['previousGsTStart']==audit['previousGsTEnd']
main=load(BASE/'gs-t2-draft/main-s011-hashes.json')
assert {x['path'] for x in main}=={str(x.relative_to(ROOT)) for x in (ROOT/'backend/src/main').rglob('*') if x.is_file()}
for x in main:assert sha((ROOT/x['path']).read_bytes())==x['sha256']
audit['mainS011MembershipAndHashCount']=len(main)
audit['manifestHashes']={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in [BASE/'gs-t2-draft/manifest.json',BASE/'it-s-draft/artifact-manifest.json']}
artifact=load(BASE/'it-s-draft/artifact-manifest.json')
for path,expected in artifact.items():assert sha((BASE/'it-s-draft'/path).read_bytes())==expected
audit['itsArtifactManifestEntriesVerified']=len(artifact)
rows=load(BASE/'it-s-draft/loop-edits.json');after='\n'.join(p.read_text() for p in (BASE/'it-s-draft/repo').rglob('*.java'))
audit['itsReplacementMetadata']=[{'id':r['id'],'literalReplacementOccursInCandidate':r['replacement'] in after,'replacementShaSelfConsistent':sha(r['replacement'].encode())==r['newSha256']} for r in rows]
audit['allSourcePreimagesStillCurrent']=all(not (ROOT/x['path']).exists() if x.get('operation')=='new' else sha((ROOT/x['path']).read_bytes())==x.get('actualS011Sha256',x['preimageSha256']) for x in load(BASE/'gs-t2-draft/manifest.json')['owned']+load(BASE/'it-s-draft/manifest.json'))
assert audit['allSourcePreimagesStillCurrent']
audit['noCompilerOrRuntimeExecution']=True
(OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'reconstruction':'9 paths plus incremental/S011 Transport composition exact','bridgeMethods':audit['bridge']['testMethods'],'itsMethods':audit['its']['testMethods'],'bridgeB1':sum(x.get('B1',{}).get('tests',0) for x in audit['bridge']['files']),'itsB1':sum(x.get('B1',{}).get('tests',0) for x in audit['its']['files']),'itsAssertionRoots':sum(x['assertionRootCountBefore'] for x in audit['its']['files']),'previousGsTUnchanged':True},indent=2))
