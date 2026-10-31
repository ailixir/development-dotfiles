package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashSet;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

/** Joins question meanings and selected meaning to the caller's session question transaction. */
public final class GuidedClarificationContextStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedClarificationContextStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public void create(JsonNode session, JsonNode question, JsonNode meanings) {
    GuidedTranslationStore.transaction();
    require(
        meanings.isArray() && meanings.size() > 0 && meanings.size() <= 10,
        "INVALID_CONTRACT",
        422);
    require(
        question.path("sessionId").equals(session.path("sessionId"))
            && question.path("scopeHash").equals(session.path("scopeHash")),
        "FORBIDDEN_SCOPE",
        403);
    Set<String> choices = new HashSet<>();
    for (JsonNode choice : question.path("choices")) {
      require(choices.add(choice.path("choiceId").asText()), "INVALID_CONTRACT", 422);
    }
    Set<String> mapped = new HashSet<>();
    // ADR-SC-007 D6: an observed choice is stored with the semantic selection {role, name,
    // evidence} copied from the facts of the observation the question was asked on; the
    // model-facing
    // meaning carries only the obligation, the ref and the binding.
    boolean observed = question.path("phase").asText().equals("observed");
    for (JsonNode mapping : meanings) {
      require(
          mapping.isObject()
              && mapping.size() == (observed ? 3 : 2)
              && mapping.hasNonNull("choiceId")
              && mapping.hasNonNull("meaning")
              && mapping.path("meaning").isObject()
              && (!observed || mapping.path("selection").isObject())
              && choices.contains(mapping.path("choiceId").asText())
              && mapped.add(mapping.path("choiceId").asText()),
          "INVALID_CONTRACT",
          422);
    }
    require(mapped.equals(choices), "INVALID_CONTRACT", 422);
    ObjectNode identity = contracts.object();
    for (String field : new String[] {"sessionId", "scopeHash"}) {
      identity.set(field, session.path(field).deepCopy());
    }
    for (String field : new String[] {"sourceRevision", "configurationRevision"}) {
      identity.set(field, session.path("scope").path(field).deepCopy());
    }
    identity.set("question", question.deepCopy());
    identity.set("clarificationId", question.path("clarificationId").deepCopy());
    require(
        GuidedContracts.canonical(identity).getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                <= 65536
            && GuidedContracts.canonical(meanings)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)
                    .length
                <= 65536,
        "INVALID_CONTRACT",
        422);
    String id = session.path("sessionId").asText(),
        questionId = question.path("clarificationId").asText();
    var old =
        jdbc.query(
            "SELECT identity::text,meanings::text FROM studio_guided_clarification_contexts WHERE"
                + " session_id=? AND clarification_id=?",
            (rs, n) ->
                contracts.parse(rs.getString(1)).equals(identity)
                    && contracts.parse(rs.getString(2)).equals(meanings),
            id,
            questionId);
    if (!old.isEmpty()) {
      require(old.getFirst(), "IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_clarification_contexts(session_id,clarification_id,identity,meanings)"
            + " VALUES (?,?,?::jsonb,?::jsonb)",
        id,
        questionId,
        identity.toString(),
        meanings.toString());
  }

  public java.util.List<ObjectNode> acceptedObserved(String sessionId) {
    GuidedTranslationStore.transaction();
    return jdbc.query(
        "SELECT identity::text,meanings::text,accepted_choice FROM"
            + " studio_guided_clarification_contexts WHERE session_id=? AND accepted_choice IS NOT"
            + " NULL AND identity->'question'->>'phase'='observed' ORDER BY created_at,"
            + " clarification_id",
        (rs, n) -> {
          ObjectNode row = contracts.object().put("acceptedChoiceId", rs.getString(3));
          row.set("context", contracts.parse(rs.getString(1)));
          row.set("meanings", contracts.parse(rs.getString(2)));
          return row;
        },
        sessionId);
  }

  /**
   * The accepted observed clarifications that count: the latest accepted question per obligation
   * (by creation time, then clarification id). Asking again after an earlier choice no longer
   * identified one element gives an obligation two accepted answers; the later one supersedes the
   * earlier. Superseded rows stay in the database and are neither a basis for an action nor part of
   * the publication evidence.
   */
  public java.util.List<ObjectNode> effectiveObserved(String sessionId) {
    java.util.Map<String, ObjectNode> latest = new java.util.LinkedHashMap<>();
    for (ObjectNode row : acceptedObserved(sessionId)) {
      for (JsonNode mapping : row.path("meanings")) {
        if (mapping.path("choiceId").equals(row.path("acceptedChoiceId"))) {
          latest.put(mapping.path("meaning").path("obligationId").asText(), row);
        }
      }
    }
    return new java.util.ArrayList<>(latest.values());
  }

  public JsonNode meanings(String sessionId, String clarificationId) {
    GuidedTranslationStore.transaction();
    var rows =
        jdbc.query(
            "SELECT meanings::text FROM studio_guided_clarification_contexts WHERE session_id=? AND"
                + " clarification_id=?",
            (rs, n) -> contracts.parse(rs.getString(1)),
            sessionId,
            clarificationId);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    return rows.getFirst();
  }

  public void accept(JsonNode session, String clarificationId, String choiceId) {
    GuidedTranslationStore.transaction();
    String id = session.path("sessionId").asText();
    var rows =
        jdbc.query(
            "SELECT identity::text,accepted_choice FROM studio_guided_clarification_contexts WHERE"
                + " session_id=? AND clarification_id=?",
            (rs, n) -> {
              JsonNode identity = contracts.parse(rs.getString(1));
              require(
                  identity.path("scopeHash").equals(session.path("scopeHash"))
                      && identity
                          .path("sourceRevision")
                          .equals(session.path("scope").path("sourceRevision"))
                      && identity
                          .path("configurationRevision")
                          .equals(session.path("scope").path("configurationRevision")),
                  "REVISION_CONFLICT",
                  409);
              return rs.getString(2) == null ? "" : rs.getString(2);
            },
            id,
            clarificationId);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    boolean present = false;
    for (JsonNode mapping : meanings(id, clarificationId)) {
      present |= mapping.path("choiceId").asText().equals(choiceId);
    }
    require(present, "INVALID_CONTRACT", 422);
    require(
        rows.getFirst().isEmpty() || rows.getFirst().equals(choiceId), "IDEMPOTENCY_CONFLICT", 409);
    if (rows.getFirst().isEmpty()) {
      jdbc.update(
          "UPDATE studio_guided_clarification_contexts SET accepted_choice=? WHERE session_id=? AND"
              + " clarification_id=? AND accepted_choice IS NULL",
          choiceId,
          id,
          clarificationId);
    }
  }

  public JsonNode selected(String sessionId, String clarificationId) {
    GuidedTranslationStore.transaction();
    var rows =
        jdbc.query(
            "SELECT accepted_choice FROM studio_guided_clarification_contexts WHERE session_id=?"
                + " AND clarification_id=?",
            (rs, n) -> rs.getString(1) == null ? "" : rs.getString(1),
            sessionId,
            clarificationId);
    require(!rows.isEmpty() && !rows.getFirst().isEmpty(), "MISSING_SOURCE", 409);
    for (JsonNode mapping : meanings(sessionId, clarificationId)) {
      if (mapping.path("choiceId").asText().equals(rows.getFirst())) {
        return mapping.path("meaning").deepCopy();
      }
    }
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
        "INVALID_CONTRACT", 422);
  }
}
