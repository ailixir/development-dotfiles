package com.citi.put.checks.config;

import com.citi.put.checks.security.ServiceIdentityAuthenticationFilter;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * The {@code /internal/**} filter chain (AC-6a).
 *
 * <p><b>This closes a real hole, not a hardening nicety.</b> {@code SecurityConfig} requires {@code
 * .authenticated()} on {@code /api/**} and then ends {@code .anyRequest().permitAll()}, so before
 * this chain existed an unmatched {@code /internal/**} path was <em>open</em>. The two callbacks
 * this story adds would have been reachable by anyone who could route to the pod.
 *
 * <p>Higher precedence than the platform chain and matched on {@code /internal/**}, so an internal
 * request never reaches the permissive tail. The chain deliberately runs <b>none</b> of the
 * platform filters:
 *
 * <ul>
 *   <li>no {@code BffSessionAuthenticationFilter} — there is no user session here, and no CSI
 *       evaluation is performed;
 *   <li>no {@code IdempotencyFilter} and no {@code RateLimitFilter} — both wrap user mutations and
 *       have no meaning for a service-to-service callback whose whole design is retry-until-
 *       acknowledged. Rate-limiting the runner's terminal retry would discard the result it cannot
 *       replay.
 * </ul>
 *
 * <p>The body bound runs <em>after</em> the identity check, so an unauthenticated caller cannot
 * learn the bound by probing it, and before the handler, so an oversized body is answered on its
 * head.
 */
@Configuration
@Profile("!worker")
public class StudioInternalSecurityConfig {

  @Bean
  public ServiceIdentityAuthenticationFilter serviceIdentityAuthenticationFilter(
      @Value("${studio.execution.callback.service-token:}") String serviceToken,
      ObjectMapper objectMapper) {
    return new ServiceIdentityAuthenticationFilter(serviceToken, objectMapper);
  }

  @Bean
  public InternalCallbackBodyLimitFilter internalCallbackBodyLimitFilter(
      StudioExecutionProperties properties, ObjectMapper objectMapper) {
    return new InternalCallbackBodyLimitFilter(properties, objectMapper);
  }

  /**
   * Both filters below are declared as beans so the chain can order them, which makes Spring Boot
   * auto-register them with the servlet container on {@code /*} as well. That would put the service
   * identity check in front of <em>every</em> route, including {@code /v3/api-docs} and the public
   * Studio API — the opposite of what AC-6a asks for. These two registrations disable the automatic
   * mapping and leave the filters reachable only through the chain that matches {@code
   * /internal/**}.
   */
  @Bean
  public FilterRegistrationBean<Filter> serviceIdentityFilterNotAutoRegistered(
      ServiceIdentityAuthenticationFilter filter) {
    return disableAutoRegistration(filter);
  }

  @Bean
  public FilterRegistrationBean<Filter> internalBodyLimitFilterNotAutoRegistered(
      InternalCallbackBodyLimitFilter filter) {
    return disableAutoRegistration(filter);
  }

  private static FilterRegistrationBean<Filter> disableAutoRegistration(Filter filter) {
    FilterRegistrationBean<Filter> registration = new FilterRegistrationBean<>(filter);
    registration.setEnabled(false);
    return registration;
  }

  @Bean
  @Order(1)
  public SecurityFilterChain internalFilterChain(
      HttpSecurity http,
      ServiceIdentityAuthenticationFilter serviceIdentityFilter,
      InternalCallbackBodyLimitFilter bodyLimitFilter)
      throws Exception {
    http.securityMatcher("/internal/**")
        .csrf(csrf -> csrf.disable())
        .cors(cors -> cors.disable())
        .formLogin(form -> form.disable())
        .httpBasic(basic -> basic.disable())
        .anonymous(anonymous -> anonymous.disable())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth.anyRequest()
                    .hasAuthority(ServiceIdentityAuthenticationFilter.SERVICE_AUTHORITY))
        .addFilterBefore(serviceIdentityFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(bodyLimitFilter, ServiceIdentityAuthenticationFilter.class);
    return http.build();
  }
}
