package com.citi.put.checks.studio.secrets;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The one seam a resolved variable or secret value comes through (§9.2, AC-9).
 *
 * <p>Everything above this interface deals in reference <em>names</em>. Everything a value could
 * come from is behind it. That is the point: there is exactly one place to look when asking "where
 * could a value have entered this process", and exactly one place for `ED-02`'s real vault to land.
 *
 * <p>The production alpha selects the explicit no-call provider {@code none}; tests alone select
 * test doubles, and a connected deployment must explicitly select {@code hashicorp}. Missing or
 * unrecognised selections still fail startup.
 *
 * <p>Values are {@code char[]} the whole way, so a caller can erase what it was given. A provider
 * returns a fresh array on every read and retains no reference a caller's {@code close()} could
 * fail to reach.
 */
public interface StudioVaultProvider {

  /**
   * The provider's name, as it appears in the startup line and on the health surface.
   *
   * <p>The selected production provider is reported at startup (AC-9).
   */
  String name();

  /**
   * The one secret-name rule (D3): the endpoint that saves a secret, the resolver that reads one
   * and the provider that lists them all apply it.
   *
   * <p>It deliberately equals the capture group of the {@code <secret ID>} step token, so a name
   * that can be saved is a name a step can reference, and a stored key that fails it is one no step
   * can reach.
   */
  Pattern SECRET_NAME = Pattern.compile("^[A-Za-z0-9_.-]{1,64}$");

  /**
   * Whether {@code name} is a valid secret name: {@link #SECRET_NAME}, and not {@code .} or {@code
   * ..}, which are not path-safe Vault segments.
   */
  static boolean isValidSecretName(String name) {
    return name != null
        && SECRET_NAME.matcher(name).matches()
        && !".".equals(name)
        && !"..".equals(name);
  }

  /**
   * Reads one declared reference for one test scope.
   *
   * <p>The scope is (the execution's own CSI, the environment snapshotted at acceptance, the test
   * id). The CSI and the environment are the execution's own immutable values (§8.1, §9.1 —
   * <em>"Historical access uses execution CSI, not a mutable parent lookup"</em>), so moving or
   * editing the parent draft between acceptance and dispatch changes nothing here.
   *
   * @param kind whether this is a {@code vars.get} name or a {@code vars.secret} id
   * @param scope where the test's references live
   * @param referenceName the declared name
   * @return the value and its nonsecret version identifier, or empty when there is no such
   *     reference for this scope
   */
  Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName);

  /**
   * Stores a new secret for one test scope, create-only.
   *
   * <p>A name that already exists is refused and the stored entry is left untouched. The caller
   * owns {@code value} and erases it; a provider keeps no reference to it after returning.
   *
   * @param scope the test the secret belongs to
   * @param name a name that passes {@link #isValidSecretName}
   * @param value the secret value
   * @param origins the normalized origins the secret may be filled on ({@link SecretOrigins})
   * @return the stored entry's nonsecret version identifier
   * @throws SecretAlreadyExistsException when the name is already stored for this scope
   * @throws VaultNotConfiguredException when no vault is connected
   * @throws VaultProviderUnavailableException when the vault could not be reached or refused
   */
  String create(VaultScope scope, String name, char[] value, List<String> origins);

  /**
   * The names of the secrets stored for one test scope. Names only, never a value.
   *
   * @return the valid names ({@link #isValidSecretName}), sorted; empty when none are stored
   * @throws VaultNotConfiguredException when no vault is connected
   * @throws VaultProviderUnavailableException when the vault could not be reached or refused
   */
  List<String> listSecretNames(VaultScope scope);

  /** Which of the two declaration arrays a name came from. */
  enum ReferenceKind {
    VARIABLE,
    SECRET
  }

  /**
   * One read.
   *
   * @param value a fresh array the caller owns and is expected to erase
   * @param versionIdentifier a nonsecret opaque string (§4.2). Never the value and never derived
   *     from it — a rotation of a value to itself still changes it, so it cannot be used to compare
   *     two values
   * @param allowedOrigins the normalized origins a secret may be filled on ({@link SecretOrigins});
   *     nonsecret. Empty means none, and a secret bound to none cannot be filled
   */
  record VaultEntry(char[] value, String versionIdentifier, List<String> allowedOrigins) {

    public VaultEntry {
      allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    }

    /** An entry bound to no origin: a variable, or a secret whose entry declares none. */
    public VaultEntry(char[] value, String versionIdentifier) {
      this(value, versionIdentifier, List.of());
    }
  }
}
