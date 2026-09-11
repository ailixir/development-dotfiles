package com.citi.put.checks.studio.secrets;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The development and test vault (AC-8, AC-9).
 *
 * <p>`ED-02`'s fallback authorises <em>"development identities confined to local/mock
 * operation"</em> and <b>confined</b> is the operative word: this class is only ever instantiated
 * by {@link StudioVaultConfiguration}, which refuses to build it outside the development and test
 * profiles and refuses to start at all when no provider is named.
 *
 * <p>It is rotation-capable because AC-8 needs a rotation that happens <em>between</em> the
 * acceptance transaction and the dispatcher's claim, which no fixture can arrange against a
 * provider that cannot change. {@link #rotate} is the only mutator and it always issues a new
 * version identifier — <b>including when the new value equals the old one</b>. That is deliberate:
 * a version identifier that changed only when the bytes changed would be an oracle for comparing
 * two values, which is exactly what §4.2's <em>"nonsecret"</em> forbids.
 *
 * <p>Entries are keyed by CSI, environment and name together, so a reference entitled only in
 * {@code dev} is simply absent for a {@code prod} execution and the resolver's ordinary not-found
 * path refuses it. There is no CSI column on the platform {@code secrets} table and this class adds
 * none: inventing an entitlement model on a table `ED-02` replaces would be an Article IV
 * violation, and the CSI and environment halves are decidable from the revision and the execution,
 * which is where AC-5a puts them.
 */
public final class FakeStudioVaultProvider implements StudioVaultProvider {

  /** Names it, out loud, wherever a provider name is shown. */
  public static final String NAME = "fake";

  private record Entry(String value, String versionIdentifier) {}

  private final Map<String, Entry> entries = new ConcurrentHashMap<>();

  /** Seeds the vault from development configuration. */
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
    Entry entry = entries.get(key(kind, csiId, environment, referenceName));
    return entry == null
        ? Optional.empty()
        : Optional.of(new VaultEntry(entry.value().toCharArray(), entry.versionIdentifier()));
  }

  /** Creates or replaces a reference, always with a fresh version identifier (AC-8). */
  public void rotate(
      ReferenceKind kind, String csiId, String environment, String referenceName, String value) {
    entries.put(
        key(kind, csiId, environment, referenceName), new Entry(value, newVersionIdentifier()));
  }

  /** Deletes a reference, which is the vault half of {@code REFERENCE_UNAVAILABLE} (AC-7a). */
  public void delete(ReferenceKind kind, String csiId, String environment, String referenceName) {
    entries.remove(key(kind, csiId, environment, referenceName));
  }

  /** Empties the vault. For test isolation only. */
  public void clear() {
    entries.clear();
  }

  /** The seed key form, exposed so configuration and tests agree on one derivation. */
  public static String key(
      ReferenceKind kind, String csiId, String environment, String referenceName) {
    return kind.name() + '|' + csiId + '|' + environment + '|' + referenceName;
  }

  private static String newVersionIdentifier() {
    return "fake-v" + UUID.randomUUID();
  }

  /**
   * Parses the development seed, whose keys are {@code KIND|csi|environment|name}.
   *
   * <p>A malformed key is a startup failure rather than a silently absent reference: an operator
   * who mistyped a seed key should see it now, not as a run whose password field was empty.
   */
  public static Map<String, String> parseSeed(Map<String, String> configured) {
    Map<String, String> parsed = new LinkedHashMap<>();
    configured.forEach(
        (key, value) -> {
          String[] parts = key.split("\\|", -1);
          if (parts.length != 4) {
            throw new IllegalStateException(
                "studio.secrets.vault.fake.entries key '"
                    + key
                    + "' is not KIND|csi|environment|name");
          }
          ReferenceKind.valueOf(parts[0]);
          parsed.put(key, value);
        });
    return parsed;
  }
}
