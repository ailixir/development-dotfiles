package com.citi.put.checks.studio.compile.gateway;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.genai.Client;
import com.google.genai.types.ClientOptions;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;

/** Builds the Google Gen AI SDK client in Vertex AI mode. */
public final class VertexAiClientFactory {

  private VertexAiClientFactory() {}

  public static Client create(StudioGatewayProperties properties) throws IOException {
    return create(properties, credentials(properties));
  }

  static Client create(StudioGatewayProperties properties, GoogleCredentials credentials) {
    int timeoutMillis = Math.toIntExact(properties.requestTimeout().toMillis());
    OkHttpClient httpClient =
        new OkHttpClient.Builder()
            .connectTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .writeTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .callTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(false)
            .build();
    HttpOptions httpOptions =
        HttpOptions.builder()
            .baseUrl(normalizeEndpoint(properties.endpoint()))
            .apiVersion("v1")
            .timeout(timeoutMillis)
            .retryOptions(HttpRetryOptions.builder().attempts(1).httpStatusCodes(List.of()).build())
            .build();
    return Client.builder()
        .vertexAI(true)
        .project(properties.project())
        .location(properties.location())
        .credentials(credentials)
        .httpOptions(httpOptions)
        .clientOptions(ClientOptions.builder().customHttpClient(httpClient).build())
        .build();
  }

  private static GoogleCredentials credentials(StudioGatewayProperties properties)
      throws IOException {
    String mode =
        properties.credentials() == null
            ? StudioGatewayProperties.MODE_APPLICATION_DEFAULT
            : properties.credentials().mode().toLowerCase(Locale.ROOT);
    return switch (mode) {
      case StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE ->
          serviceAccountCredentials(properties.credentials().serviceAccountKeyFile());
      default -> GoogleCredentials.getApplicationDefault();
    };
  }

  private static GoogleCredentials serviceAccountCredentials(String keyFile) throws IOException {
    Path path = Path.of(keyFile);
    if (!Files.isReadable(path)) {
      throw new IllegalStateException(
          "studio.compile.gateway.credentials.service-account-key-file is not readable: " + path);
    }
    try (InputStream input = Files.newInputStream(path)) {
      return ServiceAccountCredentials.fromStream(input);
    }
  }

  private static String normalizeEndpoint(String endpoint) {
    URI uri = URI.create(endpoint.contains("://") ? endpoint : "https://" + endpoint);
    String normalized = uri.toString();
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }
}
