package com.citi.put.checks.studio.evidence;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.yaml.snakeyaml.Yaml;

/**
 * Reads the frozen document, so nothing story 10.15 asserts about it is transcribed.
 *
 * <p>ADR-002 §18.3's method: a code set, a status set or an example's value is <b>read from the
 * document at test time</b>. A transcribed copy agrees with itself forever.
 */
public final class ContractDocument {

  public static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  public static final String VIDEO_PATH = "/executions/{id}/video";

  private final Map<String, Object> root;

  private ContractDocument(Map<String, Object> root) {
    this.root = root;
  }

  public static ContractDocument load() throws IOException {
    return loadFrom(CONTRACT);
  }

  @SuppressWarnings("unchecked")
  public static ContractDocument loadFrom(Path path) throws IOException {
    return new ContractDocument(
        (Map<String, Object>) new Yaml().load(Files.readString(path, StandardCharsets.UTF_8)));
  }

  public Map<String, Object> root() {
    return root;
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> paths() {
    return (Map<String, Object>) root.get("paths");
  }

  /** The {@code get} operation at {@code path}, or an empty map. */
  @SuppressWarnings("unchecked")
  public Map<String, Object> getOperation(String path) {
    Object item = paths().get(path);
    if (!(item instanceof Map)) {
      return new LinkedHashMap<>();
    }
    Object operation = ((Map<String, Object>) item).get("get");
    return operation instanceof Map ? (Map<String, Object>) operation : new LinkedHashMap<>();
  }

  /** Walks a chain of map keys, returning null the moment one is missing. */
  @SuppressWarnings("unchecked")
  public static Object at(Object node, Object... keys) {
    Object current = node;
    for (Object key : keys) {
      if (!(current instanceof Map)) {
        return null;
      }
      current = ((Map<Object, Object>) current).get(key);
    }
    return current;
  }
}
