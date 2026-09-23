package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.recovery.S3ResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

class S3EvidenceStoresTest {

  private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
  private HttpServer server;
  private S3Client client;

  @BeforeEach
  void start() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/", this::handle);
    server.start();
    client =
        S3Client.builder()
            .endpointOverride(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
            .region(Region.US_EAST_1)
            .credentialsProvider(
                StaticCredentialsProvider.create(AwsBasicCredentials.create("reader", "secret")))
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .build();
  }

  @AfterEach
  void stop() {
    if (client != null) {
      client.close();
    }
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void performsBoundedSizeProbeAndInclusiveRangeGetWithoutListing() {
    objects.put("/evidence/studio/video.webm", new byte[] {0, 1, 2, 3, 4, 5});
    S3VideoObjectStore store = new S3VideoObjectStore(client, "evidence");

    assertThat(store.metadata("studio/video.webm").orElseThrow().sizeBytes()).isEqualTo(6);
    assertThat(store.read("studio/video.webm", 2, 4)).containsExactly(2, 3, 4);
    assertThat(store.metadata("studio/missing.webm")).isEmpty();
    assertThatThrownBy(() -> store.metadata("studio/bucket-error.webm"))
        .isInstanceOf(VideoObjectStoreUnavailableException.class);
  }

  @Test
  void readsAndBoundsTheTerminalManifest() {
    objects.put(
        "/evidence/studio/result.json",
        "{\"schemaVersion\":1,\"executionId\":\"e\",\"attemptId\":\"a\",\"outcome\":\"PASSED\"}"
            .getBytes(StandardCharsets.UTF_8));
    S3ResultManifestStore store =
        new S3ResultManifestStore(client, "evidence", 1024, new ObjectMapper());

    assertThat(store.read("studio/result.json")).isPresent();
    assertThat(store.isAvailable()).isTrue();
    assertThat(store.read("studio/missing.json")).isEmpty();
  }

  private void handle(HttpExchange exchange) throws IOException {
    byte[] object = objects.get(exchange.getRequestURI().getPath());
    if (object == null) {
      String code =
          exchange.getRequestURI().getPath().endsWith("bucket-error.webm")
              ? "NoSuchBucket"
              : "NoSuchKey";
      byte[] error =
          ("<Error><Code>" + code + "</Code><Message>missing</Message></Error>")
              .getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Content-Type", "application/xml");
      exchange.sendResponseHeaders(404, error.length);
      exchange.getResponseBody().write(error);
      exchange.close();
      return;
    }
    if ("HEAD".equals(exchange.getRequestMethod())) {
      exchange.getResponseHeaders().add("Content-Length", Integer.toString(object.length));
      exchange.sendResponseHeaders(200, -1);
      exchange.close();
      return;
    }
    String range = exchange.getRequestHeaders().getFirst("Range");
    byte[] response = object;
    int status = 200;
    if (range != null) {
      String[] bounds = range.substring("bytes=".length()).split("-", 2);
      int first = Integer.parseInt(bounds[0]);
      int last = Math.min(Integer.parseInt(bounds[1]), object.length - 1);
      response = java.util.Arrays.copyOfRange(object, first, last + 1);
      status = 206;
      exchange
          .getResponseHeaders()
          .add("Content-Range", "bytes " + first + "-" + last + "/" + object.length);
    }
    exchange.sendResponseHeaders(status, response.length);
    exchange.getResponseBody().write(response);
    exchange.close();
  }
}
