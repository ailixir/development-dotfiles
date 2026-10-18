package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.PatternLayout;
import ch.qos.logback.core.read.ListAppender;
import java.util.Optional;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

class VideoObjectServerTest {
  @ParameterizedTest
  @CsvSource({
    "metadata,execution",
    "metadata,guided session",
    "range,execution",
    "range,guided session"
  })
  void storeFailuresKeep503AndRenderNoStoreLocationOrNestedThrowableAtInfoPlus(
      String boundary, String subject) {
    String key = "KEY-CANARY/private-recording.webm";
    String bucket = "BUCKET-CANARY";
    String endpoint = "https://ENDPOINT-CANARY.invalid";
    var failure =
        new VideoObjectStoreUnavailableException(
            "Unavailable " + bucket + " at " + endpoint,
            new IllegalStateException("nested object " + key));
    var store = mock(VideoObjectStore.class);
    if (boundary.equals("metadata")) {
      when(store.metadata(key)).thenThrow(failure);
    } else {
      when(store.metadata(key)).thenReturn(Optional.of(new VideoObjectMetadata(10)));
      when(store.read(key, 2, 4)).thenThrow(failure);
    }
    Logger logger = (Logger) LoggerFactory.getLogger(VideoObjectServer.class);
    var appender = new ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
    appender.start();
    logger.addAppender(appender);
    var layout = new PatternLayout();
    layout.setContext(logger.getLoggerContext());
    layout.setPattern("%level %msg%n%ex{full}");
    layout.start();
    try {
      assertThatThrownBy(
              () ->
                  new VideoObjectServer(store)
                      .serve(key, null, "bytes=2-4", subject + " safe-resource-id"))
          .isInstanceOfSatisfying(
              ExecutionVideoException.class,
              refused -> {
                assertThat(refused.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(refused.getCode()).isEqualTo("VIDEO_STORE_UNAVAILABLE");
                assertThat(refused.getCause()).isNull();
                assertThat(refused.getMessage()).doesNotContain(key, bucket, endpoint);
              });
      assertThat(appender.list).hasSize(1);
      String rendered =
          appender.list.stream()
              .filter(event -> event.getLevel().isGreaterOrEqual(ch.qos.logback.classic.Level.INFO))
              .map(layout::doLayout)
              .collect(java.util.stream.Collectors.joining());
      assertThat(rendered)
          .contains(subject + " safe-resource-id", "store unreachable")
          .doesNotContain(key, bucket, endpoint, "IllegalStateException", "nested object");
      assertThat(appender.list.get(0).getThrowableProxy()).isNull();
    } finally {
      logger.detachAppender(appender);
      appender.stop();
      layout.stop();
    }
  }
}
