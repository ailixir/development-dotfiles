package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * ADR-SC-007 WI-1 measurement: SOURCE_PLAN against the real model with the production prompt
 * assembly, the production gateway transport and client, and the production admission path (via
 * {@link GroundingBenchScorer}). A measurement tool, not product behaviour; skipped unless {@code
 * WI1_MEASURE_OUT} and {@code WI1_MEASURE_SETS} are set.
 *
 * <p>Environment: {@code WI1_MEASURE_OUT} (output directory), {@code WI1_MEASURE_LABEL} (e.g.
 * {@code before}), {@code WI1_MEASURE_SETS} (comma list of {@code alpha, radio, radioInfo,
 * selectControls, checkControls, heldoutChains, probe}), {@code WI1_MEASURE_REPS} (overrides every
 * set's reps), {@code WI1_MEASURE_ONLY} (comma list of task ids), {@code WI1_MEASURE_CONCURRENCY}
 * (default 4), {@code WI1_WRITE_FROZEN} (write the code hashes to this file) and {@code WI1_FROZEN}
 * (refuse to run unless the code hashes equal this file). Gateway settings come from {@code
 * application.yml}'s {@code studio.gateway} defaults; project, location and endpoint come from the
 * deployment, here {@code STUDIO_GATEWAY_*} with the dev defaults below. Credentials are the
 * application-default mode: the SDK reads them in process, nothing here prints or stores a token.
 */
class GuidedSourcePlanMeasurementTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Path TEST_ROOT = Path.of("src/test");
  private static final String SOURCE =
      "java/com/citi/put/checks/studio/guided/translation/GuidedSourcePlanMeasurementTest.java";
  private static final String SCORER =
      "java/com/citi/put/checks/studio/guided/translation/GroundingBenchScorer.java";
  private static final String SETS = "resources/studio/guided/wi1/measurement-sets.json";
  private static final String LINKAGE = "resources/studio/guided/wi1/expected-linkage.json";
  private static final int SOURCE_PLAN_MAX_OUTPUT_TOKENS = 4096; // GuidedTranslationProperties
  private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{[A-Z0-9_]+:([^}]*)}");

  private record Unit(String set, JsonNode task, int rep) {}

  @Test
  void measure() throws Exception {
    String out = System.getenv("WI1_MEASURE_OUT");
    String setNames = System.getenv("WI1_MEASURE_SETS");
    assumeTrue(
        out != null && !out.isBlank() && setNames != null && !setNames.isBlank(),
        "WI1_MEASURE_OUT and WI1_MEASURE_SETS are not both set");
    Path dir = Path.of(out);
    Files.createDirectories(dir);
    ObjectNode hashes = codeHashes();
    String frozen = System.getenv("WI1_FROZEN");
    if (frozen != null && !frozen.isBlank()) {
      JsonNode expected = MAPPER.readTree(Files.readString(Path.of(frozen)));
      if (!expected.equals(hashes)) {
        throw new AssertionError(
            "Measurement code differs from the frozen hashes: frozen "
                + expected
                + " now "
                + hashes);
      }
    }
    String write = System.getenv("WI1_WRITE_FROZEN");
    if (write != null && !write.isBlank()) {
      Files.writeString(
          Path.of(write), MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(hashes));
    }
    String label = System.getenv().getOrDefault("WI1_MEASURE_LABEL", "run");
    JsonNode sets = MAPPER.readTree(Files.readString(TEST_ROOT.resolve(SETS))).path("sets");
    JsonNode linkage = MAPPER.readTree(Files.readString(TEST_ROOT.resolve(LINKAGE)));
    Integer repsOverride =
        System.getenv("WI1_MEASURE_REPS") == null
            ? null
            : Integer.valueOf(System.getenv("WI1_MEASURE_REPS"));
    List<String> only =
        System.getenv("WI1_MEASURE_ONLY") == null
            ? List.of()
            : List.of(System.getenv("WI1_MEASURE_ONLY").split(","));
    List<Unit> units = new ArrayList<>();
    for (String set : setNames.split(",")) {
      if (set.equals("probe")) {
        units.add(new Unit("probe", sets.path("alpha").get(2), 1));
        continue;
      }
      JsonNode tasks = sets.path(set);
      if (!tasks.isArray()) {
        throw new AssertionError("Unknown set " + set);
      }
      for (JsonNode task : tasks) {
        if (!only.isEmpty() && !only.contains(task.path("id").asText())) {
          continue;
        }
        int reps = repsOverride != null ? repsOverride : task.path("reps").asInt(1);
        for (int rep = 1; rep <= reps; rep++) {
          units.add(new Unit(set, task, rep));
        }
      }
    }

    Map<String, Object> config = gatewayConfig();
    StudioGatewayProperties properties = (StudioGatewayProperties) config.get("properties");
    GuidedContracts contracts = new GuidedContracts();
    GuidedPromptAssembler assembler =
        new GuidedPromptAssembler(contracts, new AllowedDomains(List.of(), true));
    GuidedSourceClassifier classifier =
        new GuidedSourceClassifier(
            contracts, new CredentialPatternScreen(), new AllowedDomains(List.of(), true));
    GroundingBenchScorer scorer = new GroundingBenchScorer();
    int concurrency =
        Integer.parseInt(System.getenv().getOrDefault("WI1_MEASURE_CONCURRENCY", "4"));
    Path file = dir.resolve(label + "-" + setNames.replace(',', '+') + ".jsonl");
    List<ObjectNode> records = new ArrayList<>();
    try (GenAiGatewayTransport transport = new GenAiGatewayTransport(properties)) {
      GenAiGuidedLlmGatewayClient client =
          new GenAiGuidedLlmGatewayClient(transport, new GuidedResponseParser(contracts));
      ExecutorService pool = Executors.newFixedThreadPool(concurrency);
      List<Future<ObjectNode>> futures = new ArrayList<>();
      for (Unit unit : units) {
        futures.add(
            pool.submit(
                () -> run(unit, label, assembler, classifier, client, scorer, linkage, contracts)));
      }
      for (Future<ObjectNode> future : futures) {
        records.add(future.get());
      }
      pool.shutdown();
    }
    ObjectNode summary = MAPPER.createObjectNode();
    summary.put("label", label);
    summary.put("sets", setNames);
    summary.put("finishedAt", Instant.now().toString());
    summary.set("codeHashes", hashes);
    summary.set("gateway", MAPPER.valueToTree(config.get("recorded")));
    summary.put("calls", records.size());
    try (var writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
      writer.write(MAPPER.writeValueAsString(summary));
      writer.newLine();
      for (ObjectNode record : records) {
        writer.write(MAPPER.writeValueAsString(record));
        writer.newLine();
      }
    }
  }

  private ObjectNode run(
      Unit unit,
      String label,
      GuidedPromptAssembler assembler,
      GuidedSourceClassifier classifier,
      GenAiGuidedLlmGatewayClient client,
      GroundingBenchScorer scorer,
      JsonNode linkage,
      GuidedContracts contracts)
      throws Exception {
    JsonNode task = unit.task();
    ObjectNode record = MAPPER.createObjectNode();
    record.put("label", label);
    record.put("set", unit.set());
    record.put("task", task.path("id").asText());
    record.put("heldOut", task.path("heldOut").asBoolean(false));
    record.put("rep", unit.rep());
    List<String> stepIds = new ArrayList<>();
    ObjectNode current = MAPPER.createObjectNode();
    current
        .put("testId", "wi1-" + task.path("id").asText())
        .put("csiId", "CSI-wi1")
        .put("sourceRevision", "1")
        .put("configurationRevision", "1")
        .put("environment", "fixture");
    ObjectNode authoring = current.putObject("authoring").put("authoringSchemaVersion", 2);
    ArrayNode steps = authoring.putArray("steps");
    for (JsonNode text : task.path("steps")) {
      String id = UUID.randomUUID().toString();
      stepIds.add(id);
      steps.addObject().put("id", id).put("text", text.asText());
    }
    current.putArray("variables");
    ObjectNode scope =
        MAPPER
            .createObjectNode()
            .put("environmentId", "fixture")
            .put("csiId", "CSI-wi1")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    ObjectNode manifest = classifier.classify(current, scope);
    ObjectNode session =
        MAPPER
            .createObjectNode()
            .put("sessionId", UUID.randomUUID().toString())
            .put("scopeHash", sha256(scope.toString()));
    session.set("scope", scope);
    session.set("sourceSteps", manifest.path("sourceSteps"));
    ObjectNode state = MAPPER.createObjectNode();
    state.set("manifest", manifest);
    ObjectNode progress =
        MAPPER
            .createObjectNode()
            .put("stepIndex", 0)
            .put("translationOrdinal", 0)
            .put("contextRevision", 0);
    GuidedModelRequest request =
        assembler.assemble(
            "wi1-" + UUID.randomUUID(),
            1,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            session,
            progress,
            state,
            MAPPER.createArrayNode(),
            MAPPER.createArrayNode(),
            MAPPER.createArrayNode(),
            List.of(),
            SOURCE_PLAN_MAX_OUTPUT_TOKENS);
    record.put("requestId", request.requestId());
    record.put("outputContractSha256", sha256(request.outputContract()));
    record.put("providerSchemaSha256", sha256(request.responseSchema().toString()));
    record.put("projectionSha256", sha256(request.projection().document().toString()));

    GuidedModelResponse response = null;
    int attempts = 0;
    List<String> transients = new ArrayList<>();
    long[] backoff = {5000, 10000, 20000};
    while (true) {
      attempts++;
      long started = System.nanoTime();
      response = client.propose(request, GuidedGatewayPrivacyTest.budget(Duration.ofSeconds(150)));
      record.put("ms", Duration.ofNanos(System.nanoTime() - started).toMillis());
      if (response.code() != GuidedModelResponse.Code.OK
          && response.reason() != null
          && response.reason().definiteTransient()
          && attempts <= backoff.length) {
        transients.add(response.reason().name());
        Thread.sleep(backoff[attempts - 1]);
        continue;
      }
      break;
    }
    record.put("at", Instant.now().toString());
    record.put("attempts", attempts);
    ArrayNode transientNode = record.putArray("transientRetries");
    transients.forEach(transientNode::add);
    record.put("responseCode", response.code().name());
    if (response.reason() != null) {
      record.put("reason", response.reason().name());
    }
    record.put("providerModel", response.providerModel());
    if (response.inputTokens() != null) {
      record.put("inputTokens", response.inputTokens());
    }
    if (response.outputTokens() != null) {
      record.put("outputTokens", response.outputTokens());
    }
    boolean transientExhausted =
        response.code() != GuidedModelResponse.Code.OK
            && response.reason() != null
            && response.reason().definiteTransient();
    if (transientExhausted) {
      record.put("outcome", "INFRA_EXCLUDED");
      return record;
    }
    if (response.code() != GuidedModelResponse.Code.OK) {
      record.put("outcome", "NO_PLAN");
      return record;
    }
    JsonNode reply = response.proposal();
    record.set("reply", reply);
    ObjectNode line = MAPPER.createObjectNode();
    line.put("key", record.path("task").asText() + "|" + unit.rep());
    line.put("kind", "SOURCE_PLAN");
    line.set("context", request.projection().document());
    line.set("reply", reply);
    ObjectNode verdict = scorer.score(line);
    record.set("verdict", verdict);
    boolean admitted = verdict.path("verdict").asText().equals("ADMITTED");
    boolean modelUnsupported = verdict.path("detail").asText().equals("MODEL_UNSUPPORTED");
    record.put(
        "outcome",
        admitted ? "ADMITTED" : modelUnsupported ? "REFUSED_MODEL_UNSUPPORTED" : "REFUSED_APPLY");
    record.put("code", verdict.path("code").asText());
    if (reply.has("obligations")) {
      record.set("shape", shape(reply, stepIds));
      if (set(unit, "alpha")) {
        record.set(
            "linkage",
            linkage(reply, stepIds, linkage.path("checklists").path(task.path("id").asText())));
      }
      if (task.has("targetStep")) {
        int target = task.path("targetStep").asInt();
        ArrayNode kinds = record.putArray("targetKinds");
        for (JsonNode obligation : reply.path("obligations")) {
          if (obligation.path("stepId").asText().equals(stepIds.get(target))) {
            kinds.add(obligation.path("operationKind").asText());
          }
        }
        boolean has = false;
        for (JsonNode kind : kinds) {
          has |= kind.asText().equals(task.path("expectKind").asText());
        }
        record.put("targetHasExpectedKind", has);
        boolean other = false;
        for (JsonNode kind : kinds) {
          other |= !kind.asText().equals(task.path("expectKind").asText());
        }
        record.put("targetHasOtherKind", other);
      }
    }
    return record;
  }

  private static boolean set(Unit unit, String name) {
    return unit.set().equals(name);
  }

  /** Structure only: kinds per step, needId presence, needs counts and producer/consumer steps. */
  private static ObjectNode shape(JsonNode reply, List<String> stepIds) {
    ObjectNode shape = MAPPER.createObjectNode();
    ArrayNode obligations = shape.putArray("obligations");
    for (JsonNode o : reply.path("obligations")) {
      ObjectNode item = obligations.addObject();
      item.put("step", stepIds.indexOf(o.path("stepId").asText()) + 1);
      item.put("kind", o.path("operationKind").asText());
      item.put("predicate", o.path("predicate").asText("none"));
      item.put("referenceIndex", o.path("referenceIndex").isNull() ? "null" : "set");
      item.put("needId", o.path("needId").isNull() ? "null" : o.path("needId").asText());
    }
    if (reply.has("needs")) {
      ArrayNode needs = shape.putArray("needs");
      for (JsonNode n : reply.path("needs")) {
        ObjectNode item = needs.addObject();
        item.put("needId", n.path("needId").asText());
        item.put("producerStep", stepIds.indexOf(n.path("producerStepId").asText()) + 1);
        ArrayNode consumers = item.putArray("consumers");
        for (JsonNode c : n.path("consumers")) {
          consumers.add(
              (stepIds.indexOf(c.path("stepId").asText()) + 1)
                  + ":"
                  + c.path("argumentSlot").asText());
        }
      }
    }
    return shape;
  }

  /** Kind sequence and read-to-consumer edges of the reply against the expected checklist. */
  private static ObjectNode linkage(JsonNode reply, List<String> stepIds, JsonNode expected) {
    ObjectNode result = MAPPER.createObjectNode();
    List<String> kinds = new ArrayList<>();
    for (JsonNode o : reply.path("obligations")) {
      kinds.add(
          (stepIds.indexOf(o.path("stepId").asText()) + 1)
              + ":"
              + o.path("operationKind").asText());
    }
    List<String> expectedKinds = new ArrayList<>();
    for (JsonNode k : expected.path("kinds")) {
      expectedKinds.add(k.get(0).asInt() + ":" + k.get(1).asText());
    }
    TreeSet<String> edges = new TreeSet<>();
    if (reply.has("needs")) {
      // Before the change the model wrote needs: the edge is what its needs say.
      for (JsonNode n : reply.path("needs")) {
        int producer = stepIds.indexOf(n.path("producerStepId").asText()) + 1;
        for (JsonNode c : n.path("consumers")) {
          edges.add(
              producer
                  + ">"
                  + (stepIds.indexOf(c.path("stepId").asText()) + 1)
                  + ":"
                  + c.path("argumentSlot").asText());
        }
      }
    } else {
      Map<String, Integer> producers = new TreeMap<>();
      for (JsonNode o : reply.path("obligations")) {
        if (o.path("operationKind").asText().equals("read") && !o.path("needId").isNull()) {
          producers.put(o.path("needId").asText(), stepIds.indexOf(o.path("stepId").asText()) + 1);
        }
      }
      for (JsonNode o : reply.path("obligations")) {
        String kind = o.path("operationKind").asText();
        if (!kind.equals("read") && !o.path("needId").isNull()) {
          Integer producer = producers.get(o.path("needId").asText());
          String slot = kind.equals("assert") ? "assert.expected" : kind + ".value";
          edges.add(
              (producer == null ? "?" : producer)
                  + ">"
                  + (stepIds.indexOf(o.path("stepId").asText()) + 1)
                  + ":"
                  + slot);
        }
      }
    }
    TreeSet<String> expectedEdges = new TreeSet<>();
    expected.path("edges").forEach(e -> expectedEdges.add(e.asText()));
    result.put("kindsMatch", kinds.equals(expectedKinds));
    result.put("edgesMatch", edges.equals(expectedEdges));
    ArrayNode actual = result.putArray("edges");
    edges.forEach(actual::add);
    ArrayNode actualKinds = result.putArray("kinds");
    kinds.forEach(actualKinds::add);
    return result;
  }

  private static ObjectNode codeHashes() throws IOException {
    ObjectNode hashes = MAPPER.createObjectNode();
    for (String name : List.of(SOURCE, SCORER, SETS, LINKAGE)) {
      hashes.put(name, sha256(Files.readAllBytes(TEST_ROOT.resolve(name))));
    }
    return hashes;
  }

  /** studio.gateway defaults from application.yml; the resolved values are recorded. */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> gatewayConfig() throws IOException {
    Map<String, Object> root;
    try (var in = Files.newInputStream(Path.of("src/main/resources/application.yml"))) {
      root = new Yaml().load(in);
    }
    Map<String, Object> gateway =
        (Map<String, Object>) ((Map<String, Object>) root.get("studio")).get("gateway");
    Map<String, String> resolved = new TreeMap<>();
    gateway.forEach(
        (key, value) -> {
          if (value instanceof String text) {
            Matcher matcher = PLACEHOLDER.matcher(text);
            resolved.put(key, matcher.matches() ? matcher.group(1) : text);
          }
        });
    String endpoint =
        System.getenv()
            .getOrDefault("STUDIO_GATEWAY_ENDPOINT", "https://aiplatform.googleapis.com");
    String project = System.getenv().getOrDefault("STUDIO_GATEWAY_PROJECT", "epicagentai");
    String location = System.getenv().getOrDefault("STUDIO_GATEWAY_LOCATION", "global");
    StudioGatewayProperties properties =
        new StudioGatewayProperties(
            endpoint,
            project,
            location,
            resolved.get("model"),
            new StudioGatewayProperties.Credentials("application-default", null),
            Duration.ofSeconds(Long.parseLong(resolved.get("request-timeout").replace("s", ""))),
            Integer.parseInt(resolved.get("max-concurrency")),
            Integer.parseInt(resolved.get("max-input-bytes")),
            Integer.parseInt(resolved.get("max-output-bytes")),
            Integer.parseInt(resolved.get("max-output-tokens")),
            StudioGatewayProperties.ThinkingLevel.valueOf(resolved.get("thinking-level")),
            StudioGatewayProperties.ProviderFeatures.ALL);
    Map<String, Object> recorded = new TreeMap<>();
    recorded.put("endpoint", endpoint);
    recorded.put("project", project);
    recorded.put("location", location);
    recorded.put("model", properties.model());
    recorded.put("thinkingLevel", properties.thinkingLevel().name());
    recorded.put("gatewayMaxOutputTokens", properties.maxOutputTokens());
    recorded.put("sourcePlanRequestMaxOutputTokens", SOURCE_PLAN_MAX_OUTPUT_TOKENS);
    recorded.put("requestTimeoutSeconds", properties.requestTimeout().toSeconds());
    recorded.put("maxInputBytes", properties.maxInputBytes());
    recorded.put("maxOutputBytes", properties.maxOutputBytes());
    recorded.put("credentialsMode", "application-default");
    recorded.put("applicationYmlDefaults", resolved);
    return Map.of("properties", properties, "recorded", recorded);
  }

  private static String sha256(String text) throws Exception {
    return sha256(text.getBytes(StandardCharsets.UTF_8));
  }

  private static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (java.security.NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
