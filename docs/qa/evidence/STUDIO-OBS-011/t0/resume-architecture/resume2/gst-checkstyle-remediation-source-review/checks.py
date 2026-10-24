"""Aria bounded GST style source review; never invokes a generator or native tool."""
import ast,collections,contextlib,difflib,hashlib,io,json,pathlib,re,stat,sys,types
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-checkstyle-remediation-prep/resume1'
Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gst-checkstyle-remediation-source-review'
O=pathlib.Path(__file__).parent
sha=lambda raw:hashlib.sha256(raw).hexdigest()
pins=[];checks=[]
def pin(path,expected=None):
    path=pathlib.Path(path).absolute();raw=path.read_bytes();h=sha(raw)
    if expected:assert h==expected,(str(path),h)
    pins.append({'path':str(path.relative_to(R)),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)})
    return raw
def check(name,ok):assert ok,name;checks.append({'case':name,'passed':True})
m=json.loads(pin(D/'manifest.json','b6a935f9235b8b80cbaf5ddff4502631290668fe12334dccd1caba1dd612473e'))
check('exact25members',len(m['members'])==25)
for row in m['members']:
    raw=pin(D/row['path'],row['sha256']);check('member:'+row['path'],len(raw)==row['bytes'] and pins[-1]['mode']==int(row['mode'],0))
qm=json.loads(pin(Q/'manifest.json','d89f41c7c1a75b16c01cc50ee4b51c9b878c07254eda30e3e6b3e1df62978136'))
for row in qm['files']:
    raw=pin(Q/row['path'],row['sha256']);check('qa-preserved:'+row['path'],len(raw)==row['bytes'] and pins[-1]['mode']==row['mode'])
for row in json.loads((D/'input-pins.json').read_bytes())['inputs']:pin(R/row['path'],row['sha256'])
root=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
pin(root/'resume2-gst-style-source-equivalence-root-adoption.json','745ab66339c21cbb15e64732f1697c95ac922cdbdc1fde141c98d0fb806d2964')
records=json.loads((D/'source-records.json').read_bytes())
allowed={str((D/r['path']).absolute()) for r in m['members']}|{str((R/r['source']).absolute()) for r in records}|{str((R/r['path']).absolute()) for r in json.loads((D/'input-pins.json').read_bytes())['inputs']}|{str((Q/r['path']).absolute()) for r in qm['files']}|{str((D/'manifest.json').absolute())}
guarded=True;unexpected=[]
def audit(event,args):
    if not guarded:return
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill')) or event in ('fcntl.flock','os.remove','os.rename','os.rmdir','os.mkdir','os.symlink','os.link'):
        unexpected.append(event);raise AssertionError('OPERATIONAL_BOUNDARY_DENIED:'+event)
    if event=='open':
        name,mode,flags=args
        assert isinstance(name,(str,bytes)),'UNAPPROVED_FD_OPEN'
        assert str(pathlib.Path(name).absolute()) in allowed,('UNAPPROVED_BODY',name)
        assert mode is not None and all(x not in mode for x in 'wax+'),('WRITE_DENIED',name,mode)
sys.addaudithook(audit)
# The inspected independent QA script extracts only pure source definitions and
# injects a finite read-only Path. Drop only its output writes, retaining tests.
tree=ast.parse((Q/'check_review.py').read_text())
def is_output(n):
    return isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ((isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='write_text') or (isinstance(n.value.func,ast.Name) and n.value.func.id=='print'))
tree.body=[n for n in tree.body if not is_output(n)]
q={'__file__':str(Q/'check_review.py'),'__name__':'aria_inspected_guarded_replay'}
with contextlib.redirect_stdout(io.StringIO()):exec(compile(tree,'<inspected-quinn-source-checks-no-writes>','exec'),q)
check('189 independent QA checks replayed',len(q['checks'])==189 and all(r['passed'] for r in q['checks']))
check('25 independent QA mutations rejected',len(q['negative'])==25 and all(r['rejected'] for r in q['negative']))
s=q['s'];mapping=json.loads((D/'source-location-map.json').read_bytes());byfile=[]
for record in records:
    name=pathlib.Path(record['source']).name
    old=(D/'preimages'/name).read_text();new=(D/'postimages'/name).read_text()
    rows=mapping['files'][name]
    # New block scope cannot affect a local declaration or labelled/jump/nested
    # statement: every actual added block encloses one exact existing statement.
    for row in rows:
        body=row['oldBodyTokens']
        check('architecture-single-statement:'+name+':'+str(row['oldLine']),body.count(';')==1 and body[-1]==';' and body[0] in {'return','throw','matches','planner','service','secret','obligation','chosen','callback'})
    # Whole-file declaration/annotation/call-site tokens remain exact after the
    # one explicitly mapped switch and braces; no method/test can be inserted.
    a=old.replace(s.OLD_SWITCH,'SWITCH_EQUIVALENCE_ANCHOR;');b=new.replace(s.NEW_SWITCH,'SWITCH_EQUIVALENCE_ANCHOR;')
    check('architecture-whole-token-stream:'+name,[v[0] for v in s.lex(a,True) if v[0] not in {'{','}'}]==[v[0] for v in s.lex(b,True) if v[0] not in {'{','}'}])
    check('architecture-annotated-methods:'+name,re.findall(r'@(?:Test|ParameterizedTest)\b[\s\S]*?\bvoid\s+(\w+)\s*\(',old)==re.findall(r'@(?:Test|ParameterizedTest)\b[\s\S]*?\bvoid\s+(\w+)\s*\(',new))
    byfile.append({'file':name,'bracedBodies':len(rows),'annotatedMethods':len(re.findall(r'@(?:Test|ParameterizedTest)\b',new)),'assertionEntryPoints':len(re.findall(r'\bassertThat(?:ThrownBy)?\s*\(',new))})
check('exact-43-braces-distribution',{r['file']:r['bracedBodies'] for r in byfile}=={'GuidedSessionIT.java':19,'GuidedLifecycleReasonIT.java':10,'GuidedServiceTransportFaultIT.java':14})
check('80-methods813-assertion-entrypoints',sum(r['annotatedMethods'] for r in byfile)==80 and sum(r['assertionEntryPoints'] for r in byfile)==813)
transport=(D/'postimages/GuidedServiceTransportFaultIT.java').read_text();original=(D/'preimages/GuidedServiceTransportFaultIT.java').read_text()
lo=original.index('  private static void observeGstCallback(');hi=original.index('\n  private static ',lo+1)
ln=transport.index('  private static void observeGstCallback(');hn=transport.index('\n  private static ',ln+1)
oldmethod=original[lo:hi];newmethod=transport[ln:hn]
check('one-switch-same-method',oldmethod.count(s.OLD_SWITCH)==1 and newmethod.count(s.NEW_SWITCH)==1)
check('unchanged-parse-diagnostic-catch',oldmethod.replace(s.OLD_SWITCH,'SWITCH;').replace('if (status == 202) return;','if (status == 202) {\n      return;\n    }')==newmethod.replace(s.NEW_SWITCH,'SWITCH;'))
check('exact-fourcase-default',re.findall(r'case "([^"]+)" -> fixedRoute = "([^"]+)";',s.NEW_SWITCH)==[('claim','CLAIM'),('observations','OBSERVATIONS'),('bootstrap-evidence','BOOTSTRAP_EVIDENCE'),('outcomes','OUTCOMES')] and 'default -> fixedRoute = "OTHER";' in s.NEW_SWITCH)
check('one-selector-no-nullcase-no-calls',s.NEW_SWITCH.count('switch (route)')==s.OLD_SWITCH.count('switch (route)')==1 and 'case null' not in s.NEW_SWITCH+s.OLD_SWITCH and not re.search(r'fixedRoute\s*=\s*\w+\(',s.NEW_SWITCH))
check('zero-unexpected-boundaries',not unexpected)
guarded=False
out={'subjectManifestSha256':sha((D/'manifest.json').read_bytes()),'sourceChecks':checks,'sourceCheckCount':len(checks),'replayedQaChecks':len(q['checks']),'replayedQaMutants':len(q['negative']),'replayedQaResults':q['result'],'files':byfile,'mappedLocations':len(q['v']['locations']),'retainedAuthorMutants':len(json.loads((D/'pure-source-checks.json').read_bytes())['negativeChecks']),'actualNativeJavaFormatterCompilerRuntimeLockBaselinePrivateActions':0,'unfakedOperationalCalls':unexpected,'sourceEquivalenceOnly':True}
(O/'checks.json').write_text(json.dumps(out,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'pins':pins,'count':len(pins),'bodyScope':'exact source packets, closed typed projection, approved three public preimages and named root records only'},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'replayedQaChecks':len(q['checks']),'replayedQaMutants':len(q['negative']),'mappedLocations':50,'actualOperationalActions':0}))
