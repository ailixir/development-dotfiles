package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.SecretEnvelope;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.secrets.SecretValue;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.SSLContext;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 / E5 row 27: a step dispatch carries 1 to 8 secrets. The local refusals happen before
 * any send and every value is erased; the wire content is covered by {@code
 * GuidedSecretByteBodyTest}.
 */
class HttpRunnerSecretsPayloadTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static HttpRunnerDispatchClient client() throws Exception {
    return new HttpRunnerDispatchClient(
        URI.create("https://localhost:1"), SSLContext.getDefault(), () -> "token", C);
  }

  private static SecretEnvelope secret(String id, char[] value) {
    return new SecretEnvelope(
        C.object().put("secretId", id).put("versionId", "v1"), new SecretValue(value));
  }

  private static JsonNode body() {
    return C.object().put("sessionId", "session");
  }

  private static void refusedLocally(List<SecretEnvelope> secrets, List<char[]> buffers)
      throws Exception {
    assertThatThrownBy(() -> client().sendSecrets(body(), secrets, null))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(failure.status()).isEqualTo(422);
            });
    for (char[] buffer : buffers) {
      for (char c : buffer) {
        assertThat(c).as("erased on a local refusal").isEqualTo('\0');
      }
    }
  }

  @Test
  void noSecretIsRefusedBeforeAnySend() throws Exception {
    refusedLocally(List.of(), List.of());
    assertThatThrownBy(() -> client().sendSecrets(body(), null, null))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void moreThanEightSecretsAreRefusedAndEveryValueIsErased() throws Exception {
    var secrets = new ArrayList<SecretEnvelope>();
    var buffers = new ArrayList<char[]>();
    for (int i = 0; i < 9; i++) {
      char[] value = ("value-" + i).toCharArray();
      buffers.add(value);
      secrets.add(secret("S" + i, value));
    }
    refusedLocally(secrets, buffers);
  }

  @Test
  void duplicateSecretIdsAreRefusedAndEveryValueIsErased() throws Exception {
    char[] one = "one".toCharArray(), two = "two".toCharArray();
    refusedLocally(List.of(secret("PASS", one), secret("PASS", two)), List.of(one, two));
  }

  @Test
  void anEmptyOrOverlongValueIsRefusedAndErased() throws Exception {
    char[] empty = new char[0], longValue = "x".repeat(4097).toCharArray();
    refusedLocally(List.of(secret("A", empty)), List.of(empty));
    refusedLocally(List.of(secret("B", longValue)), List.of(longValue));
  }
}
