package com.citi.put.checks.dc;

import com.citi.put.checks.checks.executors.ExecutionOutcome;
import java.time.Duration;
import java.util.concurrent.TimeoutException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

final class DcErrorMapper {

  private DcErrorMapper() {}

  static ExecutionOutcome fromHttpStatus(int status, String bodySnippet, Duration duration) {
    if (status == 401 || status == 403) {
      return new ExecutionOutcome.Failure(duration, "DC auth failed (HTTP " + status + ")", null);
    }
    if (status >= 500) {
      return new ExecutionOutcome.Failure(duration, "DC unavailable (HTTP " + status + ")", null);
    }
    String detail =
        bodySnippet == null || bodySnippet.isBlank()
            ? "DC request rejected (HTTP " + status + ")"
            : "DC request rejected (HTTP " + status + "): " + truncate(bodySnippet);
    return new ExecutionOutcome.Failure(duration, detail, null);
  }

  static ExecutionOutcome fromThrowable(Throwable t, Duration duration) {
    Throwable root = rootCause(t);
    if (root instanceof TimeoutException || isTimeoutMessage(root)) {
      return new ExecutionOutcome.Timeout(duration);
    }
    if (root instanceof RestClientResponseException ex) {
      return fromHttpStatus(ex.getStatusCode().value(), ex.getResponseBodyAsString(), duration);
    }
    if (root instanceof ResourceAccessException || root instanceof RestClientException) {
      return new ExecutionOutcome.Failure(duration, "DC unavailable: " + root.getMessage(), null);
    }
    return new ExecutionOutcome.Failure(
        duration,
        "Unexpected DC error: " + root.getClass().getSimpleName() + ": " + root.getMessage(),
        null);
  }

  private static boolean isTimeoutMessage(Throwable t) {
    String msg = t.getMessage();
    return msg != null && msg.toLowerCase().contains("timed out");
  }

  private static Throwable rootCause(Throwable t) {
    Throwable cur = t;
    while (cur.getCause() != null && cur.getCause() != cur) {
      cur = cur.getCause();
    }
    return cur;
  }

  private static String truncate(String s) {
    return s.length() <= 200 ? s : s.substring(0, 200) + "...";
  }
}
