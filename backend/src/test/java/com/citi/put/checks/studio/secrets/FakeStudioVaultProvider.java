package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Mutable test double for rotation, revocation, and provider-outage tests. */
public final class FakeStudioVaultProvider implements StudioVaultProvider {

  public static final String NAME = "fake";

  private record Entry(String value, String versionIdentifier, List<String> allowedOrigins) {
    Entry(String value, String versionIdentifier) {
      this(value, versionIdentifier, List.of());
    }
  }

  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private volatile boolean available = true;

  public FakeStudioVaultProvider(Map<String, String> seed) {
    seed.forEach((key, value) -> entries.put(key, new Entry(value, newVersionIdentifier())));
  }

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public Optional<VaultEntry> read(
      ReferenceKind kind, String csiId, String environment, String referenceName) {
    if (!available) {
      throw new VaultProviderUnavailableException("The test vault is unavailable");
    }
    Entry entry = entries.get(key(kind, csiId, environment, referenceName));
    return entry == null
        ? Optional.empty()
        : Optional.of(
            new VaultEntry(
                entry.value().toCharArray(), entry.versionIdentifier(), entry.allowedOrigins()));
  }

  public void rotate(
      ReferenceKind kind, String csiId, String environment, String referenceName, String value) {
    entries.put(
        key(kind, csiId, environment, referenceName), new Entry(value, newVersionIdentifier()));
  }

  /**
   * Binds an existing entry to origins, as its vault entry's {@code allowedOrigins} would. The list
   * goes through the production normalizer, so a malformed one binds to none, as it would in Vault.
   */
  public void bindOrigins(
      ReferenceKind kind,
      String csiId,
      String environment,
      String referenceName,
      String allowedOrigins) {
    entries.computeIfPresent(
        key(kind, csiId, environment, referenceName),
        (unused, entry) ->
            new Entry(
                entry.value(), entry.versionIdentifier(), SecretOrigins.parse(allowedOrigins)));
  }

  public void delete(ReferenceKind kind, String csiId, String environment, String referenceName) {
    entries.remove(key(kind, csiId, environment, referenceName));
  }

  public void clear() {
    entries.clear();
    available = true;
  }

  public void makeUnavailable() {
    available = false;
  }

  public static String key(
      ReferenceKind kind, String csiId, String environment, String referenceName) {
    return kind.name() + '|' + csiId + '|' + environment + '|' + referenceName;
  }

  private static String newVersionIdentifier() {
    return "fake-v" + UUID.randomUUID();
  }
}
