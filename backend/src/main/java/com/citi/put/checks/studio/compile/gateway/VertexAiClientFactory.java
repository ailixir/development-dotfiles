package com.citi.put.checks.studio.compile.gateway;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.genai.Client;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** Creates the current Google Gen AI SDK client in Vertex AI mode. */
public final class VertexAiClientFactory {

  private VertexAiClientFactory() {}

  public static Client create(StudioGatewayProperties properties) throws IOException {
    properties.validateForEnabled();
    Client.Builder builder = Client.builder().httpOptions(httpOptions(properties));
    String mode = properties.credentials().mode().toLowerCase(Locale.ROOT);
    switch (mode) {
      case StudioGatewayProperties.MODE_API_KEY ->
          builder.apiKey(properties.credentials().apiKey());
      case StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE ->
          builder
              .vertexAI(true)
              .project(properties.project())
              .location(properties.location())
              .credentials(
                  serviceAccountCredentials(properties.credentials().serviceAccountKeyFile()));
      case StudioGatewayProperties.MODE_APPLICATION_DEFAULT ->
          builder
              .vertexAI(true)
              .project(properties.project())
              .location(properties.location())
              .credentials(GoogleCredentials.getApplicationDefault());
      case StudioGatewayProperties.MODE_NONE -> builder.apiKey("local-stub-key");
      default -> throw new IllegalStateException("Unsupported gateway credential mode: " + mode);
    }
    return builder.build();
  }

  private static HttpOptions httpOptions(StudioGatewayProperties properties) {
    HttpOptions.Builder options =
        HttpOptions.builder()
            .apiVersion("v1")
            .timeout(Math.toIntExact(properties.requestTimeout().toMillis()))
            .retryOptions(HttpRetryOptions.builder().attempts(1).build());
    if (properties.endpoint() != null && !properties.endpoint().isBlank()) {
      String endpoint =
          properties.endpoint().contains("://")
              ? properties.endpoint()
              : "https://" + properties.endpoint();
      options.baseUrl(endpoint);
    }
    return options.build();
  }

  private static GoogleCredentials serviceAccountCredentials(String keyFile) throws IOException {
    Path path = Path.of(keyFile);
    if (!Files.isReadable(path)) {
      throw new IllegalStateException(
          "studio.compile.gateway.credentials.service-account-key-file is not readable: " + path);
    }
    try (InputStream in = Files.newInputStream(path)) {
      return ServiceAccountCredentials.fromStream(in);
    }
  }
}
