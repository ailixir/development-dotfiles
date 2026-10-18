package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;

/** Explicit opt-in writer for the two credential-bearing channels; never the application mapper. */
public final class SecretWireWriter {
  private SecretWireWriter() {}

  public static byte[] bytes(ObjectMapper mapper, Object body) throws IOException {
    var module = new SimpleModule("StudioSecretWire");
    module.addSerializer(SecretValue.class, new SecretValue.Writer());
    return mapper.copy().registerModule(module).writeValueAsBytes(body);
  }
}
