package com.citi.put.checks.checks.model;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
  @JsonSubTypes.Type(value = HttpConfiguration.class, name = "HTTP"),
  @JsonSubTypes.Type(value = TcpConfiguration.class, name = "TCP"),
  @JsonSubTypes.Type(value = SplunkConfiguration.class, name = "SPLUNK")
})
public sealed interface CheckConfiguration
    permits HttpConfiguration, TcpConfiguration, SplunkConfiguration {
  String type();
}
