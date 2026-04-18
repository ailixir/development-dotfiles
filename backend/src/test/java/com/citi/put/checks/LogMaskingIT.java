package com.citi.put.checks;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.LoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import java.io.ByteArrayOutputStream;
import net.logstash.logback.composite.loggingevent.LogLevelJsonProvider;
import net.logstash.logback.composite.loggingevent.LoggerNameJsonProvider;
import net.logstash.logback.composite.loggingevent.LoggingEventJsonProviders;
import net.logstash.logback.encoder.LoggingEventCompositeJsonEncoder;
import com.citi.put.checks.config.logging.MaskingMessageJsonProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class LogMaskingIT {

  private LoggerContext context;
  private ByteArrayOutputStream buffer;
  private OutputStreamAppender<ILoggingEvent> appender;

  @BeforeEach
  void setUp() {
    context = (LoggerContext) LoggerFactory.getILoggerFactory();
    buffer = new ByteArrayOutputStream();

    LoggingEventCompositeJsonEncoder encoder = new LoggingEventCompositeJsonEncoder();
    encoder.setContext(context);
    LoggingEventJsonProviders providers = encoder.getProviders();
    providers.addProvider(new LoggerNameJsonProvider());
    providers.addProvider(new LogLevelJsonProvider());
    MaskingMessageJsonProvider maskingProvider = new MaskingMessageJsonProvider();
    maskingProvider.setFieldName("message");
    providers.addProvider(maskingProvider);
    encoder.start();

    appender = new OutputStreamAppender<>();
    appender.setContext(context);
    appender.setEncoder(encoder);
    appender.setOutputStream(buffer);
    appender.start();
  }

  @Test
  void passwordValueIsMaskedInEncodedJson() {
    LoggingEvent event = new LoggingEvent(
        "test",
        context.getLogger(LogMaskingIT.class),
        Level.INFO,
        "request payload: {\"user\":\"alice\",\"password\":\"s3cret!\"}",
        null,
        null);
    event.setLoggerContextRemoteView(context.getLoggerContextRemoteView());

    appender.doAppend(event);
    String encoded = buffer.toString();

    assertThat(encoded).doesNotContain("s3cret!");
    assertThat(encoded).contains("\"message\"");
    assertThat(encoded).contains("***");
  }

  @Test
  void emailIsMaskedInEncodedJson() {
    LoggingEvent event = new LoggingEvent(
        "test",
        context.getLogger(LogMaskingIT.class),
        Level.INFO,
        "user alice.smith@citigroup.com logged in",
        null,
        null);
    event.setLoggerContextRemoteView(context.getLoggerContextRemoteView());

    appender.doAppend(event);
    String encoded = buffer.toString();

    assertThat(encoded).doesNotContain("alice.smith@citigroup.com");
    assertThat(encoded).contains("***@citigroup.com");
  }
}
