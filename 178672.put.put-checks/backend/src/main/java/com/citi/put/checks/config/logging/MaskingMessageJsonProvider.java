package com.citi.put.checks.config.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import com.fasterxml.jackson.core.JsonGenerator;
import java.io.IOException;
import net.logstash.logback.composite.loggingevent.MessageJsonProvider;

public class MaskingMessageJsonProvider extends MessageJsonProvider {

  @Override
  public void writeTo(JsonGenerator generator, ILoggingEvent event) throws IOException {
    String masked = SecretMasker.mask(event.getFormattedMessage());
    generator.writeStringField(getFieldName(), masked);
  }
}
