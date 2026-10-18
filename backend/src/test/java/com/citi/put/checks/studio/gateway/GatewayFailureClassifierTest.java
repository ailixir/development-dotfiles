package com.citi.put.checks.studio.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.genai.errors.ApiException;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;

/**
 * Story 10.5 AC-4: only definite transport failures may be retried.
 *
 * <p>The negative cases matter more than the positive ones — a retried timeout or a retried
 * ambiguous 5xx doubles the compile cost for the same odds.
 */
class GatewayFailureClassifierTest {

  @Test
  void interruptedIoWithoutTimeoutRemainsATransportFailure() {
    var interrupted = new java.io.InterruptedIOException("partial transfer interrupted");
    assertThat(GatewayFailureClassifier.outcomeFor(interrupted))
        .isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(GatewayFailureClassifier.isRetryableTransport(interrupted)).isFalse();
  }

  @Test
  void okhttpCallDeadlineIsATimeoutEvenBeforeTheCompileTimerFires() {
    java.io.IOException wrapped =
        new java.io.IOException(
            "credential refresh failed", new java.io.InterruptedIOException("timeout"));
    assertThat(GatewayFailureClassifier.outcomeFor(wrapped)).isEqualTo(GatewayOutcome.TIMEOUT);
    assertThat(GatewayFailureClassifier.isRetryableTransport(wrapped)).isFalse();
  }

  @Test
  void unavailableAndResourceExhaustedAreRetried() {
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(503))).isTrue();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(429))).isTrue();
  }

  @Test
  void connectionRefusedAndResetAreRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new ConnectException("Connection refused"))))
        .isTrue();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new SocketException("Connection reset"))))
        .isTrue();
  }

  @Test
  void timeoutsAreNeverRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new SocketTimeoutException("Read timed out"))))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(new TimeoutException("deadline")))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(504))).isFalse();
  }

  @Test
  void ambiguousServerErrorsAreNotRetried() {
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(500))).isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(520))).isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(400))).isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(new IllegalStateException("boom")))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(null)).isFalse();
  }

  @Test
  void outcomeAndErrorCodeFollowTheClassification() {
    assertThat(GatewayFailureClassifier.outcomeFor(new SocketTimeoutException("Read timed out")))
        .isEqualTo(GatewayOutcome.TIMEOUT);
    assertThat(GatewayFailureClassifier.outcomeFor(apiException(503)))
        .isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TIMEOUT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TIMEOUT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TRANSPORT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TRANSPORT);
  }

  private static ApiException apiException(int code) {
    return new ApiException(code, "STUB", "stub");
  }
}
