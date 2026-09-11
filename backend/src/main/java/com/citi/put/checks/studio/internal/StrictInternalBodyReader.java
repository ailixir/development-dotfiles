package com.citi.put.checks.studio.internal;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;

/**
 * Reads an internal callback body from the <b>bytes the API actually received</b> (AC-1, AC-24).
 *
 * <p>The two internal routes take their body as a byte array and parse it here rather than letting
 * Spring bind it, for one reason: the closed schemas of ADR-002 §6.2 have to be enforced, and the
 * platform {@code ObjectMapper} has {@code FAIL_ON_UNKNOWN_PROPERTIES} disabled — Spring Boot's
 * default, and one the public Studio surface depends on, because its legacy request adapters accept
 * shapes the typed contract does not name.
 *
 * <p>Turning that feature on globally would change how every other request in the service is read.
 * A mapper scoped to this boundary turns it on for exactly the bodies the contract declares closed
 * and for nothing else. A field the contract does not name is then a {@code 400} rather than a
 * silent divergence — which is the whole of "an open schema over a wire body is not a contract".
 */
@Component
public class StrictInternalBodyReader {

  private final ObjectMapper strict;

  public StrictInternalBodyReader(ObjectMapper platformMapper) {
    this.strict = platformMapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
  }

  /** Parses the received bytes, or refuses them with a {@code 400} and a code. */
  public <T> T read(byte[] body, Class<T> type) {
    if (body == null || body.length == 0) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT, "The request body is empty");
    }
    try {
      T parsed = strict.readValue(new String(body, StandardCharsets.UTF_8), type);
      if (parsed == null) {
        throw InternalCallbackException.badRequest(
            InternalCallbackCodes.INVALID_REPORT, "The request body is null");
      }
      return parsed;
    } catch (JsonProcessingException e) {
      // The message is the parser's own and names the offending field, never a value from it.
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT,
          "The body does not conform to the frozen contract: " + e.getOriginalMessage());
    }
  }
}
