package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.api.gax.httpjson.HttpJsonStatusCode;
import com.google.api.gax.rpc.ApiException;
import com.google.api.gax.rpc.ApiExceptionFactory;
import com.google.api.gax.rpc.StatusCode;
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
  void unavailableAndResourceExhaustedAreRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(StatusCode.Code.UNAVAILABLE)))
        .isTrue();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(StatusCode.Code.RESOURCE_EXHAUSTED)))
        .isTrue();
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
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(StatusCode.Code.DEADLINE_EXCEEDED)))
        .isFalse();
  }

  @Test
  void ambiguousServerErrorsAreNotRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(apiException(StatusCode.Code.INTERNAL)))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(StatusCode.Code.UNKNOWN)))
        .isFalse();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(StatusCode.Code.INVALID_ARGUMENT)))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(new IllegalStateException("boom")))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(null)).isFalse();
  }

  @Test
  void outcomeAndErrorCodeFollowTheClassification() {
    assertThat(GatewayFailureClassifier.outcomeFor(new SocketTimeoutException("Read timed out")))
        .isEqualTo(GatewayOutcome.TIMEOUT);
    assertThat(GatewayFailureClassifier.outcomeFor(apiException(StatusCode.Code.UNAVAILABLE)))
        .isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TIMEOUT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TIMEOUT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TRANSPORT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TRANSPORT);
  }

  private static ApiException apiException(StatusCode.Code code) {
    return ApiExceptionFactory.createException(
        new IllegalStateException("stub"), HttpJsonStatusCode.of(code), false);
  }
}
