package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.secrets.SecretsRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The `ED-02` stub resolver story 10.17 replaces (AC-10b).
 *
 * <p>It answers the two questions the seam asks — is this name a reference this CSI may use, and
 * what is its value at dispatch — against the existing secrets table, and returns a configured
 * canary as the value. The canary exists so that AC-10a's leak assertions have something to search
 * for: a value that is distinctive, that no other part of the system produces, and whose appearance
 * in a persisted row, a log line, an error body or an SSE payload is unambiguous.
 *
 * <p>It is not the vault. It cannot satisfy staging acceptance and is not meant to.
 */
@Component
public class StubStudioReferenceResolver implements StudioReferenceResolver {

  private final SecretsRepository secrets;
  private final String canary;

  public StubStudioReferenceResolver(
      SecretsRepository secrets,
      @Value("${studio.execution.reference-canary:studio-canary-value-do-not-persist}")
          String canary) {
    this.secrets = secrets;
    this.canary = canary;
  }

  @Override
  public void preflight(String csiId, List<String> referenceNames) {
    for (String name : referenceNames) {
      if (name == null || name.isBlank()) {
        throw new UnknownReferenceException("");
      }
      if (secrets.findByReferenceId(name).isEmpty()) {
        throw new UnknownReferenceException(name);
      }
    }
  }

  @Override
  public Resolved resolve(String csiId, List<String> referenceNames) {
    Map<String, char[]> values = new LinkedHashMap<>();
    for (String name : referenceNames) {
      if (secrets.findByReferenceId(name).isEmpty()) {
        values.values().forEach(value -> java.util.Arrays.fill(value, '\0'));
        throw new ReferenceUnavailableException(name);
      }
      values.put(name, canary.toCharArray());
    }
    return new Resolved(values);
  }

  /** A declared reference this CSI may not use, or that does not exist. Never carries a value. */
  public static class UnknownReferenceException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public UnknownReferenceException(String referenceName) {
      super("Reference '" + referenceName + "' is not a reference this CSI may use");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }
}
