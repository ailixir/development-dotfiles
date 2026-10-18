from pathlib import Path
import json,hashlib
root=Path(__file__).parent;sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
# Read lexical helper definitions only; no compilation, fixture load or runtime.
src=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-schema-epoch-isolated-author/source_proof.py').read_text();ns={};exec(src[src.index('def tokens(s):'):src.index('changes=json.loads')],ns);body=ns['body'];tokens=ns['tokens']
changes=json.loads((root/'inverse-transformations.json').read_text());files=[]
for rel,ops in changes.items():
 a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text();rev=b
 for x in reversed(ops):assert rev.count(x['after'])==1;rev=rev.replace(x['after'],x['before'],1)
 assert rev==a and Path(rel).read_text()==a,rel
 files.append({'path':rel,'beforeSha256':sha(a),'candidateSha256':sha(b),'wholeInverseExact':True,'liveUnchanged':True})
base='backend/src/main/java/com/citi/put/checks/studio/guided/translation/'
a=(root/'before'/base/'GuidedPromptAssembler.java').read_text();b=(root/'candidate'/base/'GuidedPromptAssembler.java').read_text()
start=a.index('    ObjectNode context =',a.index('  public GuidedModelRequest assemble('));end=a.index('    return new GuidedModelRequest(',start);lift=a[start:end]
assert lift in body(b,'  ObjectNode buildPositiveContext(')
unchanged={}
for marker in ['  public JsonNode providerSchema(', '  public ObjectNode schemaProvenance(', '  private JsonNode buildProviderSchema(', '  private void countSchemas(', '  private JsonNode compactSchema(', '  private JsonNode providerNode(', '  private static String resource(', '  public static String maskSecretTokens(']:
 assert body(a,marker)==body(b,marker);unchanged[marker.strip()]=sha(body(a,marker))
svc=base+'GuidedTranslationService.java';a=(root/'before'/svc).read_text();b=(root/'candidate'/svc).read_text()
# Reconstruct original request input collection exactly; sourceSelections query/guard functions untouched.
first=a.index('    String id =',a.index('  private GuidedModelRequest request('));last=a.index('    return prompts.assemble(',first);collection=a[first:last]
assert collection in body(b,'  private PromptInputs capturePromptInputsLocked(')
for marker in ['  private ObjectNode materialized(', '  private JsonNode sourceSelections(', '  private ObjectNode effectiveObligation(']:assert body(a,marker)==body(b,marker)
assert a.count('prompts.schemaProvenance()')==b.count('prompts.schemaProvenance()')
actual=b[b.index('      Reserved reserved;'):b.index('      require(send != -1',b.index('      Reserved reserved;'))]
assert 'new GuidedModelProjection' not in actual
# Every old defining @Test body remains byte-exact.
rel='backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java';a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text()
def testNames(s):
 ts=tokens(s);names=[]
 for i,t in enumerate(ts):
  if t[1]=='@' and ts[i+1][1]=='Test':
   j=i+2
   while ts[j][1]!='void':j+=1
   names.append(ts[j+1][1])
 return names
old=testNames(a);new=testNames(b);assert len(old)==33
assert all(body(a,'  void '+n+'(')==body(b,'  void '+n+'(') for n in old)
proof={'files':files,'wholeInverseAllFive':True,'originalPositiveContextLiftRawExact':True,'originalRequestCollectionRawExact':True,'unchangedAssemblerMethodBodyHashes':unchanged,'freshMaterializedSelectionsEffectiveObligationMethodsExact':True,'provenanceGetterCallCountUnchanged':True,'oldDefiningMethods':len(old),'oldBodiesAndAssertionsExact':True,'addedMethods':[n for n in new if n not in old],'candidateDefiningMethods':len(new),'runtime':False,'compile':False}
(root/'source-preservation-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k not in ['files','unchangedAssemblerMethodBodyHashes']},indent=2))
