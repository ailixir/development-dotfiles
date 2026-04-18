package com.citi.put.checks.checks.executors;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.HttpConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.time.Duration;
import javax.net.ssl.SSLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

@Component
public class HttpCheckExecutor implements CheckExecutor {

  private static final Logger LOG = LoggerFactory.getLogger(HttpCheckExecutor.class);

  private final MeterRegistry meterRegistry;

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
      RestClient client = buildClient(config);

      int actualStatus =
          client
              .method(org.springframework.http.HttpMethod.valueOf(config.method()))
              .uri(config.url())
              .headers(
                  h -> {
                    if (config.headers() != null) {
                      config.headers().forEach(h::set);
                    }
                  })
              .exchange((req, resp) -> resp.getStatusCode().value());

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

  private RestClient buildClient(HttpConfiguration config) {
    ClientHttpRequestFactorySettings settings =
        ClientHttpRequestFactorySettings.DEFAULTS
            .withConnectTimeout(Duration.ofMillis(config.timeoutMs()))
            .withReadTimeout(Duration.ofMillis(config.timeoutMs()));
    ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(settings);

    if (Boolean.FALSE.equals(config.verifyTls())) {
      LOG.warn("TLS verification disabled for HTTP check — audit trail");
    }

    return RestClient.builder().requestFactory(factory).build();
  }

  private ExecutionOutcome mapTransportError(
      ResourceAccessException e, Duration duration, HttpConfiguration config) {
    Throwable cause = e.getMostSpecificCause();

    if (cause instanceof java.net.SocketTimeoutException) {
      return new ExecutionOutcome.Timeout(duration);
    }
    if (cause instanceof ConnectException) {
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
        .tag("csi_id", check.getCsiId())
        .register(meterRegistry)
        .increment();
  }
}
