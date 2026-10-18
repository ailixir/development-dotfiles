package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class SecretValueTest {
  @Test
  void onlyExplicitWriterReleasesCharsAndErasesOnSuccess() throws Exception {
    char[] chars = "SECRET-CANARY".toCharArray();
    var secret = new SecretValue(chars);
    assertThat(secret.toString()).isEqualTo("<secret>");
    assertThat(secret.matches("SECRET-CANARY")).isTrue();
    assertThatThrownBy(() -> new ObjectMapper().writeValueAsBytes(secret))
        .hasMessageContaining("No serializer");
    byte[] bytes = SecretWireWriter.bytes(new ObjectMapper(), java.util.Map.of("secret", secret));
    assertThat(new String(bytes, java.nio.charset.StandardCharsets.UTF_8))
        .isEqualTo("{\"secret\":\"SECRET-CANARY\"}");
    assertThat(chars).containsOnly('\0');
    assertThat(secret.matches("SECRET-CANARY")).isFalse();
    Arrays.fill(bytes, (byte) 0);
    assertThatThrownBy(() -> SecretWireWriter.bytes(new ObjectMapper(), secret))
        .hasMessageContaining("already erased");
  }

  @Test
  void explicitWriterErasesAfterAThrowingGenerator() throws Exception {
    char[] chars = "SECRET-CANARY".toCharArray();
    var secret = new SecretValue(chars);
    var generator = org.mockito.Mockito.mock(com.fasterxml.jackson.core.JsonGenerator.class);
    org.mockito.Mockito.doThrow(new java.io.IOException("controlled-write-failure"))
        .when(generator)
        .writeString(chars, 0, chars.length);
    assertThatThrownBy(() -> new SecretValue.Writer().serialize(secret, generator, null))
        .hasMessage("controlled-write-failure");
    assertThat(chars).containsOnly('\0');
  }

  @Test
  void closeAndValueFreeJacksonShapeSurviveUnusedExit() throws Exception {
    char[] chars = "CANARY-UNUSED".toCharArray();
    try (var secret = new SecretValue(chars)) {
      assertThat(
              new ObjectMapper()
                  .getSerializationConfig()
                  .introspect(new ObjectMapper().constructType(SecretValue.class))
                  .findProperties())
          .isEmpty();
    }
    assertThat(chars).containsOnly('\0');
  }
}
