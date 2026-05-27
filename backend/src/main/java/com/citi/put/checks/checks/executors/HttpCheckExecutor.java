package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.HttpConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.nio.channels.ClosedChannelException;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

@Component
public class HttpCheckExecutor implements CheckExecutor {

  private static final Logger LOG = LoggerFactory.getLogger(HttpCheckExecutor.class);

  private final MeterRegistry meterRegistry;
  private final ConcurrentHashMap<ClientCacheKey, RestClient> clientCache =
      new ConcurrentHashMap<>();

  public HttpCheckExecutor(MeterRegistry meterRegistry) {
    this.meterRegistry = meterRegistry;
  }

  @Override
  public CheckType supportedType() {
    return CheckType.HTTP;
  }

  @Override
  public ExecutionOutcome execute(Check check, ExecutionContext context) {
    HttpConfiguration config = (HttpConfiguration) check.getConfiguration();
    long start = System.nanoTime();

    try {
      RestClient client = getOrCreateClient(config);

      var requestSpec =
          client
              .method(org.springframework.http.HttpMethod.valueOf(config.method()))
              .uri(config.url())
              .headers(
                  h -> {
                    if (config.headers() != null) {
                      config.headers().forEach(h::set);
                    }
                  });

      if (config.body() != null && !config.body().isBlank()) {
        requestSpec.body(config.body());
      }

      int actualStatus = requestSpec.exchange((req, resp) -> resp.getStatusCode().value());

      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      int expected = config.expectedStatusCode();

      recordMetrics(check, actualStatus == expected ? "SUCCESS" : "FAILURE", duration);

      if (actualStatus == expected) {
        LOG.debug("HTTP check {} → {} in {}ms", check.getId(), actualStatus, duration.toMillis());
        return new ExecutionOutcome.Success(
            duration, "HTTP " + actualStatus + " from " + config.method() + " " + config.url());
      } else {
        return new ExecutionOutcome.Failure(
            duration, "Expected status " + expected + " but got " + actualStatus, null);
      }
    } catch (ResourceAccessException e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, "FAILURE", duration);
      return mapTransportError(e, duration, config);
    } catch (Exception e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, "FAILURE", duration);
      return new ExecutionOutcome.Failure(
          duration, e.getClass().getSimpleName() + ": " + e.getMessage(), null);
    }
  }

  private RestClient getOrCreateClient(HttpConfiguration config) {
    ClientCacheKey key =
        new ClientCacheKey(
            config.timeoutMs(),
            Boolean.FALSE.equals(config.verifyTls()),
            Boolean.FALSE.equals(config.followRedirects()));
    return clientCache.computeIfAbsent(key, this::buildClient);
  }

  private RestClient buildClient(ClientCacheKey key) {
    HttpClient.Builder httpBuilder =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(key.timeoutMs()))
            .followRedirects(
                key.disableRedirects() ? HttpClient.Redirect.NEVER : HttpClient.Redirect.NORMAL);

    if (key.disableTls()) {
      LOG.warn("TLS verification disabled for HTTP check — audit trail");
      httpBuilder.sslContext(createTrustAllSslContext());
    }

    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpBuilder.build());
    factory.setReadTimeout(Duration.ofMillis(key.timeoutMs()));

    return RestClient.builder().requestFactory(factory).build();
  }

  private static SSLContext createTrustAllSslContext() {
    try {
      TrustManager[] trustAll = {
        new X509TrustManager() {
          @Override
          public void checkClientTrusted(X509Certificate[] chain, String authType) {}

          @Override
          public void checkServerTrusted(X509Certificate[] chain, String authType) {}

          @Override
          public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
          }
        }
      };
      SSLContext ctx = SSLContext.getInstance("TLS");
      ctx.init(null, trustAll, new SecureRandom());
      return ctx;
    } catch (NoSuchAlgorithmException | KeyManagementException e) {
      throw new IllegalStateException("Failed to create trust-all SSLContext", e);
    }
  }

  private ExecutionOutcome mapTransportError(
      ResourceAccessException e, Duration duration, HttpConfiguration config) {
    Throwable cause = e.getMostSpecificCause();

    if (cause instanceof java.net.SocketTimeoutException) {
      return new ExecutionOutcome.Timeout(duration);
    }
    if (cause instanceof ConnectException || cause instanceof ClosedChannelException) {
      return new ExecutionOutcome.Failure(duration, "Connection refused: " + config.url(), null);
    }
    if (cause instanceof UnknownHostException) {
      return new ExecutionOutcome.Failure(
          duration, "DNS resolution failed: " + cause.getMessage(), null);
    }
    if (cause instanceof SSLException) {
      return new ExecutionOutcome.Failure(duration, "TLS error: " + cause.getMessage(), null);
    }
    return new ExecutionOutcome.Failure(
        duration,
        "Transport error: " + cause.getClass().getSimpleName() + ": " + cause.getMessage(),
        null);
  }

  private void recordMetrics(Check check, String status, Duration duration) {
    Timer.builder("checks.execution.duration")
        .tag("check_type", "HTTP")
        .tag("status", status)
        .register(meterRegistry)
        .record(duration);
    Counter.builder("checks.execution.total")
        .tag("check_type", "HTTP")
        .tag("status", status)
        .register(meterRegistry)
        .increment();
  }

  private record ClientCacheKey(int timeoutMs, boolean disableTls, boolean disableRedirects) {}
}
