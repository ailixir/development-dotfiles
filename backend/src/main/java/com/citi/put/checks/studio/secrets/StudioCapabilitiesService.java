package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.policy.ObservationPolicyRepository;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
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
 * the persisted row and the governed policy scopes. Nothing is chosen by default: exactly one
 * application must be named by a governed policy scope of this CSI and environment, permitted by
 * the administrator's translation scope, and trusted by the deployment's replay policies. Zero,
 * several or a malformed candidate is {@code RUNTIME_INCOMPATIBLE}. This read resolves no
 * reference, approves nothing, reserves no model call and writes no row; the real start revalidates
 * everything.
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
  private final ObservationPolicyRepository policies;
  private final GuidedTranslationProperties translation;
  private final ObservedReplayPins pins;
  private final GuidedSessionProperties guided;
  private final GuidedContracts contracts;

  public StudioCapabilitiesService(
      StudioRepository studioRepository,
      CsiOwnershipEvaluator ownership,
      StudioVaultProvider vault,
      ObservationPolicyRepository policies,
      GuidedTranslationProperties translation,
      ObservedReplayPins pins,
      GuidedSessionProperties guided,
      GuidedContracts contracts) {
    this.studioRepository = studioRepository;
    this.ownership = ownership;
    this.vault = vault;
    this.policies = policies;
    this.translation = translation;
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
    if (!guided.enabled() || !wellFormed(environment)) {
      return refusal(RUNTIME_INCOMPATIBLE);
    }
    List<String> candidates = new ArrayList<>();
    for (String application : policies.applicationIds(test.getCsiId(), environment)) {
      if (translation.permits(application, environment) && trusted(application, environment)) {
        candidates.add(application);
      }
    }
    if (candidates.size() != 1 || !wellFormed(candidates.get(0))) {
      return refusal(RUNTIME_INCOMPATIBLE);
    }
    ObjectNode available = contracts.object().put("available", true);
    ObjectNode context = available.putObject("context");
    context
        .put("schemaVersion", 3)
        .put("testId", test.getId().toString())
        .put("sourceRevision", Long.toString(test.getSourceRevision()))
        .put("configurationRevision", Long.toString(test.getConfigurationRevision()))
        .put("environmentId", environment)
        .put("applicationId", candidates.get(0));
    context.putObject("versions").put("contract", 3);
    return available;
  }

  /** The deployment's trusted replay policy for exactly this application and environment. */
  private boolean trusted(String application, String environment) {
    try {
      pins.policy(
          contracts.object().put("applicationId", application).put("environmentId", environment));
      return true;
    } catch (GuidedSessionException notTrusted) {
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
