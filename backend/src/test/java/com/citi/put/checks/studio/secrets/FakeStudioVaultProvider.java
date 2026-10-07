package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Mutable test double for rotation, revocation, and provider-outage tests.
 *
 * <p>Entries are keyed {@code kind|csi|environment|testId|name}, the same coordinates the real
 * provider renders into its path, so a secret stored for one test is absent for another test with
 * the same CSI and environment.
 */
public final class FakeStudioVaultProvider implements StudioVaultProvider {

  public static final String NAME = "fake";

  private record Entry(String value, String versionIdentifier, List<String> allowedOrigins) {
    Entry(String value, String versionIdentifier) {
      this(value, versionIdentifier, List.of());
    }
  }

  /** One {@link #create} call, as recorded: the scope and the name, never the value. */
  public record CreateCall(VaultScope scope, String name) {}

  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private final List<CreateCall> creates = new CopyOnWriteArrayList<>();
  private volatile boolean available = true;

  public FakeStudioVaultProvider(Map<String, String> seed) {
    seed.forEach((key, value) -> entries.put(key, new Entry(value, newVersionIdentifier())));
  }

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName) {
    requireAvailable();
    Entry entry = entries.get(key(kind, scope, referenceName));
    return entry == null
        ? Optional.empty()
        : Optional.of(
            new VaultEntry(
                entry.value().toCharArray(), entry.versionIdentifier(), entry.allowedOrigins()));
  }

  /**
   * Create-only, like a {@code cas=0} write: a present key is {@link SecretAlreadyExistsException}
   * and is left untouched. Origins go through the production normalizer.
   */
  @Override
  public String create(VaultScope scope, String name, char[] value, List<String> origins) {
    requireAvailable();
    creates.add(new CreateCall(scope, name));
    Entry created =
        new Entry(new String(value), "1", SecretOrigins.parse(String.join(",", origins)));
    if (entries.putIfAbsent(key(ReferenceKind.SECRET, scope, name), created) != null) {
      throw new SecretAlreadyExistsException(name);
    }
    return created.versionIdentifier();
  }

  @Override
  public List<String> listSecretNames(VaultScope scope) {
    requireAvailable();
    String prefix = key(ReferenceKind.SECRET, scope, "");
    return entries.keySet().stream()
        .filter(key -> key.startsWith(prefix))
        .map(key -> key.substring(prefix.length()))
        .filter(StudioVaultProvider::isValidSecretName)
        .sorted()
        .toList();
  }

  public void rotate(ReferenceKind kind, VaultScope scope, String referenceName, String value) {
    entries.put(key(kind, scope, referenceName), new Entry(value, newVersionIdentifier()));
  }

  /**
   * Binds an existing entry to origins, as its vault entry's {@code allowedOrigins} would. The list
   * goes through the production normalizer, so a malformed one binds to none, as it would in Vault.
   */
  public void bindOrigins(
      ReferenceKind kind, VaultScope scope, String referenceName, String allowedOrigins) {
    entries.computeIfPresent(
        key(kind, scope, referenceName),
        (unused, entry) ->
            new Entry(
                entry.value(), entry.versionIdentifier(), SecretOrigins.parse(allowedOrigins)));
  }

  public void delete(ReferenceKind kind, VaultScope scope, String referenceName) {
    entries.remove(key(kind, scope, referenceName));
  }

  /** Every {@link #create} call so far, in order. Names and scopes only. */
  public List<CreateCall> creates() {
    return List.copyOf(creates);
  }

  public void clear() {
    entries.clear();
    creates.clear();
    available = true;
  }

  public void makeUnavailable() {
    available = false;
  }

  public static String key(ReferenceKind kind, VaultScope scope, String referenceName) {
    return kind.name()
        + '|'
        + scope.csiId()
        + '|'
        + scope.environment()
        + '|'
        + scope.testId()
        + '|'
        + referenceName;
  }

  private void requireAvailable() {
    if (!available) {
      throw new VaultProviderUnavailableException("The test vault is unavailable");
    }
  }

  private static String newVersionIdentifier() {
    return "fake-v" + UUID.randomUUID();
  }
}
