package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Original-start snapshot. No resolved variable or account state is synthesized. */
public final class GuidedPublicationBaseRepository {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedPublicationBaseRepository(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  static void transaction() {
    require(
        TransactionSynchronizationManager.isActualTransactionActive(), "RUNTIME_INCOMPATIBLE", 409);
  }

  public Optional<PublicationContracts.Base> find(String sessionId) {
    return jdbc
        .query(
            "SELECT document::text FROM studio_guided_publication_bases WHERE session_id=?",
            (rs, n) -> new PublicationContracts.Base(contracts.parse(rs.getString(1))),
            sessionId)
        .stream()
        .findFirst();
  }

  public PublicationContracts.CurrentSource lockCurrent(UUID testId) {
    transaction();
    var rows =
        jdbc.query(
            "SELECT"
                + " id,csi_id,source_revision,configuration_revision,publication_epoch,"
                + "confirmed_revision_id,authoring::text,browser,viewport_width,viewport_height,"
                + "timeout_seconds,wait_strategy,environment,deleted_at,quarantined_at,variables::text"
                + " FROM ui_tests WHERE id=? FOR UPDATE",
            (rs, n) -> {
              ObjectNode d =
                  contracts
                      .object()
                      .put("testId", rs.getString(1))
                      .put("csiId", rs.getString(2))
                      .put("sourceRevision", rs.getString(3))
                      .put("configurationRevision", rs.getString(4))
                      .put("publicationEpoch", rs.getString(5));
              d.put("confirmedRevisionId", rs.getString(6));
              require(rs.getString(7) != null, "RUNTIME_INCOMPATIBLE", 409);
              d.set("authoring", contracts.parse(rs.getString(7)));
              ObjectNode c =
                  d.putObject("configuration")
                      .put(
                          "browser",
                          com.citi.put.checks.studio.dto.CanonicalStudioCodec.normalizeBrowser(
                              rs.getString(8)));
              c.putObject("viewport").put("width", rs.getInt(9)).put("height", rs.getInt(10));
              c.put("timeoutSeconds", rs.getInt(11))
                  .put("waitStrategy", rs.getString(12))
                  .put("environment", rs.getString(13));
              d.put(
                  "deletedAt",
                  rs.getTimestamp(14) == null ? null : rs.getTimestamp(14).toInstant().toString());
              d.put("quarantined", rs.getTimestamp(15) != null);
              try {
                var mapper =
                    new com.fasterxml.jackson.databind.ObjectMapper()
                        .findAndRegisterModules()
                        .disable(
                            com.fasterxml.jackson.databind.SerializationFeature
                                .WRITE_DATES_AS_TIMESTAMPS)
                        .disable(
                            com.fasterxml.jackson.databind.DeserializationFeature
                                .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);
                var authoring =
                    mapper.treeToValue(
                        d.path("authoring"),
                        com.citi.put.checks.studio.dto.AuthoringV2Request.class);
                var identity =
                    com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
                        authoring,
                        com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(
                            rs.getString(16)));
                d.set("authoredDeclarations", identity.references().path("authoredDeclarations"));
                d.set("authoringRevisionInputs", mapper.valueToTree(identity.inputs()));
              } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) {
                throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                    "INVALID_CONTRACT", 422);
              }
              return new PublicationContracts.CurrentSource(d);
            },
            testId);
    require(!rows.isEmpty(), "FORBIDDEN_SCOPE", 403);
    return rows.getFirst();
  }

  public PublicationContracts.Base capture(
      JsonNode session, JsonNode replayRequirements, Instant now) {
    transaction();
    now = PublicationContracts.millisecond(now);
    String id = session.path("sessionId").asText();
    var current = lockCurrent(UUID.fromString(session.path("testId").asText()));
    var c = current.document();
    require(
        c.path("sourceRevision").equals(session.path("scope").path("sourceRevision"))
            && c.path("configurationRevision")
                .equals(session.path("scope").path("configurationRevision"))
            && c.path("csiId").equals(session.path("scope").path("csiId")),
        "REVISION_CONFLICT",
        409);
    var manifestRow =
        jdbc.queryForMap(
            "SELECT manifest::text,manifest_hash FROM studio_guided_source_manifests WHERE"
                + " session_id=?",
            id);
    ObjectNode manifest =
        PublicationContracts.copy(contracts.parse((String) manifestRow.get("manifest")));
    require(
        GuidedContracts.hash(manifest).equals(manifestRow.get("manifest_hash")),
        "INVALID_CONTRACT",
        422);
    manifest.remove("configurationValues");
    ObjectNode d = contracts.object().put("sessionId", id).put("resultContractVersion", 3);
    for (String key :
        List.of(
            "testId",
            "csiId",
            "sourceRevision",
            "configurationRevision",
            "publicationEpoch",
            "confirmedRevisionId")) {
      d.set(key, c.path(key));
    }
    var source = contracts.object().putArray("items");
    var ordered = contracts.object().putArray("items");
    int ordinal = 0;
    for (JsonNode step : c.path("authoring").path("steps")) {
      source.add(step.path("text"));
      ordered
          .addObject()
          .put("stepId", step.path("id").asText())
          .put("ordinal", ordinal++)
          .set("source", step.path("text"));
    }
    require(ordinal > 0, "INVALID_CONTRACT", 422);
    d.put("sourceHash", GuidedContracts.hash(source))
        .put("authoringHash", GuidedContracts.hash(ordered))
        .put("configurationHash", GuidedContracts.hash(c.path("configuration")))
        .put("scopeHash", session.path("scopeHash").asText())
        .put("runAuthorizationHash", GuidedContracts.hash(session.path("runAuthorization")))
        .put("sourceManifestHash", GuidedContracts.hash(manifest))
        .put("originalPrincipalId", session.path("runAuthorization").path("principalId").asText());
    d.set("runAuthorization", session.path("runAuthorization").deepCopy());
    d.set("initialContext", replayRequirements.path("initialContext").deepCopy());
    d.set("replayRequirements", replayRequirements.deepCopy());
    d.put("createdAt", PublicationContracts.time(now));
    Optional<PublicationContracts.Base> old = find(id);
    if (old.isPresent()) {
      ObjectNode same = PublicationContracts.copy(old.get().document());
      d.set("createdAt", same.path("createdAt"));
      require(same.equals(d), "IDEMPOTENCY_CONFLICT", 409);
      return old.get();
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_publication_bases(session_id,test_id,csi_id,scope_hash,document,created_at)"
            + " VALUES (?,?,?,?,?::jsonb,?)",
        id,
        UUID.fromString(c.path("testId").asText()),
        c.path("csiId").asText(),
        session.path("scopeHash").asText(),
        d.toString(),
        Timestamp.from(now));
    return new PublicationContracts.Base(d);
  }

  public void requireCurrent(
      PublicationContracts.Base base, PublicationContracts.CurrentSource current) {
    transaction();
    var b = base.document();
    var c = current.document();
    require(
        c.path("deletedAt").isNull() && !c.path("quarantined").asBoolean(), "FORBIDDEN_SCOPE", 403);
    for (String key :
        List.of(
            "testId",
            "csiId",
            "sourceRevision",
            "configurationRevision",
            "publicationEpoch",
            "confirmedRevisionId")) {
      require(b.path(key).equals(c.path(key)), "PUBLICATION_CONFLICT", 409);
    }
    JsonNode manifest =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT manifest::text FROM" + " studio_guided_source_manifests WHERE session_id=?",
                String.class,
                b.path("sessionId").asText()));
    require(
        manifest.path("authoringSnapshot").equals(c.path("authoring"))
            && manifest.path("authoredDeclarations").equals(c.path("authoredDeclarations"))
            && manifest.path("authoringRevisionInputs").equals(c.path("authoringRevisionInputs")),
        "PUBLICATION_CONFLICT",
        409);
    var source = contracts.object().putArray("items");
    var ordered = contracts.object().putArray("items");
    int index = 0;
    for (JsonNode step : c.path("authoring").path("steps")) {
      source.add(step.path("text"));
      ordered
          .addObject()
          .put("stepId", step.path("id").asText())
          .put("ordinal", index++)
          .set("source", step.path("text"));
    }
    require(
        b.path("sourceHash").asText().equals(GuidedContracts.hash(source))
            && b.path("authoringHash").asText().equals(GuidedContracts.hash(ordered))
            && b.path("configurationHash")
                .asText()
                .equals(GuidedContracts.hash(c.path("configuration"))),
        "PUBLICATION_CONFLICT",
        409);
  }
}
