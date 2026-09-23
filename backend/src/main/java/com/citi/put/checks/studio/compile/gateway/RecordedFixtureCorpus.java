package com.citi.put.checks.studio.compile.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.core.io.Resource;

/**
 * Recorded plain-English to artifact pairs for local and CI translation.
 *
 * <p>This corpus is deliberately an <em>exact</em> lookup: a fixture answers one recorded source
 * and nothing else. It cannot generalise, so it can never be mistaken for evidence that model
 * translation works — it exists so the authoring, validation, dispatch, browser and evidence
 * lifecycle can be exercised without a gateway credential. The staging/prod readiness guard in
 * {@link StudioGatewayConfig} rejects this provider outright.
 *
 * <p>Fixture documents use the same shape as the runner's reference corpus, so a pair can be moved
 * between the two without translation: {@code {"name":…, "source":[…], "artifact":{…}}}.
 */
public final class RecordedFixtureCorpus {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final Map<String, String> artifactsBySource;
  private final List<String> names;

  private RecordedFixtureCorpus(Map<String, String> artifactsBySource, List<String> names) {
    this.artifactsBySource = Map.copyOf(artifactsBySource);
    this.names = List.copyOf(names);
  }

  /**
   * Reads every fixture document in the given resources.
   *
   * @param resources fixture documents, each carrying one {@code source}/{@code artifact} pair
   * @return the loaded corpus
   * @throws IllegalStateException when a document is unreadable or malformed, so a broken local
   *     fixture fails startup instead of silently answering nothing
   */
  public static RecordedFixtureCorpus load(Resource... resources) {
    Map<String, String> artifacts = new LinkedHashMap<>();
    List<String> loaded = new ArrayList<>();
    for (Resource resource : resources) {
      String description = resource.getDescription();
      try (InputStream in = resource.getInputStream()) {
        JsonNode document = MAPPER.readTree(in);
        JsonNode source = document.path("source");
        JsonNode artifact = document.path("artifact");
        if (!source.isArray() || source.isEmpty() || !artifact.isObject()) {
          throw new IllegalStateException(
              "recorded fixture must carry a non-empty source array and an artifact object: "
                  + description);
        }
        List<String> lines = new ArrayList<>(source.size());
        for (JsonNode line : source) {
          if (!line.isTextual()) {
            throw new IllegalStateException(
                "recorded fixture source lines must be strings: " + description);
          }
          lines.add(line.asText());
        }
        String name = document.path("name").asText(description);
        String previous = artifacts.put(key(lines), MAPPER.writeValueAsString(artifact));
        if (previous != null) {
          throw new IllegalStateException(
              "two recorded fixtures record the same source: " + description);
        }
        loaded.add(name);
      } catch (IOException e) {
        throw new IllegalStateException("recorded fixture is unreadable: " + description, e);
      }
    }
    return new RecordedFixtureCorpus(artifacts, loaded);
  }

  /**
   * The artifact recorded for exactly this source.
   *
   * @param orderedSource the draft's steps in author order
   * @return the artifact document, or empty when nothing was recorded for that source
   */
  public Optional<String> artifactFor(List<String> orderedSource) {
    return Optional.ofNullable(artifactsBySource.get(key(orderedSource)));
  }

  /**
   * Fixture names in load order, for the startup log.
   *
   * @return the recorded fixture names
   */
  public List<String> names() {
    return names;
  }

  /**
   * How many pairs the corpus holds.
   *
   * @return the fixture count
   */
  public int size() {
    return artifactsBySource.size();
  }

  private static String key(List<String> orderedSource) {
    StringBuilder builder = new StringBuilder();
    for (String line : orderedSource) {
      builder.append(line == null ? "" : line.strip()).append('\n');
    }
    return builder.toString();
  }
}
