package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.util.AccessPattern;
import java.io.IOException;

/**
 * The runner's terminal verdict. Null on {@code STARTED} and {@code PROGRESS}.
 *
 * <p>{@code errorCode} is an open string and is <b>never copied into</b> {@code
 * ui_test_executions.error_code} (AC-16): every value {@code ExecutionErrorCode} enumerates is
 * assigned by the API's dispatcher or reapers, and a component that cannot observe a condition must
 * not be able to publish the verdict for it.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunOutcome(
    String result,
    String errorCode,
    String errorMessage,
    @JsonInclude(JsonInclude.Include.NON_NULL) LoginRequiredDetail detail) {

  public RunOutcome {
    if ("LOGIN_REQUIRED".equals(errorCode)
        ? !FAILED.equals(result) || detail == null
        : detail != null) {
      throw new IllegalArgumentException("Invalid login failure outcome");
    }
  }

  /** Safe step identity and prior-login fact; no observation or credential bytes. */
  @JsonIgnoreProperties(ignoreUnknown = false)
  public record LoginRequiredDetail(
      @JsonProperty(value = "stepId", required = true)
          @JsonDeserialize(using = StepIdDeserializer.class)
          String stepId,
      @JsonProperty(value = "loginStepsPresent", required = true)
          @JsonDeserialize(using = LoginBooleanDeserializer.class)
          boolean loginStepsPresent) {
    public LoginRequiredDetail {
      if (stepId == null || stepId.isBlank() || stepId.length() > 256) {
        throw new IllegalArgumentException("Invalid login failure detail");
      }
    }
  }

  /** Step identity uses the exact wire string type rather than coercing other scalars. */
  public static final class StepIdDeserializer extends JsonDeserializer<String> {
    @Override
    public String deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      if (parser.currentToken() == JsonToken.VALUE_STRING) {
        return parser.getText();
      }
      return context.reportInputMismatch(String.class, "Step identity must be a string");
    }
  }

  /** This member has the exact closed-wire boolean type, without scalar coercion. */
  public static final class LoginBooleanDeserializer extends JsonDeserializer<Boolean> {
    @Override
    public Boolean deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      if (parser.currentToken() == JsonToken.VALUE_TRUE) {
        return true;
      }
      if (parser.currentToken() == JsonToken.VALUE_FALSE) {
        return false;
      }
      return context.reportInputMismatch(Boolean.class, "Login state must be a boolean");
    }

    @Override
    public Boolean getNullValue(DeserializationContext context) throws JsonMappingException {
      return context.reportInputMismatch(Boolean.class, "Login state must be a boolean");
    }

    @Override
    public AccessPattern getNullAccessPattern() {
      return AccessPattern.DYNAMIC;
    }
  }

  public static final String PASSED = "PASSED";
  public static final String FAILED = "FAILED";
  public static final String ERROR = "ERROR";
}
