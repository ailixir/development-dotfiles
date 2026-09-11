package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An immutable snapshot of everything one compile attempt needs from the draft (Story 10.8).
 *
 * <p>Taken on the request thread, before the attempt is handed to the bounded pool, for two
 * reasons. The first is mechanical: the attempt runs outside any transaction or {@code
 * EntityManager}, so a lazily-loaded entity would fail there. The second matters more — an attempt
 * that re-read the draft would compile text nobody asked it to compile, and the whole conditional
 * publish of 10.4 rests on the attempt being for the revisions {@code beginCompile} returned.
 *
 * <p><strong>No resolved value is present in this type.</strong> Variable and secret references are
 * carried as names, and the source lines carry {@code <var NAME>} / {@code <secret ID>} exactly as
 * the author wrote them. There is no field a resolved secret could occupy (&sect;4.3, &sect;9.2).
 *
 * @param testId the draft
 * @param csiId its owning CSI
 * @param principal the authenticated user that triggered the compile
 * @param orderedSource the steps in author order, references still opaque
 * @param variableNames declared {@code vars.get} names
 * @param secretNames declared {@code vars.secret} ids
 * @param configurationJson the nonsecret execution configuration recorded on the revision
 */
public record CompileInputs(
    UUID testId,
    String csiId,
    String principal,
    List<String> orderedSource,
    List<String> variableNames,
    List<String> secretNames,
    String configurationJson) {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public CompileInputs {
    orderedSource = List.copyOf(orderedSource);
    variableNames = List.copyOf(variableNames);
    secretNames = List.copyOf(secretNames);
  }

  /**
   * Reads the snapshot off a loaded draft.
   *
   * @param test the draft row
   * @param principal the authenticated user
   * @return the snapshot
   */
  public static CompileInputs from(UITest test, String principal) {
    List<String> source = LegacyStudioAdapter.parseSteps(test.getSteps());
    List<StudioVariable> variables = LegacyStudioAdapter.parseVariables(test.getVariables());

    List<String> variableNames = new ArrayList<>();
    List<String> secretNames = new ArrayList<>();
    for (StudioVariable variable : variables) {
      if (StudioVariable.KIND_SECRET_REF.equals(variable.kind())) {
        // The id is the reference; a reference name alone grants nothing (§9.2).
        secretNames.add(variable.secretId() == null ? variable.name() : variable.secretId());
      } else {
        // The name only. `value` is never read on the compile path, by this or any other path.
        variableNames.add(variable.name());
      }
    }

    return new CompileInputs(
        test.getId(),
        test.getCsiId(),
        principal,
        source,
        variableNames,
        secretNames,
        configuration(test));
  }

  /**
   * The declared references, in the shape the revision row and the validator both expect.
   *
   * @return {@code {"variables": [...], "secrets": [...]}}
   */
  public String referencesJson() {
    ObjectNode root = MAPPER.createObjectNode();
    ArrayNode variables = root.putArray("variables");
    variableNames.forEach(variables::add);
    ArrayNode secrets = root.putArray("secrets");
    secretNames.forEach(secrets::add);
    return root.toString();
  }

  /**
   * The nonsecret execution configuration snapshot (&sect;8.1).
   *
   * <p>Variable <em>values</em> are deliberately absent: this document is persisted on an immutable
   * revision that outlives the draft, and a plain variable's value is still someone's data.
   */
  private static String configuration(UITest test) {
    ObjectNode configuration = MAPPER.createObjectNode();
    configuration.put("browser", LegacyStudioAdapter.normalizeBrowser(test.getBrowser()));
    ObjectNode viewport = configuration.putObject("viewport");
    viewport.put("width", test.getViewportWidth());
    viewport.put("height", test.getViewportHeight());
    configuration.put("timeoutSeconds", test.getTimeoutSeconds());
    configuration.put("waitStrategy", test.getWaitStrategy());
    configuration.put("environment", test.getEnvironment());
    return configuration.toString();
  }
}
