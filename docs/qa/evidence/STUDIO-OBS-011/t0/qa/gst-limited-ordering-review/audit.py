"""Independent authority/source/public-archive audit; no writer, compiler or native execution."""
from pathlib import Path
import collections,datetime,hashlib,json,os,re,stat

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T0/'early/gs-t-draft';ARCH=T0/'resume-architecture/resume2/t0-ordering-audit'
OUT=T0/'qa/gst-limited-ordering-review';facts={};checks=[]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def read(p):
    assert p.is_relative_to(ROOT)
    for x in [p,*p.parents]:assert not x.is_symlink()
    a=p.stat();b=p.read_bytes();z=p.stat()
    assert (a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns,a.st_mode)==(z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns,z.st_mode)
    f={'sha256':sha(b),'bytes':len(b),'mode':f'{stat.S_IMODE(a.st_mode):04o}'}
    if p in facts:assert facts[p]==f
    facts[p]=f;return b
def load(p):return json.loads(read(p))
def check(name,v):assert v,name;checks.append(name)
def write(name,obj):
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(obj,f,indent=2);f.write('\n')
proposal_path=T0/'runtime/gst-limited-start-proposal01/proposal.json';proposal=load(proposal_path)
check('exact concrete unreleased proposal',sha(read(proposal_path))=='21e3262977a1b89d4a3bb3176611e15668bf5e3d757eaa8a45bf8a631f4980a4' and proposal['sourceWriteReleased'] is False and proposal['actualExecution'] is False)
check('exact Aria ordering audit',sha(read(ARCH/'review.md'))=='6fcc22bd8bf11587e3644e3235bcad71640501645df83fc83d82cd369c2f5cb6')
quotes=load(ARCH/'authority-quotes.json');quote_count=0
for group in quotes['rows']:
    p=ROOT/group['path'];b=read(p);check('primary authority hash '+group['id'],sha(b)==group['sha256']);lines=b.decode().splitlines()
    for q in group['quotes']:
        check('primary exact line '+group['id']+':'+str(q['line']),lines[q['line']-1]==q['text']);quote_count+=1
check('44 exact source quotations',quote_count==44)
plan=load(T0/'lanes.v7.json');gst=next(x for x in plan['lanes'] if x['id']=='11-GS-T');t0=next(x for x in plan['lanes'] if x['id']=='11-T0')
check('v7 main invariant not narrowed','All backend/src/main bytes equal S_011 across the complete GS-T proof gate'==plan['gstUnchangedMainOrder']['claim'])
check('original full-signature condition retained','t0-record signed by root' in t0['exit'] and gst['startsWhen']==['11-T0 exit'])
gst_java_paths={m[1] for x in gst['writes'] if (m:=re.fullmatch(r'(backend/src/test/[^ ()]+\.java)(?: \(RC-3; 5 @Test\))?',x))}
check('exact three-file approved writer membership',{x['file'] for x in proposal['writerBindings']}==gst_java_paths)
check('complete patch and manifest bound',sha(read(D/'gs-t-draft.patch'))==proposal['patchSha256']=='95290e1b7b383f6d2fceb1ae06874e5f8dae61969356bdf6100b879973d43cda' and sha(read(D/'draft-manifest.json'))==proposal['draftManifestSha256'])
draft_manifest=load(D/'draft-manifest.json')
check('proposal exact candidate map',draft_manifest==[{k:v for k,v in row.items() if k!='currentMode'} for row in proposal['writerBindings']])

def apply(src,patch):
    old=src.splitlines(keepends=True);lines=patch.splitlines(keepends=True);out=[];cursor=0;i=2
    while i<len(lines):
        m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n?',lines[i]);assert m
        start=int(m[1])-1;assert start>=cursor;out+=old[cursor:start];cursor=start;i+=1;oc=nc=0
        while i<len(lines) and not lines[i].startswith('@@ '):
            line=lines[i];assert line[0] in ' +-'
            if line[0] in ' -':assert old[cursor]==line[1:];cursor+=1;oc+=1
            if line[0] in ' +':out.append(line[1:]);nc+=1
            i+=1
        assert oc==int(m[2] or 1) and nc==int(m[4] or 1)
    return ''.join(out+old[cursor:])
patch=read(D/'gs-t-draft.patch').decode();parts=re.split(r'(?m)(?=^--- a/)',patch);parts=[x for x in parts if x]
check('three patch targets',len(parts)==3)
def masked(s):
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*',lambda m:' '*len(m[0]),s)
def tokens(s):
    return re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_$][\w$]*|\d+|\S',re.sub(r'/\*[\s\S]*?\*/|//[^\n]*','',s))
def methods(s):
    clean=masked(s);out=[]
    for a in re.finditer(r'@(?:[A-Za-z_$][\w$]*\.)*(Test|ParameterizedTest)\b',clean):
        sig=re.search(r'\bvoid\s+(\w+)\s*\(',clean[a.end():]);assert sig
        name=sig[1];start=clean.index('{',a.end()+sig.end());depth=1;i=start+1
        while depth:depth+=(clean[i]=='{')-(clean[i]=='}');i+=1
        out.append((name,a[1],s[start+1:i-1]))
    return out
def assertion_statements(body):
    mask=masked(body);out=[]
    for m in re.finditer(r'\b(?:assertThat\w*|assertThrows|assertEquals|assertTrue|assertFalse|assertNull|assertNotNull)\s*\(',mask):
        depth=0;i=m.start()
        while i<len(mask):
            c=mask[i]
            if c in '([{':depth+=1
            elif c in ')]}':depth-=1
            elif c==';' and depth==0:out.append(tokens(body[m.start():i+1]));break
            i+=1
    return out
def subsequence(needle,haystack):
    at=0
    for row in haystack:
        if at<len(needle) and row==needle[at]:at+=1
    return at==len(needle)
writer_summary=[];candidate_map={}
for part in parts:
    name=part.splitlines()[0][len('--- a/'):];row=next(x for x in proposal['writerBindings'] if x['file']==name)
    old=read(ROOT/name).decode();new=read(D/'repo'/name).decode();candidate_map[name]=new
    check('exact current preimage '+name,sha(old.encode())==row['beforeSha256'] and facts[ROOT/name]['mode']==row['currentMode']=='0644')
    check('exact candidate '+name,sha(new.encode())==row['afterSha256'] and facts[D/'repo'/name]['mode']=='0644')
    check('strict in-memory full patch reconstruction '+name,apply(old,part)==new)
    oldmethods=methods(old);newmethods=methods(new)
    check('ordered methods and annotations preserved '+name,[(n,k) for n,k,b in oldmethods]==[(n,k) for n,k,b in newmethods])
    for (method,kind,body),(_,_,newbody) in zip(oldmethods,newmethods):
        check('original assertion chains retained '+method,subsequence(assertion_statements(body),assertion_statements(newbody)))
        timer=lambda b:collections.Counter(re.findall(r'(?:Thread\.sleep|Duration\.of\w+|TimeUnit\.\w+\.to\w+)\([^\n;]*?\)',b))
        check('original method timers retained '+method,not(timer(body)-timer(newbody)))
    writer_summary.append({'file':name,'methods':len(oldmethods),'ordinary':sum(k=='Test' for n,k,b in oldmethods),'parameterized':sum(k=='ParameterizedTest' for n,k,b in oldmethods),'beforeSha256':row['beforeSha256'],'candidateSha256':row['afterSha256']})
check('all80 source methods',sum(x['methods'] for x in writer_summary)==80)
transport=next(v for k,v in candidate_map.items() if k.endswith('GuidedServiceTransportFaultIT.java'))
modeblock=re.search(r'(?s)enum Mode\s*\{(.*?)\n\s*\}',transport)[1].split(';')[0]
modes=re.findall(r'\b[A-Z][A-Z0-9_]+\b',modeblock)
check('exact9Mode enum members',len(modes)==9 and '@EnumSource(Mode.class)' in transport)
check('unchanged expiry mode3seconds','CALLER_EXPIRY_AFTER_CONSUME' in transport and '? 3 : 600' in transport)
catalog=load(T0/'fullcheck03-case-catalog-candidate/resume2/expected-catalog.json')
expected=[x for x in catalog['expectedCaseIdentities'] if x['class'] in proposal['nativeTestClasses'] and x['task']=='test']
check('complete99 expected exact case multiset',len(expected)==99 and collections.Counter((x['task'],x['class'],x['name'],x['expectedStatus']) for x in expected)==collections.Counter((x['task'],x['class'],x['name'],x['expectedStatus']) for x in proposal['expectedCases']))
casecounts=collections.Counter(x['class'].split('.')[-1] for x in expected)
check('88edited plus11sentinel invocations',casecounts=={'GuidedSessionIT':44,'GuidedServiceTransportFaultIT':39,'GuidedLifecycleReasonIT':5,'GuidedEvidencePendingAppendIT':8,'GuidedCommittedRefreshStateTest':3})
command=proposal['proposedNativeCommandUnderImmutableLock'];classes=[command[i+1] for i,x in enumerate(command) if x=='--tests']
check('whole five-class command and fresh exec requirement',classes==proposal['nativeTestClasses'] and command[command.index('--test-tasks')+1]=='test' and command[command.index('--require-exec-tasks')+1]=='test' and command[-2:]==['--rerun-tasks','--no-daemon'] and '--allowed-skips-file' not in command)

baseline=load(T0/'early/fullcheck-harness/resume3/plan.json')
for row in baseline['source']['files']:check('literal source currently held '+row['path'],sha(read(ROOT/row['path']))==row['sha256'])
main=[x for x in baseline['source']['files'] if x['path'].startswith('backend/src/main/')]
check('complete506 main source/resources membership',len(main)==506 and {str(p.relative_to(ROOT)) for p in (ROOT/'backend/src/main').rglob('*') if p.is_file() or p.is_symlink()}=={x['path'] for x in main})
for row in baseline['source']['dist']['files']:check('dist retained '+row['path'],sha(read(ROOT/'studio-runner/dist'/row['path']))==row['sha256'])
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in baseline[group].items():check('held '+group+' '+path,sha(read(ROOT/path))==digest)
snapshot_adoption=T0/'resume2-order11-first-snapshot-closed-root-adoption.json'
check('actual narrow capture accepted and closed',sha(read(snapshot_adoption))==proposal['captureClosedRootAdoptionSha256'] and load(snapshot_adoption)['sourceOrNativeLaneCredit'] is False and load(snapshot_adoption)['optionalReadOrRetryAuthorized'] is False)
check('independent completed capture review retained',sha(read(T0/'qa/order11-snapshot-runtime-review/review.md'))=='7e3359f55cdc1cedc0dc35bdd36fbc30a348961e707d857a562f1328d0e36116')
closed=load(T0/'early/order11-snapshot-manifest-capture/released-projection-01/snapshot-facts.json')
check('only bounded closed capture facts used',closed['cause']==closed['chronology']==closed['firstWriter']=='UNPROVEN' and closed['snapshot']['errorCode']=='OTHER' and closed['snapshot']['externalUuidJoinProved'] is False)
collector=load(ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-results.json')
archive_files=0
for group in ['xmlFiles','testHtmlFiles','jacocoExecFiles','guidedCohortFiles','guardTallies']:
    for x in collector[group]:check('durable original PUBLIC archive '+group+str(archive_files),sha(read(ROOT/x['path']))==x['sha256']);archive_files+=1
check('all1279 original task public archive files retained',archive_files==1279)
check('original public assessment closed',sha(read(T0/'qa/fullcheck03-terminal-public/assessment.md'))=='cf837ad88eb9b5aa3a224155f6a9f99fcd6d91bc979d7eaa35e9923448d7daae')
replay=read(ROOT/'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java').decode()
check('raw private TEMP is source-created outside backend build','TEMP = Files.createTempDirectory("obs007-joined-");' in replay)
for p,fact in list(facts.items()):check('stable review source/public '+p.name,sha(read(p))==fact['sha256'])
result={'decision':'SUPPORT_EXPLICIT_LIMITED_ORDERING_QUALIFICATION_PENDING_ROOT_SIGNATURE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'proposalSha256':sha(read(proposal_path)),'architectureAuditSha256':proposal['architectureAuditSha256'],'checksPassed':len(checks),'checks':checks,'exactPrimaryQuoteCount':44,'writerSummary':writer_summary,'modeValues':modes,'expectedCaseCounts':dict(casecounts),'durablePublicTaskArchiveFilesVerified':archive_files,'mainFilesAndResourcesVerified':len(main),'sourceWriteReleased':False,'generalW1Released':False,'ReplayOrMainChangeAllowed':False,'C8BeforeAnyCreditUnchanged':True,'GS_TExitBatonACOrLaneCredit':False,'causeOrRemediationClaim':False,'rawPrivateIOOrLocatorDerivation':0,'nativeCompilerFormatterExecuted':False,'limitedRootRulingStillRequired':True,'budgetCeilingUsd':500,'actualSpend':'UNAVAILABLE','sourcePublicInputFacts':[{'path':str(p.relative_to(ROOT)),'fact':f} for p,f in facts.items()]}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['decision','checksPassed','expectedCaseCounts','durablePublicTaskArchiveFilesVerified','mainFilesAndResourcesVerified']}))
