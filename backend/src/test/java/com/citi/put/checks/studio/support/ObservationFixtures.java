package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * ADR-SC-007: builders of valid observations in the new shape (an outline string plus a facts table
 * keyed by the refs the outline shows) and of the runner-reported resolved targets a preparation
 * proof carries. One place builds them so that the converted tests, the scripted models of the
 * integration tests and the gate tests agree on the shape; {@code ObservationFixturesTest}
 * validates every builder output against the v3 schemas.
 */
public final class ObservationFixtures {
  private ObservationFixtures() {}

  private static final GuidedContracts C = new GuidedContracts();

  public static final String SESSION_ID = "session-1";
  public static final String SCOPE_HASH =
      "c492d7554d0bf7482f4e9afee2054800284d407483891e8b91c7fc985803b01c";
  public static final String ORIGIN = "https://orders.example.test";

  /** Starts an observation: {@code document-1}, generation 1, no elements. */
  public static Builder observation() {
    return new Builder();
  }

  /** A fact on its own: role, name, editable, evidence (= name), one {@code name} segment. */
  public static ObjectNode fact(String role, String name, boolean editable, String text) {
    ObjectNode fact = C.object();
    fact.put("role", role)
        .put("name", name)
        .put("editable", editable)
        .put("evidence", name)
        .put("nameComplete", true)
        .put("ownTextComplete", true);
    ArrayNode segments = fact.putArray("evidenceSegments");
    if (!name.isEmpty()) {
      segments.addObject().put("field", "name").put("start", 0).put("end", name.length());
    }
    if (text != null) {
      fact.put("text", text);
    }
    return fact;
  }

  public static final class Builder {
    private final StringBuilder outline = new StringBuilder("- document");
    private final ObjectNode facts = C.object();
    private int withheld;
    private int unsupported;
    private int passwords;
    private long generation = 1;
    private String documentId = "document-1";
    private boolean projected;
    private int nextRef = 1;
    private int shownLines = 1;
    private int notShown;

    private Builder() {}

    /** The next free ref ({@code e1}, {@code e2}, ...). */
    public String nextRef() {
      return "e" + nextRef;
    }

    /** One shown element with the given role and name, not editable, no text. */
    public Builder element(String ref, String role, String name) {
      return add(ref, role, name, fact(role, name, false, null));
    }

    /** One shown, editable control. */
    public Builder editable(String ref, String role, String name) {
      return add(ref, role, name, fact(role, name, true, null));
    }

    /** One shown element whose visible text is available to a read. */
    public Builder readable(String ref, String role, String name, String text) {
      return add(ref, role, name, fact(role, name, false, text));
    }

    /** One shown element with a hand-built fact (the outline line follows its role and name). */
    public Builder withFact(String ref, ObjectNode fact) {
      return add(ref, fact.path("role").asText(), fact.path("name").asText(), fact);
    }

    /** A line the outline shows without a ref (withheld, password, unsupported, group). */
    public Builder line(String rawOutlineLine) {
      outline.append('\n').append(rawOutlineLine);
      shownLines++;
      return this;
    }

    public Builder coverage(int withheldRegions, int unsupportedRegions, int passwordControls) {
      this.withheld = withheldRegions;
      this.unsupported = unsupportedRegions;
      this.passwords = passwordControls;
      return this;
    }

    public Builder document(String documentId, long generation) {
      this.documentId = documentId;
      this.generation = generation;
      return this;
    }

    /** The projection reports a focused outline; the nodes left out are counted, not named. */
    public Builder projected(int notShown) {
      this.projected = true;
      this.notShown = notShown;
      return this;
    }

    private Builder add(String ref, String role, String name, ObjectNode fact) {
      outline
          .append("\n  - ")
          .append(role)
          .append(name.isEmpty() ? "" : " " + quote(name))
          .append(" [")
          .append(ref)
          .append(']');
      facts.set(ref, fact);
      shownLines++;
      try {
        nextRef = Math.max(nextRef, Integer.parseInt(ref.substring(1)) + 1);
      } catch (NumberFormatException ignored) {
        // A hand-chosen ref outside e<number>: the counter is only a convenience.
      }
      return this;
    }

    /** The observation as the contract v3 {@code observation} schema defines it. */
    public ObjectNode build() {
      ObjectNode observation = C.object();
      observation.put("schemaVersion", 3);
      observation.put("sessionId", SESSION_ID);
      observation.put("scopeHash", SCOPE_HASH);
      observation.put("documentId", documentId);
      observation.put("generation", generation);
      observation.put("origin", ORIGIN);
      observation.put("observedAt", "2026-10-08T03:00:05Z");
      observation
          .putObject("coverage")
          .put("withheldRegions", withheld)
          .put("unsupportedRegions", unsupported)
          .put("passwordControls", passwords);
      String text = outline.toString();
      ObjectNode projection = observation.putObject("projection");
      projection.put("projected", projected);
      if (projected) {
        projection.put("tier", "focus+parent");
      } else {
        projection.putNull("tier");
      }
      projection
          .put("totalNodes", shownLines + notShown)
          .put("shownNodes", shownLines)
          .put("notShown", notShown)
          .put("outlineBytes", text.getBytes(StandardCharsets.UTF_8).length);
      observation.put("outline", text);
      observation.set("facts", facts.deepCopy());
      return observation;
    }

    /** The refs the outline shows, in order. */
    public List<String> refs() {
      List<String> refs = new ArrayList<>();
      facts.fieldNames().forEachRemaining(refs::add);
      return refs;
    }
  }

  /** A JSON string literal (the outline quotes names the way the runner does). */
  private static String quote(String name) {
    return C.object().textNode(name).toString();
  }

  /** The {@code progress} object the validator reads: the observation under {@code observation}. */
  public static ObjectNode progressWith(JsonNode observation) {
    ObjectNode progress = C.object();
    progress.put("documentId", observation.path("documentId").asText());
    progress.set("generation", observation.path("generation"));
    progress.set("observation", observation);
    return progress;
  }
}
