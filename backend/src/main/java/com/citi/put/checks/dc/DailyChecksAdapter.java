package com.citi.put.checks.dc;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.executors.ExecutionContext;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.Locale;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Proposal B — shared DailyChecks engine. Owns auth (via {@link DcClient}), send, retry/CB, outer
 * status+comment mapping, deep links, and metrics. Tool-specific shaping is supplied by callers.
 */
@Component
public class DailyChecksAdapter {

  private static final Logger LOG = LoggerFactory.getLogger(DailyChecksAdapter.class);

  private final DcClient dcClient;
  private final DcProperties props;
  private final MeterRegistry meterRegistry;

  public DailyChecksAdapter(DcClient dcClient, DcProperties props, MeterRegistry meterRegistry) {
    this.dcClient = dcClient;
    this.props = props;
    this.meterRegistry = meterRegistry;
  }

  public ExecutionOutcome run(
      Check check,
      ExecutionContext ctx,
      Function<Check, DcRequest> toRequest,
      Function<DcResponse, String> parseDetail) {
    long start = System.nanoTime();

    if (!props.enabled()) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, "FAILURE", duration);
      return new ExecutionOutcome.Failure(duration, "DailyChecks bridge is disabled", null);
    }
    if (props.baseUrl() == null || props.baseUrl().isBlank()) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      recordMetrics(check, "FAILURE", duration);
      return new ExecutionOutcome.Failure(duration, "DailyChecks base URL is not configured", null);
    }

    try {
      DcRequest request = toRequest.apply(check);
      LOG.debug(
          "DC execute type={} checkId={} path={} traceId={}",
          check.getType(),
          check.getId(),
          request.path(),
          ctx.traceId());

      DcResponse response = dcClient.exchange(request);
      Duration duration = Duration.ofNanos(System.nanoTime() - start);

      if (response.httpStatus() == 401 || response.httpStatus() == 403) {
        recordMetrics(check, "FAILURE", duration);
        return DcErrorMapper.fromHttpStatus(response.httpStatus(), response.comment(), duration);
      }
      if (response.httpStatus() >= 500) {
        recordMetrics(check, "FAILURE", duration);
        return DcErrorMapper.fromHttpStatus(response.httpStatus(), response.comment(), duration);
      }

      String detail = parseDetail != null ? parseDetail.apply(response) : null;
      ExecutionOutcome outcome = mapOuter(response, detail, duration);
      recordMetrics(check, outcomeLabel(outcome), duration);
      return outcome;
    } catch (Exception e) {
      Duration duration = Duration.ofNanos(System.nanoTime() - start);
      ExecutionOutcome outcome = DcErrorMapper.fromThrowable(e, duration);
      recordMetrics(check, outcomeLabel(outcome), duration);
      LOG.warn(
          "DC execute failed type={} checkId={}: {}",
          check.getType(),
          check.getId(),
          e.getMessage());
      return outcome;
    }
  }

  private ExecutionOutcome mapOuter(DcResponse response, String detail, Duration duration) {
    String status = response.status() == null ? "" : response.status().trim().toUpperCase(Locale.ROOT);
    String message = firstNonBlank(detail, response.comment(), "DC returned status " + status);
    String deepLink = response.deepLink();

    return switch (status) {
      case "SUCCESS", "PASS", "PASSED", "OK" -> new ExecutionOutcome.Success(duration, message);
      case "WARNING", "WARN" -> new ExecutionOutcome.Warning(duration, message);
      case "FAILURE", "FAIL", "FAILED", "ERROR" ->
          new ExecutionOutcome.Failure(duration, message, deepLink);
      case "TIMEOUT" -> new ExecutionOutcome.Timeout(duration);
      default -> {
        if (response.httpStatus() >= 200 && response.httpStatus() < 300 && status.isBlank()) {
          yield new ExecutionOutcome.Failure(
              duration, "Unexpected DC response: missing status field", deepLink);
        }
        if (response.httpStatus() >= 400) {
          yield DcErrorMapper.fromHttpStatus(response.httpStatus(), message, duration);
        }
        yield new ExecutionOutcome.Failure(
            duration, "Unexpected DC status: " + response.status(), deepLink);
      }
    };
  }

  private void recordMetrics(Check check, String result, Duration duration) {
    Timer.builder("checks.executor.duration")
        .tag("check_type", check.getType())
        .tag("result", result)
        .tag("dc", "true")
        .register(meterRegistry)
        .record(duration);
  }

  private static String outcomeLabel(ExecutionOutcome outcome) {
    if (outcome instanceof ExecutionOutcome.Success) {
      return "SUCCESS";
    }
    if (outcome instanceof ExecutionOutcome.Warning) {
      return "WARNING";
    }
    if (outcome instanceof ExecutionOutcome.Timeout) {
      return "TIMEOUT";
    }
    if (outcome instanceof ExecutionOutcome.Throttled) {
      return "THROTTLED";
    }
    return "FAILURE";
  }

  private static String firstNonBlank(String... values) {
    for (String v : values) {
      if (v != null && !v.isBlank()) {
        return v;
      }
    }
    return "";
  }
}
