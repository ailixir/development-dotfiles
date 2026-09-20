package com.citi.put.checks.studio.storage;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.head;
import static com.github.tomakehurst.wiremock.client.WireMock.matching;
import static com.github.tomakehurst.wiremock.client.WireMock.ok;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.evidence.VideoObjectStoreUnavailableException;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

class S3StorageTest {
  @TempDir Path credentials;

  @Test
  void s3DoesNotChangeSpringsHttpClientSelection() {
    assertThat(
            org.springframework.util.ClassUtils.isPresent(
                "org.apache.hc.client5.http.classic.HttpClient", getClass().getClassLoader()))
        .isFalse();
  }

  @Test
  void signsRequestsReadsOnlyRequestedRangeAndDistinguishes404From403() throws Exception {
    Files.writeString(credentials.resolve("accessKeyId"), "test-access");
    Files.writeString(credentials.resolve("secretAccessKey"), "test-secret");
    var server = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    server.start();
    try (var client =
        S3Client.builder()
            .region(Region.US_EAST_1)
            .endpointOverride(URI.create(server.baseUrl()))
            .forcePathStyle(true)
            .credentialsProvider(new MountedAwsCredentials(credentials))
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .build()) {
      var store = new S3VideoObjectStore(client, "evidence");
      server.stubFor(
          head(urlEqualTo("/evidence/studio/video"))
              .willReturn(ok().withHeader("Content-Length", "5")));
      server.stubFor(
          get(urlEqualTo("/evidence/studio/video"))
              .withHeader("Range", equalTo("bytes=1-3"))
              .willReturn(aResponse().withStatus(206).withBody(new byte[] {20, 30, 40})));
      assertThat(store.metadata("studio/video").orElseThrow().sizeBytes()).isEqualTo(5);
      assertThat(store.read("studio/video", 1, 3)).containsExactly(20, 30, 40);
      server.verify(
          getRequestedFor(urlEqualTo("/evidence/studio/video"))
              .withHeader("Authorization", matching("AWS4-HMAC-SHA256 .*")));
      server.stubFor(
          head(urlEqualTo("/evidence/studio/missing")).willReturn(aResponse().withStatus(404)));
      assertThat(store.metadata("studio/missing")).isEmpty();
      server.stubFor(
          head(urlEqualTo("/evidence/studio/denied")).willReturn(aResponse().withStatus(403)));
      assertThatThrownBy(() -> store.metadata("studio/denied"))
          .isInstanceOf(VideoObjectStoreUnavailableException.class);
      assertThat(server.getAllServeEvents())
          .allMatch(
              event ->
                  java.util.Set.of("HEAD", "GET")
                      .contains(event.getRequest().getMethod().getName()));
    } finally {
      server.stop();
    }
  }

  @Test
  void mountedCredentialsSupportRotationAndSessionTokens() throws Exception {
    Files.writeString(credentials.resolve("accessKeyId"), "first");
    Files.writeString(credentials.resolve("secretAccessKey"), "secret");
    var provider = new MountedAwsCredentials(credentials);
    assertThat(provider.resolveCredentials().accessKeyId()).isEqualTo("first");
    Files.writeString(credentials.resolve("accessKeyId"), "second");
    Files.writeString(credentials.resolve("sessionToken"), "session");
    var resolved = (AwsSessionCredentials) provider.resolveCredentials();
    assertThat(resolved.accessKeyId()).isEqualTo("second");
    assertThat(resolved.sessionToken()).isEqualTo("session");
    Files.delete(credentials.resolve("secretAccessKey"));
    assertThatThrownBy(provider::resolveCredentials)
        .hasMessage("Studio S3 credentials could not be read");
  }
}
