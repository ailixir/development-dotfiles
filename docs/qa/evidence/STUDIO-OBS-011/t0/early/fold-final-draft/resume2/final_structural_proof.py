from pathlib import Path
import json,re,ast,hashlib
ROOT=Path.cwd();OUT=Path(__file__).parent;PRE=OUT/'virtual-pre-final';FINAL=OUT/'final-candidates';base='backend/src/main/java/com/citi/put/checks/studio/'
ns={'re':re}
for file,names in [('author.py',['matching']),('audit_and_package.py',['apply_patch'])]:
 tree=ast.parse((OUT/file).read_text())
 for node in tree.body:
  if isinstance(node,ast.FunctionDef) and node.name in names:exec(compile(ast.Module(body=[node],type_ignores=[]),'<pure static function>','exec'),ns)
matching=ns['matching'];h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=(ROOT/(base+'dispatch/HttpRunnerDispatchClient.java')).read_text();new=(FINAL/(base+'dispatch/HttpRunnerDispatchClient.java')).read_text()
constructors=[]
for m in re.finditer(r'public HttpRunnerDispatchClient\(',old):
 a=old.index('(',m.start());b=matching(old,a);brace=old.index('{',b);end=matching(old,brace,'{','}')+1;original=old[m.start():end]
 constructors.append({'signature':old[m.start():b+1],'bodyAndSignatureByteIdentical':original in new})
a=old.index('  public DispatchOutcome send(RunJob job)');b=old.index('\n  /**\n   * {@code DELETE',a)
checks={'bothOriginalDispatchConstructorsByteIdentical':len(constructors)==2 and all(x['bodyAndSignatureByteIdentical'] for x in constructors),'dispatchRunSendBodyByteIdentical':old[a:b] in new,'oneAutowiredProductionCtor':'@Autowired\n  public HttpRunnerDispatchClient(\n      ObjectMapper' in new,'observerStillPackagePrivate':'  void observeRequestBytes(' in new and 'public void observeRequestBytes(' not in new,'testSetupNoExtraHTTPResources':'this.httpClient = guidedClient;' in new and 'this.httpClient = client;' in new,'sourceAll1808BoundUnchanged':json.loads((OUT/'full-virtual-tree-map.json').read_text())['literalSourceAllHashesVerified']}
sql=[]
plan=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text())
for rel in plan['resolvedAliases']['FOLD_PREP_MAIN']+[base+'guided/publication/GuidedPublicationResultProjector.java']:
 if not rel.endswith('.java'):continue
 a=(PRE/rel).read_text();b=(FINAL/rel).read_text()
 get=lambda s:[x for x in re.findall(r'"(?:\\.|[^"\\])*"',s) if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|FOR UPDATE|set_config|clock_timestamp)\b',x)]
 x,y=get(a),get(b);sql.append({'path':rel,'beforeCount':len(x),'afterCount':len(y),'exactLiteralListEqual':x==y})
checks['allOwnedSQLLiteralListsIdentical']=all(r['exactLiteralListEqual'] for r in sql)
mut=[]
initial={str(p.relative_to(FINAL)):p.read_text() for p in FINAL.rglob('*') if p.is_file()}
for row in json.loads((OUT/'mutation-map.json').read_text()):
 p=OUT/'mutants'/row['id'];v=ns['apply_patch']((p/'apply.patch').read_text(),dict(initial));actual=hashlib.sha256(v[row['path']].encode()).hexdigest();restored=ns['apply_patch']((p/'restore.patch').read_text(),v)
 mut.append({'id':row['id'],'exactMutantHash':actual==row['mutantSha256'],'exactFullVirtualRestore':restored==initial})
checks['allFiveFinalMutationsReconstructAndRestore']=all(m['exactMutantHash'] and m['exactFullVirtualRestore'] for m in mut)
# TS token preservation: comment-only file has identical executable tokens, title file one bound string rename.
tstokens=[]
pattern=r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`|//[^\n]*|/\*[\s\S]*?\*/|\w+|[^\s]'
for row in json.loads((OUT/'ts-metadata-proposals.json').read_text()):
 a=(PRE/row['path']).read_text();b=(FINAL/row['path']).read_text()
 tokens=lambda x:[t for t in re.findall(pattern,x) if not t.startswith(('//','/*'))]
 x,y=tokens(a),tokens(b);diffs=[{'token':i,'before':u,'after':v} for i,(u,v) in enumerate(zip(x,y)) if u!=v]
 tstokens.append({'path':row['path'],'sameExecutableTokenCount':len(x)==len(y),'differences':diffs,'exactOnlyLiteralOldTypeRename':a.replace('GuidedRunnerClient','HttpRunnerDispatchClient')==b})
checks['proposedTSOnlyOneTitleTokenNoBodyChange']=all(t['sameExecutableTokenCount'] and t['exactOnlyLiteralOldTypeRename'] for t in tstokens) and len(tstokens[0]['differences'])==0 and len(tstokens[1]['differences'])==1
(OUT/'final-structural-proof.json').write_text(json.dumps({'kind':'STATIC_ONLY_NO_COMPILE_RUNTIME_CREDIT','checks':checks,'originalPublicConstructors':constructors,'SQLLiteralProof':sql,'mutantReconstruction':mut,'TSMetadataTokens':tstokens},indent=2)+'\n')
print(json.dumps(checks,indent=2))
