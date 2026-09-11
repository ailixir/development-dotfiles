package com.citi.put.checks.studio.dto;

/**
 * A declared variable reference on a draft (Architecture §8.3).
 *
 * <p>Exactly one of {@code value} (for {@code kind = plain}) or {@code secretId} (for {@code kind =
 * secretRef}) is meaningful. A resolved secret value never travels on this contract; only the
 * reference does (Architecture §9.2).
 */
public record StudioVariable(String name, String kind, String value, String secretId) {

  public static final String KIND_PLAIN = "plain";
  public static final String KIND_SECRET_REF = "secretRef";

  public static StudioVariable plain(String name, String value) {
    return new StudioVariable(name, KIND_PLAIN, value, null);
  }

  public static StudioVariable secretRef(String name, String secretId) {
    return new StudioVariable(name, KIND_SECRET_REF, null, secretId);
  }
}
