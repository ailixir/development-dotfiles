package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The vault-backed resolver that replaces {@code StubStudioReferenceResolver} (AC-1, AC-4, AC-5a,
 * AC-7a).
 *
 * <p>The stub it replaces answered its two questions against the global platform {@code secrets}
 * table and <b>never read its {@code csiId} parameter at all</b>, so any CSI could name any secret;
 * and it returned a configured canary string for every name, so no real value had ever reached a
 * runner. Both are gone.
 *
 * <p>Three properties, all of them AC-5a's and all decidable on this branch without inventing an
 * entitlement model:
 *
 * <ul>
 *   <li>the resolvable set is the <b>confirmed revision's</b> typed declaration, handed in by the
 *       caller — never the draft's current {@code variables} and never the request;
 *   <li>the CSI is the <b>execution's own immutable</b> {@code csi_id}, so editing or moving the
 *       parent draft between acceptance and dispatch changes nothing;
 *   <li>the environment is the one snapshotted at acceptance, so a reference entitled only in
 *       {@code dev} is simply absent for a {@code prod} execution.
 * </ul>
 *
 * <p>Secret use is a decision of its own (§9.2): {@link StudioSecretUseAuthorization} is consulted
 * <b>separately</b> from {@code CsiOwnershipEvaluator}, per secret, and a principal who owns the
 * CSI can still be refused a secret it names. The principal dimension of the <em>real</em> vault's
 * policy is AC-5b and `ED-02`'s.
 *
 * <p><b>Preflight retains nothing.</b> It must prove a value exists without becoming a place a
 * value lives, so every array it reads is zeroed before the method returns — including on the
 * refusal path, which is the one an exception could otherwise skip.
 */
@Component
public class VaultStudioReferenceResolver implements StudioReferenceResolver {

  private final StudioVaultProvider vault;
  private final StudioSecretUseAuthorization secretUse;

  public VaultStudioReferenceResolver(
      StudioVaultProvider vault, StudioSecretUseAuthorization secretUse) {
    this.vault = vault;
    this.secretUse = secretUse;
  }

  @Override
  public void preflight(
      String csiId, String environment, String principal, ReferenceDeclarations declarations) {
    refuseCrossedNames(declarations, false);

    for (String name : declarations.variables()) {
      requireName(name);
      erase(
          vault
              .read(StudioVaultProvider.ReferenceKind.VARIABLE, csiId, environment, name)
              .orElseThrow(() -> new UnknownReferenceException(name)));
    }
    for (String secretId : declarations.secrets()) {
      requireName(secretId);
      if (!secretUse.mayUse(principal, csiId, environment, secretId)) {
        // A name grants nothing (§9.2). The refusal names the reference and never the value.
        throw new SecretUseNotAuthorizedException(secretId);
      }
      erase(
          vault
              .read(StudioVaultProvider.ReferenceKind.SECRET, csiId, environment, secretId)
              .orElseThrow(() -> new UnknownReferenceException(secretId)));
    }
  }

  @Override
  public Resolved resolve(
      String csiId, String environment, String principal, ReferenceDeclarations declarations) {
    refuseCrossedNames(declarations, true);

    Map<String, char[]> variables = new LinkedHashMap<>();
    Map<String, char[]> secrets = new LinkedHashMap<>();
    Map<String, String> versions = new LinkedHashMap<>();
    try {
      for (String name : declarations.variables()) {
        StudioVaultProvider.VaultEntry entry =
            vault
                .read(StudioVaultProvider.ReferenceKind.VARIABLE, csiId, environment, name)
                .orElseThrow(() -> new ReferenceUnavailableException(name));
        variables.put(name, entry.value());
      }
      for (String secretId : declarations.secrets()) {
        // The recheck §5.1.3 asks for: entitlement is re-evaluated at dispatch, not inherited from
        // the acceptance that happened before an unbounded queue wait.
        if (!secretUse.mayUse(principal, csiId, environment, secretId)) {
          throw new SecretUseRevokedException(secretId);
        }
        StudioVaultProvider.VaultEntry entry =
            vault
                .read(StudioVaultProvider.ReferenceKind.SECRET, csiId, environment, secretId)
                .orElseThrow(() -> new ReferenceUnavailableException(secretId));
        secrets.put(secretId, entry.value());
        versions.put(secretId, entry.versionIdentifier());
      }
    } catch (RuntimeException e) {
      // Everything read so far is erased before the exception leaves, on every refusal path.
      variables.values().forEach(value -> Arrays.fill(value, '\0'));
      secrets.values().forEach(value -> Arrays.fill(value, '\0'));
      throw e;
    }
    return new Resolved(variables, secrets, versions);
  }

  /**
   * A name declared as both a variable and a secret is a refusal wherever it is found (AC-3).
   *
   * <p>At dispatch it would produce a job whose two resolved maps disagree about what the name
   * means, which is the crossed-type case the runner refuses at the envelope. Refusing it here as
   * well means the condition never depends on the far side noticing.
   */
  private static void refuseCrossedNames(ReferenceDeclarations declarations, boolean atDispatch) {
    for (String crossed : declarations.crossedNames()) {
      if (atDispatch) {
        throw new ReferenceUnavailableException(crossed);
      }
      throw new UnknownReferenceException(crossed);
    }
  }

  private static void requireName(String name) {
    if (name == null || name.isBlank()) {
      throw new UnknownReferenceException("");
    }
  }

  private static void erase(StudioVaultProvider.VaultEntry entry) {
    Arrays.fill(entry.value(), '\0');
  }

  /** Visible so a test can assert which provider a running context actually selected (AC-9). */
  public Optional<String> providerName() {
    return Optional.ofNullable(vault.name());
  }
}
