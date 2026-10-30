package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The per-test runtime capabilities (STUDIO-OBS-008 P1, P6).
 *
 * <p><b>Authorization first.</b> {@code canRead} on the persisted row's CSI is decided before any
 * provider or policy lookup. An absent test and a denied CSI are the same {@link
 * StudioAccessDeniedException}, as on the secret routes. Capability {@code true} never grants write
 * or secret use: creating a secret still needs {@code canWrite}.
 *
 * <p><b>Configuration is not health.</b> {@code vaultSecrets} is "the configured provider is not
 * the disabled one", read from the injected provider's name. No Vault call is made, so a configured
 * but unreachable Vault still reports {@code true} and a later real call may answer 503.
 *
 * <p><b>The guided-start context</b> is the exact closed start body for this saved test, taken from
 * the persisted row. Guided start is available when the caller may execute in the test's CSI, the
 * test has at least one step and the deployment has a usable runtime catalog. Nothing else gates
 * it: which origins the test may open is decided from the test itself when learning starts. This
 * read resolves no reference, approves nothing, reserves no model call and writes no row; the real
 * start revalidates everything.
 */
@Service
@Profile("!worker")
public class StudioCapabilitiesService {

  static final String SCHEMA = "v3/public-ui-projections#/definitions/StudioCapabilities";
  static final String FORBIDDEN_SCOPE = "FORBIDDEN_SCOPE";
  static final String RUNTIME_INCOMPATIBLE = "RUNTIME_INCOMPATIBLE";
  private static final int MAX_ID_LENGTH = 256;

  private final StudioRepository studioRepository;
  private final CsiOwnershipEvaluator ownership;
  private final StudioVaultProvider vault;
  private final ObservedReplayPins pins;
  private final GuidedSessionProperties guided;
  private final GuidedContracts contracts;

  public StudioCapabilitiesService(
      StudioRepository studioRepository,
      CsiOwnershipEvaluator ownership,
      StudioVaultProvider vault,
      ObservedReplayPins pins,
      GuidedSessionProperties guided,
      GuidedContracts contracts) {
    this.studioRepository = studioRepository;
    this.ownership = ownership;
    this.vault = vault;
    this.pins = pins;
    this.guided = guided;
    this.contracts = contracts;
  }

  @Transactional(readOnly = true)
  public ObjectNode capabilities(UUID testId, Authentication auth) {
    UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
    if (test.getCsiId() == null || !ownership.canRead(auth, test.getCsiId())) {
      throw new StudioAccessDeniedException();
    }
    ObjectNode body = contracts.object();
    body.put("vaultSecrets", !DisabledStudioVaultProvider.NAME.equals(vault.name()));
    body.set("guidedStart", guidedStart(test, auth));
    contracts.validate(SCHEMA, body);
    return body;
  }

  private ObjectNode guidedStart(UITest test, Authentication auth) {
    if (!ownership.canExecute(auth, test.getCsiId())) {
      return refusal(FORBIDDEN_SCOPE);
    }
    String environment = test.getEnvironment();
    if (!guided.enabled() || !wellFormed(environment) || !hasStep(test) || !catalogUsable()) {
      return refusal(RUNTIME_INCOMPATIBLE);
    }
    ObjectNode available = contracts.object().put("available", true);
    ObjectNode context = available.putObject("context");
    context
        .put("schemaVersion", 3)
        .put("testId", test.getId().toString())
        .put("sourceRevision", Long.toString(test.getSourceRevision()))
        .put("configurationRevision", Long.toString(test.getConfigurationRevision()))
        .put("environmentId", environment);
    context.putObject("versions").put("contract", 3);
    return available;
  }

  private boolean hasStep(UITest test) {
    String raw = test.getAuthoring();
    if (raw == null) {
      return false;
    }
    try {
      JsonNode authoring = contracts.parse(raw);
      return authoring.path("steps").isArray() && !authoring.path("steps").isEmpty();
    } catch (GuidedSessionException unreadable) {
      return false;
    }
  }

  /** The deployment's runtime image and profile pin: the same catalog replay and learning use. */
  private boolean catalogUsable() {
    try {
      pins.selected();
      return true;
    } catch (GuidedSessionException unusable) {
      return false;
    }
  }

  private ObjectNode refusal(String code) {
    return contracts.object().put("available", false).put("code", code);
  }

  private static boolean wellFormed(String id) {
    return id != null && !id.isBlank() && id.length() <= MAX_ID_LENGTH;
  }
}
