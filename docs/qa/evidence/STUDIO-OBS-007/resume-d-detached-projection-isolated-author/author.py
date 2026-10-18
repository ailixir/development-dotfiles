from pathlib import Path
import json,difflib,hashlib
root=Path(__file__).parent;base='backend/src/main/java/com/citi/put/checks/studio/guided/translation/'
changes={}
def apply(rel,ops):
 a=(root/'candidate'/rel).read_text()
 for old,new in ops:
  assert a.count(old)==1,(rel,a.count(old),old[:80]);a=a.replace(old,new,1)
 (root/'candidate'/rel).write_text(a);changes[rel]=[{'before':x,'after':y} for x,y in ops]
asm=base+'GuidedPromptAssembler.java';a=(root/'before'/asm).read_text()
start=a.index('    ObjectNode context =',a.index('  public GuidedModelRequest assemble('));end=a.index('    return new GuidedModelRequest(',start)
ctxbody=a[start:end]
ops=[('''  private final ObjectNode provenance;
''','''  private final ObjectNode provenance;
  private final PreparationCapability preparationCapability;
'''),('''  public GuidedPromptAssembler(GuidedContracts contracts) {
    this.contracts = contracts;''','''  public GuidedPromptAssembler(GuidedContracts contracts) {
    this(contracts, false);
  }

  private GuidedPromptAssembler(GuidedContracts contracts, boolean productionFactory) {
    this.contracts = contracts;'''),('''    provenance = buildSchemaProvenance();
  }
''','''    provenance = buildSchemaProvenance();
    preparationCapability = productionFactory ? new PreparationCapability(this) : null;
  }

  static GuidedPromptAssembler createForProductionFactory(GuidedContracts contracts) {
    return new GuidedPromptAssembler(contracts, true);
  }

  PreparationCapability preparationCapability() {
    return preparationCapability;
  }

  static final class PreparationCapability {
    private final GuidedPromptAssembler owner;

    private PreparationCapability(GuidedPromptAssembler owner) {
      this.owner = owner;
    }

    boolean ownedBy(GuidedPromptAssembler candidate) {
      return owner == candidate;
    }
  }
'''),(ctxbody,'''    ObjectNode context =
        buildPositiveContext(kind, session, progress, state, safeInputs, remaining, selectedSources,
            repairCodes);
''')]
helper='''  ObjectNode buildPositiveContext(
      GuidedModelRequest.Kind kind,
      JsonNode session,
      JsonNode progress,
      JsonNode state,
      JsonNode safeInputs,
      JsonNode remaining,
      JsonNode selectedSources,
      List<String> repairCodes) {
'''+ctxbody+'''    return context;
  }

  static final class PreparedProjection {
    private final PreparationCapability capability;
    private final ObjectNode context;
    private final String contextJson;
    private final String key;
    private final int attempt;
    private final GuidedModelRequest.Kind kind;
    private final int outputCap;
    private final GuidedModelRequest request;
    private final int wireBytes;
    private final String failureCode;
    private final int failureStatus;

    private PreparedProjection(PreparationCapability capability, ObjectNode context, String key, int attempt,
        GuidedModelRequest.Kind kind, int outputCap, GuidedModelRequest request, int wireBytes,
        String failureCode, int failureStatus) {
      this.capability = capability;
      this.context = context;
      this.contextJson = context.toString();
      this.key = key;
      this.attempt = attempt;
      this.kind = kind;
      this.outputCap = outputCap;
      this.request = request;
      this.wireBytes = wireBytes;
      this.failureCode = failureCode;
      this.failureStatus = failureStatus;
    }

    private boolean matches(ObjectNode fresh, String actualKey, int actualAttempt,
        GuidedModelRequest.Kind actualKind, int actualOutputCap) {
      return java.util.Objects.equals(key, actualKey) && attempt == actualAttempt
          && kind == actualKind && outputCap == actualOutputCap
          && context.equals(fresh) && contextJson.equals(fresh.toString());
    }

    Integer bytesFor(GuidedModelRequest completed) {
      return request != null && completed == request ? wireBytes : null;
    }
  }

  PreparedProjection preparePure(PreparationCapability capability, ObjectNode context,
      String key, int attempt, GuidedModelRequest.Kind kind, int outputCap) {
    if (capability == null || capability != preparationCapability || !capability.ownedBy(this)) {
      return null;
    }
    try {
      ObjectNode owned = context.deepCopy();
      try {
        // Metadata comes from this immutable epoch, never the provenance observation getter.
        GuidedModelRequest request =
            new GuidedModelRequest(key, attempt, kind, new GuidedModelProjection(owned), output,
                providerSchemas.get(kind), outputCap);
        ObjectNode payload =
            contracts.object().put("kind", request.kind().name())
                .put("requestId", request.requestId()).put("attempt", request.attempt());
        payload.set("context", request.projection().document());
        ObjectNode wire =
            contracts.object().put("contents", payload.toString())
                .put("systemInstruction", request.outputContract());
        wire.set("responseJsonSchema", request.responseSchema());
        int bytes = wire.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
        return new PreparedProjection(capability, owned, key, attempt, kind, outputCap, request, bytes, null, 0);
      } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException failure) {
        String fixed = failure.getMessage();
        if (!(fixed.equals("INVALID_CONTRACT") && failure.status() == 422
            || fixed.equals("RUNTIME_INCOMPATIBLE") && failure.status() == 409)) {
          return null;
        }
        return new PreparedProjection(capability, owned, key, attempt, kind, outputCap, null, 0,
            fixed.equals("INVALID_CONTRACT") ? "INVALID_CONTRACT" : "RUNTIME_INCOMPATIBLE",
            failure.status());
      }
    } catch (RuntimeException unavailable) {
      return null; // No raw failure retained; actual guarded original computation decides.
    }
    // Error deliberately propagates. It never becomes an optimization or product success.
  }

  GuidedModelRequest completePreparedOrOriginal(PreparationCapability capability,
      PreparedProjection prepared, String key, int attempt, GuidedModelRequest.Kind kind,
      JsonNode session, JsonNode progress, JsonNode state, JsonNode safeInputs, JsonNode remaining,
      JsonNode selectedSources, List<String> repairs, int outputCap) {
    if (capability == null || capability != preparationCapability || !capability.ownedBy(this)
        || prepared == null || prepared.capability != capability) {
      return assemble(key, attempt, kind, session, progress, state, safeInputs, remaining,
          selectedSources, repairs, outputCap);
    }
    ObjectNode fresh = buildPositiveContext(kind, session, progress, state, safeInputs, remaining,
        selectedSources, repairs);
    if (!prepared.matches(fresh, key, attempt, kind, outputCap)) {
      return assemble(key, attempt, kind, session, progress, state, safeInputs, remaining,
          selectedSources, repairs, outputCap);
    }
    // Replayed only at the original planning validation point, after all fresh input refusals.
    if (prepared.failureCode != null) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          prepared.failureCode, prepared.failureStatus);
    }
    JsonNode actualSchema = providerSchema(kind); // Original fresh request-metadata observation.
    if (!output.equals(prepared.request.outputContract())
        || !actualSchema.equals(prepared.request.responseSchema())
        || !actualSchema.toString().equals(prepared.request.responseSchema().toString())) {
      return assemble(key, attempt, kind, session, progress, state, safeInputs, remaining,
          selectedSources, repairs, outputCap);
    }
    return prepared.request;
  }

'''
ops.append(('  /** Inline pinned local references, then project only provider-supported JSON-schema keywords. */\n',helper+'  /** Inline pinned local references, then project only provider-supported JSON-schema keywords. */\n'))
apply(asm,ops)
svc=base+'GuidedTranslationService.java';s=(root/'before'/svc).read_text();sig=s[s.index('  public GuidedTranslationService('):s.index('    this.sessions = sessions;',s.index('  public GuidedTranslationService('))]
params=sig.replace('  public GuidedTranslationService(', '  private GuidedTranslationService(').replace('      Clock clock) {','      Clock clock, GuidedPromptAssembler.PreparationCapability capability) {')
forward='''    this(sessions, repository, store, questions, dispatch, gateway, contracts, prompts, inputs,
        validator, dependencies, properties, clock, null);
  }

'''
factory='''  static GuidedTranslationService fromPureAssemblerFactory(
      GuidedSessionService sessions, GuidedSessionRepository repository, GuidedTranslationStore store,
      GuidedClarificationContextStore questions, GuidedDispatchService dispatch,
      GuidedLlmGatewayClient gateway, GuidedContracts contracts, GuidedPromptAssembler prompts,
      GuidedSourceInputResolver inputs, GuidedProposalValidator validator,
      GuidedDependencyPlanner dependencies, GuidedTranslationProperties properties, Clock clock) {
    return new GuidedTranslationService(sessions, repository, store, questions, dispatch, gateway,
        contracts, prompts, inputs, validator, dependencies, properties, clock,
        prompts.preparationCapability());
  }

'''
ops=[('''  private final Clock clock;
''','''  private final Clock clock;
  private final GuidedPromptAssembler.PreparationCapability preparationCapability;
'''),(sig,sig+forward+params),('''    this.clock = clock;
  }

  public JsonNode plan(''','''    this.clock = clock;
    preparationCapability = capability != null && capability.ownedBy(prompts) ? capability : null;
  }

'''+factory+'''  public JsonNode plan(''')]
ops.append(('''      String translator = UUID.randomUUID().toString();
      Reserved reserved;''','''      String translator = UUID.randomUUID().toString();
      GuidedPromptAssembler.PreparedProjection prepared = null;
      if (preparationCapability != null) {
        try {
          ObjectNode captured =
              sessions.translationTransaction(controller, id, fence,
                  current -> capturePromptInputsLocked(current, kind).positiveContext(kind, repairs));
          prepared = prompts.preparePure(preparationCapability, captured, key, attemptNumber, kind,
              properties.maxOutputTokens());
        } catch (RuntimeException unavailable) {
          // Preparation is not authority: original actual reservation supplies current refusal.
        }
      }
      final GuidedPromptAssembler.PreparedProjection candidate = prepared;
      Reserved reserved;'''))
ops.append(('''                  JsonNode abandoned = store.state(id).path("activeAttempt");
                  String effectiveKey = key;''','''                  JsonNode abandoned = store.state(id).path("activeAttempt");
                  String effectiveKey = key;
                  boolean nestedSettlement = false;'''))
ops.append(('''                    effectiveKey = key + "-recovery-" + UUID.randomUUID();
                  }
                  GuidedModelRequest request =
                      request(current, effectiveKey, attemptNumber, kind, repairs);''','''                    effectiveKey = key + "-recovery-" + UUID.randomUUID();
                    nestedSettlement = true;
                  }
                  // Nested settlement updates a different detached wrapper; never borrow it.
                  var freshInputOwner = nestedSettlement && preparationCapability != null ? repository.lock(id) : current;
                  GuidedModelRequest request =
                      request(freshInputOwner, effectiveKey, attemptNumber, kind, repairs, candidate);'''))
start=s.index('                  ObjectNode payload =',s.index('  private JsonNode call('));end=s.index('                  if (bytes > properties.maxInputBytes())',start)
wire=s[start:end]
# Keep original fallback wire sizing exactly, apart from extracting its final assignment.
proj='                  ObjectNode projectionDocument = request.projection().document();\n'
assert wire.count(proj)==1
fallback=wire.replace(proj,'                  projectionDocument = request.projection().document();\n').replace('                  int bytes = wireBound.toString()', '                  bytes = wireBound.toString()')
wrapped='''                  ObjectNode projectionDocument;
                  Integer preparedBytes = candidate == null ? null : candidate.bytesFor(request);
                  int bytes;
                  if (preparedBytes != null) {
                    projectionDocument = request.projection().document();
                    bytes = preparedBytes;
                  } else {
'''+''.join('  '+l if l.strip() else l for l in fallback.splitlines(True))+'''                  }
'''
ops.append((wire,wrapped))
ops.append(('''                          current, bytes, request.maxOutputTokens())) {''',
            '''                          freshInputOwner, bytes, request.maxOutputTokens())) {'''))
ops.append(('''                  Instant hard = Instant.parse(current.document().path("expiresAt").asText());''',
            '''                  Instant hard = Instant.parse(freshInputOwner.document().path("expiresAt").asText());'''))
ops.append(('''                      store.reserveAttempt(
                          current.document(),''',
            '''                      store.reserveAttempt(
                          freshInputOwner.document(),'''))

# Preserve original legacy request call sites; same capture logic, same public assemble.
start=s.index('  private GuidedModelRequest request(');end=s.index('  private ObjectNode materialized(',start);oldrequest=s[start:end]
collectstart=oldrequest.index('    String id =');collectend=oldrequest.index('    return prompts.assemble(')
collect=oldrequest[collectstart:collectend]
newrequest='''  private GuidedModelRequest request(GuidedSessionRepository.Session current, String key,
      int attempt, GuidedModelRequest.Kind kind, List<String> repairs) {
    return request(current, key, attempt, kind, repairs, null);
  }

  private GuidedModelRequest request(GuidedSessionRepository.Session current, String key,
      int attempt, GuidedModelRequest.Kind kind, List<String> repairs,
      GuidedPromptAssembler.PreparedProjection prepared) {
    return capturePromptInputsLocked(current, kind).complete(key, attempt, kind, repairs, prepared);
  }

  private final class PromptInputs {
    private final JsonNode session, progress, state, safeInputs, remaining, selections;

    private PromptInputs(JsonNode session, JsonNode progress, JsonNode state, JsonNode safeInputs,
        JsonNode remaining, JsonNode selections) {
      this.session = session;
      this.progress = progress;
      this.state = state;
      this.safeInputs = safeInputs;
      this.remaining = remaining;
      this.selections = selections;
    }

    private ObjectNode positiveContext(GuidedModelRequest.Kind kind, List<String> repairs) {
      return prompts.buildPositiveContext(kind, session, progress, state, safeInputs,
          remaining, selections, repairs).deepCopy();
    }

    private GuidedModelRequest complete(String key, int attempt, GuidedModelRequest.Kind kind,
        List<String> repairs, GuidedPromptAssembler.PreparedProjection prepared) {
      return prompts.completePreparedOrOriginal(preparationCapability, prepared, key, attempt, kind,
          session, progress, state, safeInputs, remaining, selections, repairs,
          properties.maxOutputTokens());
    }
  }

  private PromptInputs capturePromptInputsLocked(GuidedSessionRepository.Session current,
      GuidedModelRequest.Kind kind) {
'''+collect
# Remove SOURCE_PLAN override from capture because kind is supplied at context completion.
sourceOverride='''    if (kind == GuidedModelRequest.Kind.SOURCE_PLAN
        && state.path("plan").path("obligations").isArray()) {
      remaining.removeAll();
      state.path("plan").path("obligations").forEach(remaining::add);
    }
'''
assert newrequest.count(sourceOverride)==1
newrequest+='''    return new PromptInputs(current.document(), progress, state, safeInputs, remaining,
        sourceSelections(current));
  }

'''
ops.append((oldrequest,newrequest));apply(svc,ops)
cfg=base+'GuidedTranslationConfiguration.java';apply(cfg,[('''    return new GuidedPromptAssembler(contracts);''','''    return GuidedPromptAssembler.createForProductionFactory(contracts);'''),('''        new GuidedTranslationService(
''','''        GuidedTranslationService.fromPureAssemblerFactory(
''')])
# Documentation already sealed before all Java edits.
doc='docs/specs/studio-observed-authoring/translation-design.md';ins=json.loads((root/'doc-insertion.json').read_text());changes[doc]=[{'before':ins['anchor'],'after':ins['addition']+ins['anchor']}]
for rel,ops in changes.items():
 a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text();rev=b
 for op in reversed(ops):assert rev.count(op['after'])==1;rev=rev.replace(op['after'],op['before'],1)
 assert rev==a,rel
 out=root/'patches'/Path(rel+'.patch');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='before/'+rel,tofile='candidate/'+rel)))
(root/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n');print(json.dumps({p:hashlib.sha256((root/'candidate'/p).read_bytes()).hexdigest() for p in changes},indent=2))
