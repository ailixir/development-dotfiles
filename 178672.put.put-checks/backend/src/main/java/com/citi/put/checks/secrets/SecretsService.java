package com.citi.put.checks.secrets;

import com.citi.put.checks.secrets.dto.CreateSecretRequest;
import com.citi.put.checks.secrets.dto.SecretDto;
import com.citi.put.checks.secrets.entity.Secret;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SecretsService {

  private final SecretsRepository secretsRepository;

  public SecretsService(SecretsRepository secretsRepository) {
    this.secretsRepository = secretsRepository;
  }

  public List<SecretDto> list() {
    return secretsRepository.findAll().stream().map(SecretDto::from).collect(Collectors.toList());
  }

  @Transactional
  public SecretDto create(CreateSecretRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);

    String referenceId = "sec_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    String lastFour = null;
    if (request.value() != null && request.value().length() >= 4) {
      lastFour = request.value().substring(request.value().length() - 4);
    }

    // TODO: Replace with real AES-GCM encryption. For M3, store as plain text bytes.
    byte[] encryptedValue =
        request.value() != null ? request.value().getBytes(StandardCharsets.UTF_8) : new byte[0];

    Secret secret =
        new Secret(
            referenceId,
            request.label(),
            request.scope() != null ? request.scope() : "project",
            identity.email(),
            lastFour,
            encryptedValue,
            request.expiresAt());
    secret = secretsRepository.save(secret);
    return SecretDto.from(secret);
  }

  public Map<String, Object> resolveSecret(String referenceId) {
    // Look up by reference_id pattern (sec_xxx)
    Secret secret =
        secretsRepository
            .findByReferenceId(referenceId)
            .orElseThrow(() -> new IllegalArgumentException("Secret not found: " + referenceId));
    // TODO: Implement real decryption with AES-GCM
    return Map.of("id", referenceId, "value", "REDACTED");
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
