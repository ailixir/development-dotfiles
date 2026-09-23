package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The normalization must produce exactly what a browser's {@code URL.origin} renders, because the
 * runner compares with string equality; and a list with any bad entry binds the secret to nothing.
 */
class SecretOriginsTest {

  @Test
  void normalizesToTheBrowsersOriginForm() {
    assertThat(
            SecretOrigins.parse(
                "HTTPS://Login.App.Example:443, http://app.example:80,"
                    + "https://sso.app.example:8443/,http://127.0.0.1:8080,https://[::1]:9443"))
        .containsExactly(
            "https://login.app.example",
            "http://app.example",
            "https://sso.app.example:8443",
            "http://127.0.0.1:8080",
            "https://[::1]:9443");
  }

  @Test
  void deduplicatesAfterNormalizing() {
    assertThat(SecretOrigins.parse("https://a.example,https://A.example:443"))
        .containsExactly("https://a.example");
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"   "})
  void anAbsentListIsNoOrigin(String raw) {
    assertThat(SecretOrigins.parse(raw)).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "https://login.app.example/signin",
        "https://login.app.example?x=1",
        "https://login.app.example#top",
        "https://user:pw@login.app.example",
        "ftp://login.app.example",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "data:text/html,x",
        "login.app.example",
        "https://",
        "https://login.app.example:0",
        "https://login.app.example:70000",
        "https://login.app.example,",
        "https://login.app.example,,https://b.example",
        "https://ok.example,not a url"
      })
  void anyMalformedEntryBindsToNoOriginAtAll(String raw) {
    assertThat(SecretOrigins.parse(raw)).isEmpty();
  }

  @Test
  void anOverLongListBindsToNoOrigin() {
    String seventeen =
        IntStream.range(0, SecretOrigins.MAX_ORIGINS + 1)
            .mapToObj(index -> "https://h" + index + ".example")
            .collect(Collectors.joining(","));
    assertThat(SecretOrigins.parse(seventeen)).isEmpty();
  }
}
