package com.citi.put.checks.config.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SecretMaskerTest {

  @Test
  void masksPasswordJsonField() {
    String input = "payload: {\"user\":\"alice\",\"password\":\"s3cret!\"}";
    String output = SecretMasker.mask(input);
    assertThat(output).doesNotContain("s3cret!");
    assertThat(output).contains("\"password\":\"***\"");
  }

  @Test
  void masksApiKeyJsonField() {
    String input = "config: {\"api_key\":\"AKIA1234567890\"}";
    String output = SecretMasker.mask(input);
    assertThat(output).doesNotContain("AKIA1234567890");
  }

  @Test
  void masksAuthorizationHeader() {
    String input = "headers: {\"Authorization\":\"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\"}";
    String output = SecretMasker.mask(input);
    assertThat(output).doesNotContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  }

  @Test
  void masksEmailLocalPart() {
    String input = "user alice.smith@citigroup.com just logged in";
    String output = SecretMasker.mask(input);
    assertThat(output).doesNotContain("alice.smith@citigroup.com");
    assertThat(output).contains("***@citigroup.com");
  }

  @Test
  void nullInputReturnsNull() {
    assertThat(SecretMasker.mask(null)).isNull();
  }

  @Test
  void plainMessageUnchanged() {
    String input = "nothing to mask here";
    assertThat(SecretMasker.mask(input)).isEqualTo(input);
  }
}
