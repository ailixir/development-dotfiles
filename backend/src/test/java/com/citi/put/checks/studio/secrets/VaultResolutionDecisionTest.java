package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Counted provider ownership/failure proof, separate from real HTTP/Vault and browser joins. */
class VaultResolutionDecisionTest {
  private final UUID testId = UUID.randomUUID();
  private final VaultScope scope = VaultScope.of("CSI", "Development", testId);
  private final String canary = "PARTIAL-SECRET-" + UUID.randomUUID();
  private final ReferenceDeclarations names =
      new ReferenceDeclarations(List.of(), List.of("FIRST", "SECOND", "UNREACHED"));

  private final class Provider implements StudioVaultProvider {
    final FakeStudioVaultProvider fake = new FakeStudioVaultProvider(Map.of());
    final List<String> reads = new ArrayList<>();
    final List<char[]> delivered = new ArrayList<>();
    boolean outage;
    boolean longValue;

    Provider() {
      for (String id : names.secrets()) {
        fake.rotate(ReferenceKind.SECRET, scope, id, canary);
      }
    }

    public String name() {
      return "counted-decisions";
    }

    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope actual, String id) {
      reads.add(id);
      assertThat(actual).isEqualTo(scope);
      if (id.equals("SECOND") && outage) {
        throw new VaultProviderUnavailableException("controlled outage");
      }
      var result = fake.read(kind, actual, id);
      if (id.equals("SECOND") && longValue) {
        result.ifPresent(entry -> java.util.Arrays.fill(entry.value(), '\0'));
        result = Optional.of(new VaultEntry("L".repeat(4097).toCharArray(), "opaque-version-long"));
      }
      result.ifPresent(entry -> delivered.add(entry.value()));
      return result;
    }

    public String create(VaultScope actual, String id, char[] value, List<String> origins) {
      return fake.create(actual, id, value, origins);
    }

    public List<String> listSecretNames(VaultScope actual) {
      return fake.listSecretNames(actual);
    }
  }

  private Map<String, StudioReferenceResolver.Decision> facts(Throwable failure) {
    var facts = StudioReferenceResolver.decisionFacts(failure);
    assertThat(facts.toString()).doesNotContain(canary);
    for (Throwable suppressed : failure.getSuppressed()) {
      assertThat(suppressed.toString()).doesNotContain(canary);
    }
    return facts;
  }

  @Test
  void partialOutageRetainsOnlyActualSafeDecisionsAndErasesPreviouslyReadArray() {
    var provider = new Provider();
    provider.outage = true;
    var resolver =
        new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
    Throwable failure =
        catchThrowable(() -> resolver.resolve("CSI", "Development", testId, "owner", names));
    assertThat(failure).isInstanceOf(VaultProviderUnavailableException.class);
    var facts = facts(failure);
    assertThat(facts.keySet()).containsExactlyInAnyOrder("FIRST", "SECOND");
    assertThat(facts.get("FIRST").outcome())
        .isEqualTo(StudioReferenceResolver.DecisionOutcome.RESOLVED);
    assertThat(facts.get("FIRST").version()).isNotBlank();
    assertThat(facts.get("SECOND").outcome())
        .isEqualTo(StudioReferenceResolver.DecisionOutcome.VAULT_UNAVAILABLE);
    assertThat(StudioReferenceResolver.positivelyNotEntered(failure)).containsExactly("UNREACHED");
    assertThat(facts.get("SECOND").version()).isNull();
    assertThat(provider.reads).containsExactly("FIRST", "SECOND");
    assertThat(provider.delivered).hasSize(1);
    assertThat(provider.delivered.getFirst()).containsOnly('\0');
  }

  @Test
  void deniedSecondReferenceNeverReadsItOrTheRemainingReference() {
    var provider = new Provider();
    var resolver =
        new VaultStudioReferenceResolver(
            provider, (principal, csi, environment, id) -> !id.equals("SECOND"));
    Throwable failure =
        catchThrowable(() -> resolver.resolve("CSI", "Development", testId, "owner", names));
    assertThat(failure).isInstanceOf(StudioReferenceResolver.SecretUseRevokedException.class);
    var facts = facts(failure);
    assertThat(facts.keySet()).containsExactlyInAnyOrder("FIRST", "SECOND");
    assertThat(facts.get("SECOND").outcome())
        .isEqualTo(StudioReferenceResolver.DecisionOutcome.REVOKED);
    assertThat(StudioReferenceResolver.positivelyNotEntered(failure)).containsExactly("UNREACHED");
    assertThat(provider.reads).containsExactly("FIRST");
    assertThat(provider.delivered.getFirst()).containsOnly('\0');
  }

  @Test
  void oversizedSecondValueErasesBothArraysWithoutAReadForUnreachedReference() {
    var provider = new Provider();
    provider.longValue = true;
    var resolver =
        new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
    Throwable failure =
        catchThrowable(() -> resolver.resolve("CSI", "Development", testId, "owner", names));
    assertThat(failure).isInstanceOf(VaultStudioReferenceResolver.SecretTooLongException.class);
    var facts = facts(failure);
    assertThat(facts.keySet()).containsExactlyInAnyOrder("FIRST", "SECOND");
    assertThat(facts.get("SECOND").outcome())
        .isEqualTo(StudioReferenceResolver.DecisionOutcome.UNAVAILABLE);
    assertThat(StudioReferenceResolver.positivelyNotEntered(failure)).containsExactly("UNREACHED");
    assertThat(provider.reads).containsExactly("FIRST", "SECOND");
    assertThat(provider.delivered).hasSize(2);
    provider.delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
  }

  @Test
  void revocationAfterActualReadKeepsSafeVersionAndErasesAllDeliveredArrays() {
    var provider = new Provider();
    var checks = new java.util.concurrent.atomic.AtomicInteger();
    var resolver =
        new VaultStudioReferenceResolver(
            provider, (principal, csi, environment, id) -> checks.incrementAndGet() <= 3);
    Throwable failure =
        catchThrowable(() -> resolver.resolve("CSI", "Development", testId, "owner", names));
    assertThat(failure).isInstanceOf(StudioReferenceResolver.SecretUseRevokedException.class);
    var facts = facts(failure);
    assertThat(facts.keySet()).containsExactlyInAnyOrder("FIRST", "SECOND", "UNREACHED");
    assertThat(facts.get("FIRST").outcome())
        .isEqualTo(StudioReferenceResolver.DecisionOutcome.REVOKED);
    assertThat(StudioReferenceResolver.positivelyNotEntered(failure)).isEmpty();
    assertThat(facts.get("FIRST").version()).isNotBlank();
    assertThat(provider.reads).containsExactly("FIRST", "SECOND", "UNREACHED");
    provider.delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
  }

  @Test
  void durableEntryCallbackRunsBeforeActualReadAndItsFailureDoesNotInventResolution() {
    var provider = new Provider();
    var resolver =
        new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
    var markers = new ArrayList<String>();
    Throwable failure =
        catchThrowable(
            () ->
                resolver.resolve(
                    "CSI",
                    "Development",
                    testId,
                    "owner",
                    names,
                    id -> {
                      assertThat(provider.reads).hasSize(markers.size());
                      if (id.equals("SECOND")) {
                        throw new IllegalStateException("controlled marker refusal");
                      }
                      markers.add(id);
                    }));
    assertThat(failure)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("controlled marker refusal");
    assertThat(markers).containsExactly("FIRST");
    assertThat(provider.reads).containsExactly("FIRST");
    assertThat(facts(failure)).containsOnlyKeys("FIRST");
    assertThat(StudioReferenceResolver.positivelyNotEntered(failure))
        .containsExactlyInAnyOrder("SECOND", "UNREACHED");
    provider.delivered.forEach(chars -> assertThat(chars).containsOnly('\0'));
  }
}
