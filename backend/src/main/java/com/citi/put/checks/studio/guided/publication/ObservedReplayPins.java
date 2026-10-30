package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;

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
    contracts.validate("v3/replay-profile", entry.path("profile"));
    contracts.validate("v3/replay-profile#/definitions/BuildIdentity", entry.path("build"));
    require(
        GuidedContracts.hash(entry.path("profile"))
            .equals(text(entry.path("build"), "profileHash")),
        "RUNTIME_INCOMPATIBLE",
        409);
    return PublicationContracts.copy(entry);
  }

  /**
   * The replay requirements of a learning session, frozen from the session scope. Where replay may
   * navigate is not frozen: the runner checks the deployment's current allowed domains, and each
   * step is pinned to the origin it learned on.
   */
  public ObjectNode requirements(JsonNode session) {
    JsonNode scope = session.path("scope");
    ObjectNode result = contracts.object();
    result.set("csiId", scope.path("csiId"));
    result.set("environment", scope.path("environmentId"));
    var capabilities = result.putArray("capabilities");
    for (JsonNode capability : scope.path("capabilities")) {
      if (!capability.asText().equals("observe")) {
        capabilities.add(capability);
      }
    }
    result.putObject("initialContext").put("kind", "initialBlank");
    contracts.validate("v3/replay-profile#/definitions/ReplayRequirements", result);
    return result;
  }
}
