from pathlib import Path
import json,difflib,hashlib
root=Path(__file__).parent
changes={}
def author(rel, transforms):
 rel=Path(rel);a=(root/'candidate'/rel).read_text()
 for old,new in transforms:
  assert a.count(old)==1,(str(rel),a.count(old),old[:90])
  a=a.replace(old,new,1)
 (root/'candidate'/rel).write_text(a);changes[str(rel)]=[{'before':x,'after':y} for x,y in transforms]
base='backend/src/main/java/com/citi/put/checks/studio/guided/translation/'
assembler=base+'GuidedPromptAssembler.java'
old=(root/'before'/assembler).read_text()
transforms=[]
transforms.append(('''  private final JsonNode schema;
''','''  private final JsonNode schema;
  private final java.util.Map<String, JsonNode> schemaInputs;
  private final java.util.Map<GuidedModelRequest.Kind, JsonNode> providerSchemas;
  private final ObjectNode provenance;
'''))
transforms.append(('''            resource("/studio/observed-contracts/v3/guided-model-response.schema.json"));
  }
''','''            resource("/studio/observed-contracts/v3/guided-model-response.schema.json"));
    java.util.Map<String, JsonNode> inputs = new java.util.HashMap<>();
    inputs.put("guided-model-response.schema.json", schema);
    inputs.put(
        "source-selection.schema.json",
        contracts.parse(resource("/studio/observed-contracts/v3/source-selection.schema.json")));
    inputs.put(
        "planning-context.schema.json",
        contracts.parse(resource("/studio/observed-contracts/v3/planning-context.schema.json")));
    var providers =
        new java.util.EnumMap<GuidedModelRequest.Kind, JsonNode>(GuidedModelRequest.Kind.class);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      providers.put(kind, buildProviderSchema(kind, inputs));
    }
    schemaInputs = java.util.Map.copyOf(inputs);
    providerSchemas = java.util.Map.copyOf(providers);
    provenance = buildSchemaProvenance();
  }
'''))
transforms.append(('''  public JsonNode providerSchema(GuidedModelRequest.Kind kind) {
    var alternatives''','''  public JsonNode providerSchema(GuidedModelRequest.Kind kind) {
    return providerSchemas.get(kind).deepCopy();
  }

  private JsonNode buildProviderSchema(
      GuidedModelRequest.Kind kind, java.util.Map<String, JsonNode> inputs) {
    var alternatives'''))
transforms.append(('''        alternatives.add(providerNode(candidate));''','''        alternatives.add(providerNode(candidate, inputs));'''))
transforms.append(('''  public ObjectNode schemaProvenance() {
    ObjectNode pins''','''  public ObjectNode schemaProvenance() {
    return provenance.deepCopy();
  }

  private ObjectNode buildSchemaProvenance() {
    ObjectNode pins'''))
transforms.append(('''                GuidedContracts.hash(
                    contracts.parse(
                        resource("/studio/observed-contracts/v3/source-selection.schema.json"))))''','''                GuidedContracts.hash(schemaInputs.get("source-selection.schema.json")))'''))
transforms.append(('''                GuidedContracts.hash(
                    contracts.parse(
                        resource("/studio/observed-contracts/v3/planning-context.schema.json"))))''','''                GuidedContracts.hash(schemaInputs.get("planning-context.schema.json")))'''))
transforms.append(('''      provider.put(kind.name(), GuidedContracts.hash(providerSchema(kind)));''','''      provider.put(kind.name(), GuidedContracts.hash(providerSchemas.get(kind)));'''))
transforms.append(('''  private JsonNode providerNode(JsonNode node) {''','''  private JsonNode providerNode(JsonNode node, java.util.Map<String, JsonNode> inputs) {'''))
transforms.append(('''      node.forEach(child -> result.add(providerNode(child)));''','''      node.forEach(child -> result.add(providerNode(child, inputs)));'''))
transforms.append(('''      JsonNode referenced = contracts.parse(resource("/studio/observed-contracts/v3/" + local[0]));''','''      JsonNode referenced =
          inputs.computeIfAbsent(
              local[0],
              name -> contracts.parse(resource("/studio/observed-contracts/v3/" + name)));'''))
transforms.append(('''      return providerNode(referenced);''','''      return providerNode(referenced, inputs);'''))
transforms.append(('''                              properties.set(property.getKey(), providerNode(property.getValue())));''','''                              properties.set(
                                  property.getKey(), providerNode(property.getValue(), inputs)));'''))
transforms.append(('''                  result.set(key.equals("oneOf") ? "anyOf" : key, providerNode(entry.getValue()));''','''                  result.set(
                      key.equals("oneOf") ? "anyOf" : key, providerNode(entry.getValue(), inputs));'''))
author(assembler,transforms)
classifier=base+'GuidedSourceClassifier.java'
author(classifier,[
 ('''  private final CredentialPatternScreen screen;
''','''  private final CredentialPatternScreen screen;
  private final GuidedPromptAssembler prompts;
'''),
 ('''      CredentialPatternScreen screen) {
    this.contracts = contracts;''','''      CredentialPatternScreen screen) {
    this(contracts, properties, screen, new GuidedPromptAssembler(contracts));
  }

  public GuidedSourceClassifier(
      GuidedContracts contracts,
      GuidedTranslationProperties properties,
      CredentialPatternScreen screen,
      GuidedPromptAssembler prompts) {
    this.contracts = contracts;'''),
 ('''    this.screen = screen;
''','''    this.screen = screen;
    this.prompts = java.util.Objects.requireNonNull(prompts);
'''),
 ('''    result.set("schemaPins", new GuidedPromptAssembler(contracts).schemaProvenance());''','''    result.set("schemaPins", prompts.schemaProvenance());''')])
configuration=base+'GuidedTranslationConfiguration.java'
author(configuration,[
 ('''      GuidedTranslationProperties properties,
      CredentialPatternScreen screen) {
    return new GuidedSourceClassifier(contracts, properties, screen);''','''      GuidedTranslationProperties properties,
      CredentialPatternScreen screen,
      GuidedPromptAssembler prompts) {
    return new GuidedSourceClassifier(contracts, properties, screen, prompts);''')])
# Two meaningful business-lifetime tests in the already owned defining test file.
test='backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java'
addition='''  @Test
  void startupSchemaEpochReturnsDefensiveCopiesWithoutRebuildingMetadata() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var assembler = new GuidedPromptAssembler(parsing);
    ObjectNode baselinePins = assembler.schemaProvenance();
    String pinsCanonical = GuidedContracts.canonical(baselinePins);
    var canonicalSchemas = new java.util.EnumMap<GuidedModelRequest.Kind, String>(
        GuidedModelRequest.Kind.class);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      canonicalSchemas.put(kind, GuidedContracts.canonical(assembler.providerSchema(kind)));
    }
    org.mockito.Mockito.clearInvocations(parsing);

    ObjectNode returnedPins = assembler.schemaProvenance();
    returnedPins.withObject("/providerSchemaHashes").put("SOURCE_PLAN", "f".repeat(64));
    returnedPins.removeAll();
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      ObjectNode returnedSchema = (ObjectNode) assembler.providerSchema(kind);
      for (JsonNode typed : returnedSchema.findParents("type")) {
        ((ObjectNode) typed).put("type", "changed-returned-copy");
      }
      returnedSchema.removeAll();
      JsonNode freshSchema = assembler.providerSchema(kind);
      assertThat(freshSchema).isNotSameAs(returnedSchema);
      assertThat(GuidedContracts.canonical(freshSchema)).isEqualTo(canonicalSchemas.get(kind));
      assertThat(assembler.schemaProvenance().path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(freshSchema));
    }
    ObjectNode freshPins = assembler.schemaProvenance();
    assertThat(freshPins).isNotSameAs(returnedPins);
    assertThat(GuidedContracts.canonical(freshPins)).isEqualTo(pinsCanonical);
    org.mockito.Mockito.verifyNoInteractions(parsing);
  }

  @Test
  void failedStaticSchemaConstructionPublishesNoEpoch() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var parsed = new AtomicInteger();
    org.mockito.Mockito.doAnswer(
            invocation -> {
              if (parsed.incrementAndGet() == 2) {
                throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                    "INVALID_CONTRACT", 422);
              }
              return invocation.callRealMethod();
            })
        .when(parsing)
        .parse(org.mockito.ArgumentMatchers.anyString());
    var published = new java.util.concurrent.atomic.AtomicReference<GuidedPromptAssembler>();
    assertThatThrownBy(() -> published.set(new GuidedPromptAssembler(parsing)))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThat(parsed.get()).isEqualTo(2);
    assertThat(published.get()).isNull();
  }

'''
anchor='  private static void verifyLocalReferences(JsonNode node, JsonNode root) {'
author(test,[(anchor,addition+anchor)])
# Documentation was written and receipt sealed before any Java edit.
doc='docs/specs/studio-observed-authoring/translation-design.md';di=json.loads((root/'doc-insertion.json').read_text());changes[doc]=[{'before':di['anchor'],'after':di['addition']+di['anchor']}]
for rel,transforms in changes.items():
 a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text();inverse=b
 for x in reversed(transforms):
  assert inverse.count(x['after'])==1
  inverse=inverse.replace(x['after'],x['before'],1)
 assert inverse==a,rel
 patch=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='before/'+rel,tofile='candidate/'+rel))
 out=root/'patches'/Path(rel+'.patch');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(patch)
(root/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
print(json.dumps({rel:hashlib.sha256((root/'candidate'/rel).read_bytes()).hexdigest() for rel in changes},indent=2))
