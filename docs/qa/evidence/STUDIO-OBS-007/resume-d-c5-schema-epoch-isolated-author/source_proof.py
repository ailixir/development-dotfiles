from pathlib import Path
import json,hashlib
root=Path(__file__).parent
base='backend/src/main/java/com/citi/put/checks/studio/guided/translation/'
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def tokens(s):
 out=[];i=0
 while i<len(s):
  if s[i].isspace():i+=1;continue
  if s.startswith('//',i):
   k=s.find('\n',i);i=len(s) if k<0 else k+1;continue
  if s.startswith('/*',i):
   k=s.find('*/',i+2);assert k>=0;i=k+2;continue
  start=i
  if s.startswith('"""',i):
   i+=3
   while i<len(s):
    if s[i]=='\\':i+=2;continue
    if s.startswith('"""',i):i+=3;break
    i+=1
   out.append(('literal',s[start:i],start,i));continue
  if s[i] in ['"',"'"]:
   q=s[i];i+=1
   while i<len(s):
    if s[i]=='\\':i+=2;continue
    if s[i]==q:i+=1;break
    i+=1
   out.append(('literal',s[start:i],start,i));continue
  if s[i].isalnum() or s[i] in '_$':
   i+=1
   while i<len(s) and (s[i].isalnum() or s[i] in '_$'):i+=1
  else:i+=1
  out.append(('token',s[start:i],start,i))
 return out
def body(s,marker):
 assert s.count(marker)==1,marker
 start=s.index(marker);ts=[t for t in tokens(s) if t[2]>=start];i=next(i for i,t in enumerate(ts) if t[0]=='token' and t[1]=='{');first=ts[i][2];depth=1;j=i+1
 while depth:
  if ts[j][0]=='token':
   if ts[j][1]=='{':depth+=1
   if ts[j][1]=='}':depth-=1
  j+=1
 return s[first:ts[j-1][3]]
def token_values(s):return [(a,b) for a,b,_,_ in tokens(s)]
changes=json.loads((root/'inverse-transformations.json').read_text());entries=[]
for rel,transforms in changes.items():
 a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text();inverse=b
 for x in reversed(transforms):
  assert inverse.count(x['after'])==1
  inverse=inverse.replace(x['after'],x['before'],1)
 assert inverse==a
 assert Path(rel).read_text()==a
 entries.append({'path':rel,'beforeSha256':sha(a),'candidateSha256':sha(b),'wholeInverseExact':True,'liveUnchanged':True})
a=(root/'before'/base/'GuidedPromptAssembler.java').read_text();b=(root/'candidate'/base/'GuidedPromptAssembler.java').read_text()
algorithms={}
for marker in ['  private void countSchemas(', '  private JsonNode compactSchema(', '  private static String resource(', '  public GuidedModelRequest assemble(', '  public static String maskSecretTokens(']:
 x=body(a,marker);y=body(b,marker);assert x==y;algorithms[marker.strip()]={'rawBodyExact':True,'sha256':sha(x)}
oldprovider=body(a,'  public JsonNode providerSchema(');newprovider=body(b,'  private JsonNode buildProviderSchema(')
assert oldprovider==newprovider.replace('providerNode(candidate, inputs)','providerNode(candidate)')
oldnode=body(a,'  private JsonNode providerNode(');newnode=body(b,'  private JsonNode providerNode(')
for x in changes[base+'GuidedPromptAssembler.java']:
 if x['after'] in newnode:newnode=newnode.replace(x['after'],x['before'],1)
# Signature is outside the body; recursive replacements and construction-only resolver reverse.
assert token_values(oldnode)==token_values(newnode)
oldpins=body(a,'  public ObjectNode schemaProvenance(');newpins=body(b,'  private ObjectNode buildSchemaProvenance(')
for x in changes[base+'GuidedPromptAssembler.java']:
 if x['after'] in newpins:newpins=newpins.replace(x['after'],x['before'],1)
assert token_values(oldpins)==token_values(newpins)
oldgetterNode=body(b,'  public JsonNode providerSchema(');oldgetterPins=body(b,'  public ObjectNode schemaProvenance(')
assert token_values(oldgetterNode)==token_values('{ return providerSchemas.get(kind).deepCopy(); }')
assert token_values(oldgetterPins)==token_values('{ return provenance.deepCopy(); }')
test='backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java'
a=(root/'before'/test).read_text();b=(root/'candidate'/test).read_text()
def tests(s):
 ts=tokens(s);names=[]
 for i,t in enumerate(ts):
  if t[1]=='@' and ts[i+1][1]=='Test':
   j=i+2
   while ts[j][1]!='void':j+=1
   names.append(ts[j+1][1])
 return {n:body(s,'  void '+n+'(') for n in names}
oldtests=tests(a);newtests=tests(b)
assert all(newtests[k]==v for k,v in oldtests.items())
added=[k for k in newtests if k not in oldtests];assert added==['startupSchemaEpochReturnsDefensiveCopiesWithoutRebuildingMetadata','failedStaticSchemaConstructionPublishesNoEpoch']
proof={'sourceProofOnly':True,'files':entries,'unchangedRawAlgorithms':algorithms,'providerExpansionRawInverseExact':True,'providerNodeAlgorithmTokenInverseExact':True,'provenanceKeysOrderingHashCompositionTokenInverseExact':True,'publicGettersExactlyFreshDeepCopy':True,'oldTestCount':len(oldtests),'oldTestBodiesAndAssertionsExact':True,'oldTestBodyHashes':{k:sha(v) for k,v in oldtests.items()},'addedTests':added,'candidateTestCount':len(newtests),'compileExecuted':False,'runtimeExecuted':False,'canonicalOutputRuntimeParity':'UNRUN; unchanged algorithm source/dataflow and existing defining baseline checks planned'}
(root/'source-preservation-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k not in ['files','oldTestBodyHashes','unchangedRawAlgorithms']},indent=2))
