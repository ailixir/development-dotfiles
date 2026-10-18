package com.citi.put.checks.studio.gateway;

import com.google.auth.http.HttpTransportFactory;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.ComputeEngineCredentials;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.auth.oauth2.UserCredentials;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Cached tokens with bounded, cancellable refresh; no credential refresh worker or SDK refresh. */
final class BoundedCredentialProvider implements AutoCloseable {
  private final ThreadLocal<CredentialBudget> active = new ThreadLocal<>();
  private final BudgetedAuthTransport transport = new BudgetedAuthTransport(active::get);
  private final Semaphore refresh = new Semaphore(1);
  private final GoogleCredentials source;
  private volatile AccessToken cached;

  BoundedCredentialProvider(StudioGatewayProperties properties) throws IOException {
    HttpTransportFactory factory = () -> transport;
    active.set(new CredentialBudget(Duration.ofSeconds(15)));
    try {
      GoogleCredentials discovered;
      if (StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE.equalsIgnoreCase(
          properties.credentials().mode())) {
        try (InputStream in =
            Files.newInputStream(Path.of(properties.credentials().serviceAccountKeyFile()))) {
          discovered = ServiceAccountCredentials.fromStream(in, factory);
        }
      } else {
        discovered = GoogleCredentials.getApplicationDefault(factory);
      }
      source = bind(discovered, factory);
    } catch (IOException | RuntimeException failure) {
      transport.shutdown();
      throw failure;
    } finally {
      active.remove();
    }
  }

  /** Test seam exercises the same concrete Google token refresh and low-level transport. */
  BoundedCredentialProvider(GoogleCredentials credentials) {
    source = bind(credentials, () -> transport);
  }

  private static GoogleCredentials bind(
      GoogleCredentials credentials, HttpTransportFactory factory) {
    if (credentials instanceof ServiceAccountCredentials account) {
      return account.toBuilder()
          .setHttpTransportFactory(factory)
          .build()
          .createScoped("https://www.googleapis.com/auth/cloud-platform")
          .createWithCustomRetryStrategy(false);
    }
    if (credentials instanceof UserCredentials user) {
      return user.toBuilder().setHttpTransportFactory(factory).build();
    }
    if (credentials instanceof ComputeEngineCredentials compute) {
      return compute.toBuilder().setHttpTransportFactory(factory).build();
    }
    throw new IllegalStateException(
        "Studio requires bounded service-account, user or compute ADC credentials; unsupported"
            + " credential provider");
  }

  String quotaProjectId() {
    return source.getQuotaProjectId();
  }

  String token(CredentialBudget budget) throws IOException, InterruptedException {
    budget.remaining();
    AccessToken token = cached;
    if (fresh(token)) {
      return token.getTokenValue();
    }
    while (!refresh.tryAcquire(
        Math.max(1, Math.min(50, budget.remaining().toMillis())), TimeUnit.MILLISECONDS)) {
      budget.remaining();
    }
    try {
      budget.remaining();
      token = cached;
      if (!fresh(token)) {
        active.set(budget);
        // Direct synchronous refresh avoids OAuth2Credentials' shared asynchronous refresh task.
        token = source.refreshAccessToken();
        budget.remaining();
        if (!fresh(token)) {
          throw new IOException("credential provider returned an unusable token");
        }
        cached = token;
      }
      return token.getTokenValue();
    } finally {
      active.remove();
      refresh.release();
    }
  }

  private static boolean fresh(AccessToken token) {
    return token != null
        && token.getTokenValue() != null
        && !token.getTokenValue().isBlank()
        && token.getExpirationTime() != null
        && token.getExpirationTime().getTime() - System.currentTimeMillis() > 60000;
  }

  @Override
  public void close() {
    transport.shutdown();
  }
}
