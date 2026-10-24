package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The vault-backed resolver that replaces {@code StubStudioReferenceResolver} (AC-1, AC-4, AC-5a,
 * AC-7a).
 *
 * <p>History: the stub it replaced answered its two questions against the former global platform
 * {@code secrets} table (dropped by V25) and <b>never read its {@code csiId} parameter at all</b>,
 * so any CSI could name any secret; and it returned a configured canary string for every name, so
 * no real value had ever reached a runner. Both are gone. Vault is now the only secret store.
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
 *       {@code dev} is simply absent for a {@code prod} execution;
 *   <li>the test id scopes every read ({@link VaultScope}), so a secret saved for one test is
 *       absent for another test with the same CSI and environment.
 * </ul>
 *
 * <p>A declared secret id that is not a valid secret name ({@link
 * StudioVaultProvider#isValidSecretName}), such as a legacy {@code vault://…} id, is refused as an
 * unknown (acceptance) or unavailable (dispatch) reference <b>before</b> the provider is called.
 * Otherwise the provider's path-safety check would report it as a Vault outage.
 *
 * <p>Secret use is a decision of its own (§9.2): {@link StudioSecretUseAuthorization} is consulted
 * <b>separately</b> from {@code CsiOwnershipEvaluator}, per secret, and a principal who owns the
 * CSI can still be refused a secret it names. The principal dimension of the <em>real</em> vault's
 * policy is AC-5b and `ED-02`'s.
 *
 * <p><b>Secret preflight reads names only.</b> Authorization and the scoped name list prove the
 * declaration exists without reading its value. Legacy variable preflight erases every array it
 * reads, including on refusal.
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
      String csiId,
      String environment,
      UUID testId,
      String principal,
      ReferenceDeclarations declarations) {
    refuseCrossedNames(declarations, false);
    VaultScope scope = VaultScope.of(csiId, environment, testId);

    for (String name : declarations.variables()) {
      requireName(name);
      erase(
          vault
              .read(StudioVaultProvider.ReferenceKind.VARIABLE, scope, name)
              .orElseThrow(() -> new UnknownReferenceException(name)));
    }
    for (String secretId : declarations.secrets()) {
      requireName(secretId);
      if (!StudioVaultProvider.isValidSecretName(secretId)) {
        throw new UnknownReferenceException(secretId);
      }
      if (!secretUse.mayUse(principal, csiId, environment, secretId)) {
        // A name grants nothing (§9.2). The refusal names the reference and never the value.
        throw new SecretUseNotAuthorizedException(secretId);
      }
      if (!vault.listSecretNames(scope).contains(secretId)) {
        throw new UnknownReferenceException(secretId);
      }
    }
  }

  @Override
  public Resolved resolve(
      String csiId,
      String environment,
      UUID testId,
      String principal,
      ReferenceDeclarations declarations) {
    return resolve(
        csiId,
        environment,
        testId,
        principal,
        declarations,
        id -> {
          // Guided/legacy resolution does not record an observed replay read-entry.
        });
  }

  @Override
  public Resolved resolve(
      String csiId,
      String environment,
      UUID testId,
      String principal,
      ReferenceDeclarations declarations,
      ValueReadEntry entryObserver) {
    refuseCrossedNames(declarations, true);
    VaultScope scope = VaultScope.of(csiId, environment, testId);

    Map<String, char[]> variables = new LinkedHashMap<>();
    Map<String, char[]> secrets = new LinkedHashMap<>();
    Map<String, String> versions = new LinkedHashMap<>();
    Map<String, List<String>> origins = new LinkedHashMap<>();
    Map<String, Decision> decisions = new LinkedHashMap<>();
    String currentSecret = null;
    var entered = new java.util.LinkedHashSet<String>();
    try {
      for (String name : declarations.variables()) {
        StudioVaultProvider.VaultEntry entry =
            vault
                .read(StudioVaultProvider.ReferenceKind.VARIABLE, scope, name)
                .orElseThrow(() -> new ReferenceUnavailableException(name));
        variables.put(name, entry.value());
      }
      for (String secretId : declarations.secrets()) {
        currentSecret = secretId;
        if (!StudioVaultProvider.isValidSecretName(secretId)) {
          throw new ReferenceUnavailableException(secretId);
        }
        // The recheck §5.1.3 asks for: entitlement is re-evaluated at dispatch, not inherited from
        // the acceptance that happened before an unbounded queue wait.
        if (!secretUse.mayUse(principal, csiId, environment, secretId)) {
          throw new SecretUseRevokedException(secretId);
        }
        entryObserver.beforeRead(secretId);
        entered.add(secretId);
        StudioVaultProvider.VaultEntry entry =
            vault
                .read(StudioVaultProvider.ReferenceKind.SECRET, scope, secretId)
                .orElseThrow(() -> new ReferenceUnavailableException(secretId));
        if (entry.value() == null
            || entry.versionIdentifier() == null
            || entry.versionIdentifier().isBlank()
            || entry.versionIdentifier().length() > 256) {
          if (entry.value() != null) {
            Arrays.fill(entry.value(), '\0');
          }
          throw new ReferenceUnavailableException(secretId);
        }
        if (entry.value().length == 0) {
          Arrays.fill(entry.value(), '\0');
          throw new ReferenceUnavailableException(secretId);
        }
        if (entry.value().length > 4096) {
          Arrays.fill(entry.value(), '\0');
          throw new SecretTooLongException(secretId);
        }
        secrets.put(secretId, entry.value());
        versions.put(secretId, entry.versionIdentifier());
        origins.put(secretId, entry.allowedOrigins());
        decisions.put(secretId, new Decision(DecisionOutcome.RESOLVED, entry.versionIdentifier()));
        currentSecret = null;
      }
      // A revocation during a bounded Vault read is rechecked before any release/frame is built.
      for (String secretId : declarations.secrets()) {
        if (!secretUse.mayUse(principal, csiId, environment, secretId)) {
          decisions.put(secretId, new Decision(DecisionOutcome.REVOKED, versions.get(secretId)));
          throw new SecretUseRevokedException(secretId);
        }
      }
    } catch (RuntimeException e) {
      if (currentSecret != null
          && (entered.contains(currentSecret)
              || e instanceof SecretUseRevokedException
              || e instanceof ReferenceUnavailableException)) {
        DecisionOutcome outcome =
            e instanceof VaultProviderUnavailableException
                ? DecisionOutcome.VAULT_UNAVAILABLE
                : e instanceof SecretUseRevokedException
                    ? DecisionOutcome.REVOKED
                    : DecisionOutcome.UNAVAILABLE;
        decisions.put(currentSecret, new Decision(outcome, versions.get(currentSecret)));
      }
      var positivelyNotEntered = new java.util.LinkedHashSet<>(declarations.secrets());
      positivelyNotEntered.removeAll(entered);
      positivelyNotEntered.removeAll(decisions.keySet());
      StudioReferenceResolver.attachDecisionFacts(e, decisions, positivelyNotEntered);
      // Everything read so far is erased before the exception leaves, on every refusal path.
      variables.values().forEach(value -> Arrays.fill(value, '\0'));
      secrets.values().forEach(value -> Arrays.fill(value, '\0'));
      throw e;
    }
    return new Resolved(variables, secrets, versions, origins);
  }

  public static final class SecretTooLongException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public SecretTooLongException(String id) {
      super("Secret exceeds the value bound: " + id);
    }
  }

  /** Names-only authorization recheck; no Vault read or list call. */
  public boolean mayUse(String principal, String csi, String environment, String secretId) {
    return secretUse.mayUse(principal, csi, environment, secretId);
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
}
