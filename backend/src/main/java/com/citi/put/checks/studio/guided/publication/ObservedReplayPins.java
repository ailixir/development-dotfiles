package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;

/** Trusted deployment catalog. Artifact claims and model/default pins cannot add support. */
public final class ObservedReplayPins {
  private final GuidedContracts contracts;
  private final ObservedReplayProperties properties;

  public ObservedReplayPins(GuidedContracts contracts, ObservedReplayProperties properties) {
    this.contracts = contracts;
    this.properties = properties;
  }

  private JsonNode configured(String json) {
    require(
        json != null && json.getBytes(StandardCharsets.UTF_8).length <= 65536,
        "RUNTIME_INCOMPATIBLE",
        409);
    JsonNode value = contracts.parseWire(json.getBytes(StandardCharsets.UTF_8));
    require(value.isArray() && value.size() <= 16, "RUNTIME_INCOMPATIBLE", 409);
    return value;
  }

  public ObjectNode selected() {
    JsonNode catalog = configured(properties.catalogJson());
    require(!catalog.isEmpty(), "RUNTIME_INCOMPATIBLE", 409);
    return checked(catalog.get(0));
  }

  public ObjectNode supported(JsonNode profile, JsonNode build) {
    for (JsonNode candidate : configured(properties.catalogJson())) {
      ObjectNode entry = checked(candidate);
      if (entry.path("profile").equals(profile)
          && (build == null || entry.path("build").equals(build))) {
        return entry;
      }
    }
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
        "RUNTIME_INCOMPATIBLE", 409);
  }

  private ObjectNode checked(JsonNode entry) {
    require(
        entry.isObject() && entry.size() == 2 && entry.has("profile") && entry.has("build"),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("v2/replay-profile", entry.path("profile"));
    contracts.validate("v2/replay-profile#/definitions/BuildIdentity", entry.path("build"));
    require(
        GuidedContracts.hash(entry.path("profile"))
            .equals(text(entry.path("build"), "profileHash")),
        "RUNTIME_INCOMPATIBLE",
        409);
    return PublicationContracts.copy(entry);
  }

  public ObjectNode policy(JsonNode scope) {
    String environment =
        scope.has("environment") ? text(scope, "environment") : text(scope, "environmentId");
    JsonNode found = null;
    for (JsonNode item : configured(properties.policiesJson())) {
      if (item.path("applicationId").equals(scope.path("applicationId"))
          && item.path("accountRef").equals(scope.path("accountRef"))
          && item.path("environment").asText().equals(environment)) {
        require(found == null, "RUNTIME_INCOMPATIBLE", 409);
        found = item;
      }
    }
    require(found != null, "AUTH_CONNECTION_REQUIRED", 409);
    contracts.validate("v2/replay-ipc#/definitions/TrustedPolicy", found);
    for (String key : List.of("policyId", "policyVersion", "entryPolicyId")) {
      if (scope.has(key)) {
        require(scope.path(key).equals(found.path(key)), "FORBIDDEN_SCOPE", 403);
      }
    }
    JsonNode application = found.path("applicationPolicy");
    if (!application.isNull()) {
      require(
          application.path("allowStructuralDiscovery").asBoolean()
              && application.path("readGrants").size() <= 32,
          "RUNTIME_INCOMPATIBLE",
          409);
      var ids = new HashSet<String>();
      for (JsonNode grant : application.path("readGrants")) {
        require(ids.add(text(grant, "policyRuleId")), "RUNTIME_INCOMPATIBLE", 409);
      }
    }
    var testIds = new HashSet<String>();
    for (JsonNode rule : found.path("rules")) {
      require(
          testIds.add(text(rule, "testId"))
              && (rule.has("accessibleName")
                  ? rule.path("accessibleName").equals(rule.path("name"))
                  : rule.path("classification").asText().equals("permittedBusinessData")),
          "RUNTIME_INCOMPATIBLE",
          409);
    }
    JsonNode origins =
        scope.has("allowedOrigins") ? scope.path("allowedOrigins") : scope.path("approvedOrigins");
    for (JsonNode origin : origins) {
      require(
          GuidedPlanBuilder.list(found.path("allowedOrigins")).contains(origin),
          "FORBIDDEN_SCOPE",
          403);
    }
    ObjectNode normalized = PublicationContracts.copy(found);
    java.util.Comparator<JsonNode> policyOrder =
        java.util.Comparator.comparing(
                (JsonNode n) -> text(n, "policyRuleId"), ObservedReplayPins::scalarCompare)
            .thenComparing(GuidedContracts::canonical, ObservedReplayPins::scalarCompare);
    var rules = GuidedPlanBuilder.list(normalized.path("rules"));
    rules.sort(policyOrder);
    var normalizedRules = normalized.putArray("rules");
    rules.forEach(normalizedRules::add);
    if (!normalized.path("applicationPolicy").isNull()) {
      ObjectNode app = (ObjectNode) normalized.path("applicationPolicy");
      var grants = GuidedPlanBuilder.list(app.path("readGrants"));
      var types = List.of("text", "search", "email", "tel", "url", "textarea");
      for (JsonNode grant : grants) {
        if (grant.has("controlValue")) {
          var controls = GuidedPlanBuilder.list(grant.path("controlValue").path("types"));
          controls.sort(java.util.Comparator.comparingInt(t -> types.indexOf(t.asText())));
          var sorted = ((ObjectNode) grant.path("controlValue")).putArray("types");
          controls.forEach(sorted::add);
        }
      }
      grants.sort(policyOrder);
      var sorted = app.putArray("readGrants");
      grants.forEach(sorted::add);
    }
    return normalized;
  }

  private static int scalarCompare(String a, String b) {
    var left = a.codePoints().iterator();
    var right = b.codePoints().iterator();
    while (left.hasNext() && right.hasNext()) {
      int c = Integer.compare(left.nextInt(), right.nextInt());
      if (c != 0) {
        return c;
      }
    }
    return Boolean.compare(left.hasNext(), right.hasNext());
  }

  public ObjectNode requirements(JsonNode session) {
    JsonNode scope = session.path("scope"), policy = policy(scope);
    ObjectNode result = contracts.object();
    for (String key : List.of("csiId", "applicationId", "accountRef")) {
      result.set(key, scope.path(key));
    }
    result.set("environment", scope.path("environmentId"));
    result.set("allowedOrigins", scope.path("approvedOrigins").deepCopy());
    var capabilities = result.putArray("capabilities");
    for (JsonNode capability : scope.path("capabilities")) {
      if (!capability.asText().equals("observe")) {
        capabilities.add(capability);
      }
    }
    for (String key : List.of("policyId", "policyVersion", "entryPolicyId")) {
      result.set(key, policy.path(key));
    }
    result.putObject("initialContext").put("kind", "initialBlank");
    contracts.validate("v2/replay-profile#/definitions/ReplayRequirements", result);
    return result;
  }
}
