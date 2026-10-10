package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

/** Guided-only raw boundary; the platform BFF and unrelated JSON converters are unchanged. */
@ControllerAdvice(
    assignableTypes = {
      GuidedInternalController.class,
      GuidedSessionController.class,
      com.citi.put.checks.studio.guided.publication.GuidedPublicationController.class,
      com.citi.put.checks.studio.guided.translation.GuidedPlanningController.class
    })
public final class GuidedWireBodyAdvice extends RequestBodyAdviceAdapter {
  private final GuidedContracts contracts = new GuidedContracts();

  @Override
  public boolean supports(
      MethodParameter parameter, Type type, Class<? extends HttpMessageConverter<?>> converter) {
    return type == JsonNode.class;
  }

  @Override
  public HttpInputMessage beforeBodyRead(
      HttpInputMessage input,
      MethodParameter parameter,
      Type type,
      Class<? extends HttpMessageConverter<?>> converter)
      throws IOException {
    var contentType = input.getHeaders().getContentType();
    GuidedSessionException.require(
        contentType == null
            || contentType.getCharset() == null
            || contentType.getCharset().equals(java.nio.charset.StandardCharsets.UTF_8),
        "INVALID_CONTRACT",
        422);
    int maximum =
        parameter.getContainingClass()
                == com.citi.put.checks.studio.guided.publication.GuidedPublicationController.class
            ? 4096
            : 1048576;
    byte[] bytes = input.getBody().readNBytes(maximum + 1);
    GuidedSessionException.require(bytes.length <= maximum, "INVALID_CONTRACT", 422);
    contracts.parseWire(bytes);
    return new HttpInputMessage() {
      @Override
      public InputStream getBody() {
        return new ByteArrayInputStream(bytes);
      }

      @Override
      public HttpHeaders getHeaders() {
        return input.getHeaders();
      }
    };
  }
}
