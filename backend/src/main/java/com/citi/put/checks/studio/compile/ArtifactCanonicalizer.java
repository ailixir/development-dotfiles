package com.citi.put.checks.studio.compile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.List;

/**
 * The single canonicalization and hashing helper for Studio source and artifacts (Story 10.8;
 * requested by 10.4 so the writer and the reader cannot disagree).
 *
 * <p>Canonical form is compact JSON with object keys sorted. Sorting is not tidiness: {@code
 * ui_test_revisions.source} and {@code .artifact} are {@code jsonb} columns, and PostgreSQL does
 * not preserve object key order. A hash taken over the bytes as written would therefore not
 * reproduce over the bytes as read, and AC-22's term 5 — re-hashing on every execute — would fail
 * for every revision. Sorting makes the hash a property of the document rather than of the
 * serializer that happened to produce it.
 *
 * <p>Used by the compile pipeline to produce {@code source_hash} and {@code artifact_hash}, and by
 * {@code ExecutionReadinessService} to re-derive both from the stored rows. One implementation, so
 * a change to canonicalization cannot make old revisions silently unrunnable in only one direction.
 */
public final class ArtifactCanonicalizer {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private ArtifactCanonicalizer() {}

  /**
   * Canonical document for an ordered list of {@code originalText} lines.
   *
   * @param orderedSource the draft's steps, in author order
   * @return a compact JSON array of strings
   */
  public static String canonicalSource(List<String> orderedSource) {
    ArrayNode array = MAPPER.createArrayNode();
    for (String line : orderedSource) {
      array.add(line == null ? "" : line);
    }
    return array.toString();
  }

  /**
   * Canonical form of an arbitrary JSON document: compact, with every object's keys sorted.
   *
   * @param json the document, as stored or as produced
   * @return its canonical serialization
   * @throws IllegalArgumentException when {@code json} is not a JSON document
   */
  public static String canonicalize(String json) {
    try {
      return sort(MAPPER.readTree(json)).toString();
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("Not a JSON document: " + e.getOriginalMessage(), e);
    }
  }

  /**
   * SHA-256, lowercase hex, over the canonical bytes of a JSON document.
   *
   * @param json the document
   * @return 64 hex characters, the width {@code ui_test_revisions.source_hash} declares
   */
  public static String hash(String json) {
    return sha256Hex(canonicalize(json));
  }

  /**
   * Hash of the ordered source, as stored on {@code ui_test_revisions.source_hash}.
   *
   * @param orderedSource the draft's steps, in author order
   * @return 64 hex characters
   */
  public static String sourceHash(List<String> orderedSource) {
    return sha256Hex(canonicalSource(orderedSource));
  }

  private static String sha256Hex(String canonical) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(canonical.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required to hash a Studio revision", e);
    }
  }

  private static JsonNode sort(JsonNode node) {
    if (node.isObject()) {
      ObjectNode source = (ObjectNode) node;
      List<String> names = new ArrayList<>();
      Iterator<String> fields = source.fieldNames();
      while (fields.hasNext()) {
        names.add(fields.next());
      }
      names.sort(String::compareTo);
      ObjectNode sorted = MAPPER.createObjectNode();
      for (String name : names) {
        sorted.set(name, sort(source.get(name)));
      }
      return sorted;
    }
    if (node.isArray()) {
      ArrayNode sorted = MAPPER.createArrayNode();
      for (JsonNode element : node) {
        sorted.add(sort(element));
      }
      return sorted;
    }
    return node;
  }
}
