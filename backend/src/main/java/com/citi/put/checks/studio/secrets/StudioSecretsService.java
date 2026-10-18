package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/**
 * Saves and lists one test's Studio secrets, in Vault only (studio-vault-secrets FR-1, FR-3, FR-4).
 *
 * <p><b>Scope comes from the row.</b> The CSI, the environment and the test id of every Vault path
 * are read from the persisted {@code ui_tests} row, loaded through the same visibility-restricted
 * lookup save and delete use. Nothing in a request can name them.
 *
 * <p><b>Authorization first.</b> Listing needs {@code canRead} on the test's CSI; creating needs
 * {@code canWrite}. An absent test and a denied CSI are the same {@link
 * StudioAccessDeniedException}. The create body is parsed only <em>after</em> that decision, so an
 * unauthorized caller learns nothing about name validity or Vault state from a {@code 400}, {@code
 * 409} or {@code 503}.
 *
 * <p><b>The value.</b> It is parsed straight from the received bytes into a {@code char[]}, never
 * through a {@link String}, and both the body bytes and the value are zero-filled on every exit
 * path. No error message carries it and no parser message is echoed. The residual, stated rather
 * than implied (the same stance as {@code StudioReferenceResolver.Resolved}): Jackson's recycled
 * parse buffers and the servlet container's and HTTP client's transient buffers can still hold
 * bytes of it until they are reused. What is claimed is that nothing here retains a reference.
 *
 * <p>Not transactional on purpose: the only database touch is the row lookup, and no connection is
 * held across the Vault call.
 */
@Service
@Profile("!worker")
public class StudioSecretsService {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioSecretsService.class);

  /** Upper bound on a create body, checked after authorization. */
  static final int MAX_BODY_BYTES = 64 * 1024;

  /**
   * Upper bound on a value, in UTF-16 units. With the worst-case JSON escaping and the origin list,
   * a stored entry stays under the 64 KiB read cap it must later be read back through.
   */
  static final int MAX_VALUE_LENGTH = 4096;

  static final String INVALID_REQUEST = "INVALID_SECRET_REQUEST";
  static final String INVALID_NAME = "INVALID_SECRET_NAME";
  static final String INVALID_VALUE = "INVALID_SECRET_VALUE";
  static final String INVALID_ORIGINS = "INVALID_SECRET_ORIGINS";

  private final StudioRepository studioRepository;
  private final CsiOwnershipEvaluator csiOwnershipEvaluator;
  private final StudioVaultProvider vault;
  private final ObjectMapper strict;

  public StudioSecretsService(
      StudioRepository studioRepository,
      CsiOwnershipEvaluator csiOwnershipEvaluator,
      StudioVaultProvider vault,
      ObjectMapper platformMapper) {
    this.studioRepository = studioRepository;
    this.csiOwnershipEvaluator = csiOwnershipEvaluator;
    this.vault = vault;
    this.strict = strictCopyOf(platformMapper);
  }

  /**
   * The platform mapper, closed for this one boundary: unknown fields, trailing tokens, a single
   * string where a list is declared, and a number or boolean where text is declared are all
   * refused, and so is a duplicated key, so a body carrying two {@code value}s is not silently read
   * as one of them. The platform mapper itself is left unchanged.
   *
   * <p>A value Jackson has already materialized when a later token fails the parse is dropped with
   * the partial record and cannot be erased here; like the parser's own buffers, that copy is left
   * to the garbage collector.
   */
  static ObjectMapper strictCopyOf(ObjectMapper platformMapper) {
    ObjectMapper strict =
        platformMapper
            .copy()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .disable(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY);
    strict.getFactory().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION.mappedFeature());
    for (CoercionInputShape shape :
        List.of(CoercionInputShape.Integer, CoercionInputShape.Float, CoercionInputShape.Boolean)) {
      strict.coercionConfigFor(LogicalType.Textual).setCoercion(shape, CoercionAction.Fail);
    }
    return strict;
  }

  /** The names stored for a test the caller may read. Names only. */
  public StudioSecretListDto list(UUID testId, Authentication auth) {
    UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
    if (test.getCsiId() == null || !csiOwnershipEvaluator.canRead(auth, test.getCsiId())) {
      throw new StudioAccessDeniedException();
    }
    return new StudioSecretListDto(
        vault.listSecretNames(scopeOf(test)).stream().map(StudioSecretNameDto::new).toList());
  }

  /**
   * Stores a new secret for a test the caller may write, create-only.
   *
   * <p>In order: authorization ({@code 403}), then the body ({@code 400}), then Vault ({@code 409}
   * or {@code 503}). {@code body} is erased before this returns or throws.
   */
  public StudioSecretDto create(UUID testId, byte[] body, Authentication auth) {
    CreateStudioSecretRequest request = null;
    try {
      UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
      if (test.getCsiId() == null || !csiOwnershipEvaluator.canWrite(auth, test.getCsiId())) {
        throw new StudioAccessDeniedException();
      }

      request = parse(body);
      String name = validName(request.name());
      validateValue(request.value());
      List<String> origins = validOrigins(request.allowedOrigins());

      String version = vault.create(scopeOf(test), name, request.value(), origins);
      LOGGER.info("Studio secret created: test={} name={} version={}", testId, name, version);
      return new StudioSecretDto(name, version, origins);
    } finally {
      if (body != null) {
        Arrays.fill(body, (byte) 0);
      }
      if (request != null && request.value() != null) {
        Arrays.fill(request.value(), '\0');
      }
    }
  }

  private CreateStudioSecretRequest parse(byte[] body) {
    if (body == null || body.length == 0 || body.length > MAX_BODY_BYTES) {
      throw invalidRequest();
    }
    CreateStudioSecretRequest request;
    try {
      // Straight from the bytes: never `new String(body)`, which would be an unerasable copy.
      request = strict.readValue(body, CreateStudioSecretRequest.class);
    } catch (IOException e) {
      // The parser's message is not echoed: it can quote the input, and the input is a secret.
      throw invalidRequest();
    }
    if (request == null) {
      throw invalidRequest();
    }
    return request;
  }

  private static String validName(String name) {
    if (!StudioVaultProvider.isValidSecretName(name)) {
      throw new StudioValidationException(
          INVALID_NAME,
          "name must be 1 to 64 characters of A-Z, a-z, 0-9, '_', '.' or '-', and not '.' or '..'");
    }
    return name;
  }

  private static void validateValue(char[] value) {
    if (value == null || value.length == 0 || value.length > MAX_VALUE_LENGTH) {
      throw new StudioValidationException(
          INVALID_VALUE,
          "value is required and must be at most " + MAX_VALUE_LENGTH + " characters");
    }
  }

  /**
   * Each entry is normalized by {@link SecretOrigins}, the same normalizer the reader uses, and the
   * normalized list is what is stored. An entry that does not survive normalization one-for-one — a
   * malformed origin, a duplicate, or an entry smuggling a comma — refuses the whole list.
   */
  private static List<String> validOrigins(List<String> origins) {
    if (origins == null
        || origins.isEmpty()
        || origins.size() > SecretOrigins.MAX_ORIGINS
        || origins.stream()
            .anyMatch(
                origin -> origin == null || origin.length() > SecretOrigins.MAX_ORIGIN_LENGTH)) {
      throw invalidOrigins();
    }
    List<String> normalized = SecretOrigins.parse(String.join(",", origins));
    if (normalized.size() != origins.size()) {
      throw invalidOrigins();
    }
    return normalized;
  }

  private static VaultScope scopeOf(UITest test) {
    return VaultScope.of(test.getCsiId(), test.getEnvironment(), test.getId());
  }

  private static StudioValidationException invalidRequest() {
    return new StudioValidationException(
        INVALID_REQUEST,
        "The body must be a JSON object with exactly name, value and allowedOrigins");
  }

  private static StudioValidationException invalidOrigins() {
    return new StudioValidationException(
        INVALID_ORIGINS,
        "allowedOrigins must list 1 to "
            + SecretOrigins.MAX_ORIGINS
            + " distinct http(s) origins of at most "
            + SecretOrigins.MAX_ORIGIN_LENGTH
            + " characters, with no path, query or credentials");
  }
}
