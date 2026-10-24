"""Bounded source-only Quinn equivalence review; no Java/native/runtime operations."""
import ast, collections, difflib, hashlib, json, pathlib, re, stat, types
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-checkstyle-remediation-prep/resume1')
O=pathlib.Path(__file__).parent
checks=[];pins=[];negative=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
def pin(p,want=None):
 p=pathlib.Path(p);b=p.read_bytes();h=sha(b)
 if want is not None:assert h==want,str(p)
 pins.append({'path':str(p),'sha256':h,'bytes':len(b),'mode':stat.S_IMODE(p.stat().st_mode)})
 return b
m=json.loads(pin(D/'manifest.json','b6a935f9235b8b80cbaf5ddff4502631290668fe12334dccd1caba1dd612473e'))
for row in m['members']:
 b=pin(D/row['path'],row['sha256']);check('member bytes/mode '+row['path'],len(b)==row['bytes'] and stat.S_IMODE((D/row['path']).stat().st_mode)==int(row['mode'],0))
inputs=json.loads((D/'input-pins.json').read_text())
for row in inputs['inputs']:check('bound input '+row['role'],len(pin(row['path'],row['sha256']))==row['bytes'])
records=json.loads((D/'source-records.json').read_text());projection=pathlib.Path(inputs['inputs'][1]['path']);facts=json.loads(projection.read_text())['facts']
check('closed facts exactly43+7',collections.Counter(x['rule'] for x in facts)=={'NeedBraces':43,'Indentation':7})
allowed={str((D/x['path']).absolute()) for x in m['members']}|{str(pathlib.Path(r['source']).absolute()) for r in records}|{str(projection.absolute())}
reads=[]
class SafePath(type(pathlib.Path())):
 def read_bytes(self):
  assert str(self.absolute()) in allowed,('UNAPPROVED_SOURCE_READ',str(self));reads.append(str(self));return pathlib.Path(self).read_bytes()
 def read_text(self,*a,**kw):return self.read_bytes().decode(kw.get('encoding') or 'utf-8')
 def write_text(self,*a,**kw):raise AssertionError('AUTHOR_WRITE_FORBIDDEN')
 def write_bytes(self,*a,**kw):raise AssertionError('AUTHOR_WRITE_FORBIDDEN')
 def open(self,*a,**kw):raise AssertionError('AUTHOR_OPEN_FORBIDDEN')
# Only inspected pure definitions/constants; author generation main is absent.
t=ast.parse((D/'source_tools.py').read_text());names={'PINS','OLD_SWITCH','NEW_SWITCH','LEX'}
nodes=[n for n in t.body if isinstance(n,ast.FunctionDef) and n.name!='main' or isinstance(n,ast.Assign) and all(isinstance(x,ast.Name) and x.id in names for x in n.targets)]
ns={'difflib':difflib,'hashlib':hashlib,'json':json,'re':re,'Path':SafePath}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<inspected pure source definitions>','exec'),ns)
s=types.SimpleNamespace(**ns,OUT=SafePath(D),PROJECTION=SafePath(projection),BASE=SafePath(records[0]['source']).parent)
# Read-only author verifier, with its finite read paths guarded and no imports/main.
t=ast.parse((D/'verify_source.py').read_text());nodes=[n for n in t.body if not isinstance(n,(ast.Import,ast.ImportFrom)) and not isinstance(n,ast.Assign) or isinstance(n,ast.Assign) and not any(isinstance(x,ast.Name) and x.id=='out' for x in n.targets)]
v={'s':s,'ast':ast,'json':json,'re':re,'Path':SafePath,'out':SafePath(D),'print':lambda *a,**kw:None}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<guarded read-only source verifier>','exec'),v)
check('corrected author verifier all50',len(v['locations'])==50 and v['result']['methods']==80 and v['result']['assertionEntryPoints']==813)
(O/'author-verifier-result.json').write_text(json.dumps(v['result'],indent=2)+'\n')
mapping=json.loads((D/'source-location-map.json').read_text());stats=[]
for record in records:
 name=pathlib.Path(record['source']).name;oldb=pin(record['source'],record['sourceSha256']);old=(D/'preimages'/name).read_text();new=(D/'postimages'/name).read_text();rows=[f for f in facts if pathlib.Path(f['file']).name==name]
 check('accepted preimage exact/mode '+name,oldb==old.encode() and stat.S_IMODE(pathlib.Path(record['source']).stat().st_mode)==int(record['sourceMode'],8))
 check('postimage bound '+name,sha(new.encode())==record['postimageSha256'])
 for direction,a,b,an,bn in [('forward',old,new,'a/'+record['source'],'b/'+record['source']),('reverse',new,old,'b/'+record['source'],'a/'+record['source'])]:
  exact=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile=an,tofile=bn,n=3))
  check('strict '+name+' '+direction,exact==(D/record['patches'][direction]).read_text() and s.apply_unified(a,exact)==b)
 bodyrows=mapping['files'][name];check('exact diagnostic row map '+name,collections.Counter(r['oldLine'] for r in bodyrows)==collections.Counter(f['line'] for f in rows if f['rule']=='NeedBraces'))
 toks=s.lex(old)
 for entry in bodyrows:
  body=entry['oldBodyTokens'];start=entry['oldBodyStart'];end=entry['oldBodyEnd'];actual=[x[0] for x in toks if start<=x[1]<end]
  check('exact old body '+name+':'+str(entry['oldLine']),actual==body and old[start:end]==entry['oldBodyText'])
  check('single statement/scope '+name+':'+str(entry['oldLine']),body[-1]==';' and body.count(';')==1 and not set(body)&{'{','}','if','else','for','while','do','switch','try','synchronized','break','continue','var',':'} and (body[0] in {'return','throw','matches','planner','service','secret','obligation','chosen','callback'}))
  check('diagnostic keyword '+name+':'+str(entry['oldLine']),old.count('\n',0,entry['insertedOpeningAfter'])+1>=entry['oldLine'])
 # Independent whole token/literal/comment projection, allowing only inserted braces and the one mapped switch.
 a=old.replace(s.OLD_SWITCH,'SWITCH_ANCHOR;');b=new.replace(s.NEW_SWITCH,'SWITCH_ANCHOR;')
 at=s.lex(a,True);bt=s.lex(b,True)
 check('all nonbrace tokens '+name,[x[0] for x in at if x[0] not in {'{','}'}]==[x[0] for x in bt if x[0] not in {'{','}'}])
 check('all literals/comments '+name,[x[0] for x in s.lex(old,True) if x[3] in {'literal','comment'}]==[x[0] for x in s.lex(new,True) if x[3] in {'literal','comment'}])
 check('exact added brace count '+name,new.count('{')-old.count('{')==new.count('}')-old.count('}')==len(bodyrows))
 stats.append({'file':name,'methods':len(re.findall(r'@(?:Test|ParameterizedTest)\b',new)),'assertions':len(re.findall(r'\bassertThat(?:ThrownBy)?\s*\(',new)),'bracedBodies':len(bodyrows)})
 # Actual pair boundary rejects condition/oracle/operation/scope/else-binding mutations; no Java behavior is simulated.
 mutants=[('condition',new.replace('if (','if (!',1)),('literal',new.replace('"GS-T source"','"changed"',1)),('dropped-body',new.replace(bodyrows[0]['oldBodyText'],';',1)),('extra-operation',new.replace('class '+name[:-5]+' {','class '+name[:-5]+' { int unwanted;',1)),('extra-scope',new+'\n{}\n'),('else-binding',new.replace('} else','} ; else',1))]
 if s.NEW_SWITCH in new:
  mutants.extend([('switch-arm',new.replace('case "claim" -> fixedRoute = "CLAIM"','case "claim" -> fixedRoute = "OTHER"')),('switch-default',new.replace('default -> fixedRoute = "OTHER"','default -> fixedRoute = "CLAIM"')),('switch-null',new.replace('switch (route) {','switch (route) { case null -> fixedRoute = "OTHER";',1)),('switch-selector',new.replace('switch (route) {','switch (route.toString()) {',1))])
 for label,mutant in mutants:
  assert mutant!=new,(name,label)
  try:s.check_pair(old,mutant,rows)
  except AssertionError:negative.append({'file':name,'mutation':label,'rejected':True})
  else:raise AssertionError(('MUTANT_ACCEPTED',name,label))
 bad=(D/record['patches']['forward']).read_text().replace('\n ','\n !',1)
 try:s.apply_unified(old,bad)
 except AssertionError:negative.append({'file':name,'mutation':'patch-context','rejected':True})
 else:raise AssertionError('BAD_PATCH_ACCEPTED')
check('80 methods/813 assertions/43 wrappers',sum(x['methods'] for x in stats)==80 and sum(x['assertions'] for x in stats)==813 and sum(x['bracedBodies'] for x in stats)==43)
transport=(D/'postimages/GuidedServiceTransportFaultIT.java').read_text();switchpos=transport.index(s.NEW_SWITCH)
check('switch inside same original method',transport.rfind('private static void observeGstCallback',0,switchpos)>transport.rfind('private static void ',0,switchpos)-1)
check('closed switch rows exact',sorted(f['line'] for f in facts if f['rule']=='Indentation')==list(range(5283,5290)))
check('fourcases/default/selector once',s.OLD_SWITCH.count('switch (route)')==s.NEW_SWITCH.count('switch (route)')==1 and re.findall(r'case "([^"]+)" -> "([^"]+)";',s.OLD_SWITCH)==re.findall(r'case "([^"]+)" -> fixedRoute = "([^"]+)";',s.NEW_SWITCH) and s.NEW_SWITCH.count('fixedRoute =')==5 and 'case null' not in s.OLD_SWITCH+s.NEW_SWITCH)
check('three-file88 not inferred99',v['result']['threeFileExpandedCaseCount']==88 and v['result']['otherUnchangedClassCases']==11 and v['result']['nativeRerun'] is False)
# Retained verifier ambiguity is source-only and candidates remain unchanged.
oldv=(D/'verify_source-attempt1.py').read_text();newv=(D/'verify_source.py').read_text()
check('initial ambiguity and focused correction retained','assert len(matches)==1' in oldv and 'selected=[ordinal' in newv and json.loads((D/'verification-attempts.json').read_text())['attempt1']['candidateChange'] is False)
result={'sourceChecks':checks,'stats':stats,'adversarialCases':negative,'correctedAuthorVerifier50':True,'allowedSourceReads':sorted(set(reads)),'nativeOrJavaFormatterCompilerOsRuntimePrivateActions':0,'actualLogReportBaselinePrivateReadStatHash':False,'lexicalNotJavaCompilation':True}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n');(O/'pins.json').write_text(json.dumps({'pins':pins,'pinCount':len(pins)},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'negativeCases':len(negative),'stats':stats,'authorMappedRows':len(v['locations']),'actualActions':0},indent=2))
