package com.citi.put.checks.config;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The callback body bound (AC-26, §5.4).
 *
 * <p>A body over the configured bound is {@code 413} with a code, which is the status the frozen
 * contract declares, and it <b>changes nothing</b>: the request is answered on its head, before the
 * body is read and before any handler work.
 */
public class InternalCallbackBodyLimitFilter extends OncePerRequestFilter {

  private final StudioExecutionProperties properties;
  private final ObjectMapper objectMapper;

  public InternalCallbackBodyLimitFilter(
      StudioExecutionProperties properties, ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    long declared = request.getContentLengthLong();
    int bound = properties.callbackOrDefault().maxBodyBytesOrDefault();
    if (declared > bound) {
      response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      objectMapper.writeValue(
          response.getOutputStream(),
          Map.of(
              "error",
              "REPORT_TOO_LARGE",
              "message",
              "The report body is over the configured callback bound of " + bound + " bytes"));
      return;
    }
    chain.doFilter(request, response);
  }
}
