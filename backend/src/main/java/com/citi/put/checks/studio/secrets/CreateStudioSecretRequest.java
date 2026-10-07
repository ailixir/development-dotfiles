package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Objects;

/**
 * The body of {@code POST /api/v1/studio/tests/{id}/secrets}: a name, a value and the origins the
 * value may be filled on.
 *
 * <p>The value is {@code char[]} so the service can erase it, and it is left out of {@link
 * #toString()}, {@link #equals} and {@link #hashCode()}, so no log line, assertion message or hash
 * lookup can carry or depend on it. The schema is closed: {@link StudioSecretsService} parses it
 * with a mapper that refuses unknown fields, so an old client body with {@code label} or {@code
 * scope}, or a body naming a CSI or environment, is a {@code 400} rather than a silent partial.
 *
 * @param name the secret name, which is also the {@code secretId} a step references
 * @param value the secret value; write-only, never returned
 * @param allowedOrigins the http(s) origins the value may be filled on
 */
public record CreateStudioSecretRequest(String name, char[] value, List<String> allowedOrigins) {

  @Override
  public boolean equals(Object other) {
    return other instanceof CreateStudioSecretRequest that
        && Objects.equals(name, that.name)
        && Objects.equals(allowedOrigins, that.allowedOrigins);
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, allowedOrigins);
  }

  @Override
  public String toString() {
    return "CreateStudioSecretRequest[name="
        + name
        + ", value=<omitted>, allowedOrigins="
        + allowedOrigins
        + "]";
  }
}
