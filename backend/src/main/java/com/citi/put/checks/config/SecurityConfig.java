package com.citi.put.checks.config;

import com.citi.put.checks.security.BffSessionAuthenticationFilter;
import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.cache.CaffeineCacheMetrics;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties({CoreServiceProperties.class, CorsProperties.class})
public class SecurityConfig {

  @Bean
  public Cache<String, UserIdentity> identityCache(MeterRegistry registry) {
    Cache<String, UserIdentity> cache =
        Caffeine.newBuilder()
            .expireAfterWrite(60, TimeUnit.SECONDS)
            .maximumSize(10_000)
            .recordStats()
            .build();
    CaffeineCacheMetrics.monitor(registry, cache, "identity-cache");
    return cache;
  }

  @Bean
  public Cache<String, Boolean> permissionCache(MeterRegistry registry) {
    Cache<String, Boolean> cache =
        Caffeine.newBuilder()
            .expireAfterWrite(60, TimeUnit.SECONDS)
            .maximumSize(10_000)
            .recordStats()
            .build();
    CaffeineCacheMetrics.monitor(registry, cache, "permission-cache");
    return cache;
  }

  @Bean
  public BffSessionAuthenticationFilter bffSessionAuthenticationFilter(
      CoreServiceClient coreServiceClient,
      Cache<String, UserIdentity> identityCache,
      ApplicationEventPublisher eventPublisher,
      ObjectMapper objectMapper) {
    return new BffSessionAuthenticationFilter(
        coreServiceClient, identityCache, eventPublisher, objectMapper);
  }

  @Bean
  public SecurityFilterChain filterChain(
      HttpSecurity http, BffSessionAuthenticationFilter bffFilter, CorsProperties corsProps)
      throws Exception {
    http.csrf(csrf -> csrf.disable())
        .formLogin(form -> form.disable())
        .httpBasic(basic -> basic.disable())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .cors(cors -> cors.configurationSource(buildCorsSource(corsProps)))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers(HttpMethod.OPTIONS, "/**")
                    .permitAll()
                    .requestMatchers("/actuator/**")
                    .permitAll()
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .permitAll())
        .addFilterBefore(bffFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource(CorsProperties corsProps) {
    return buildCorsSource(corsProps);
  }

  private UrlBasedCorsConfigurationSource buildCorsSource(CorsProperties corsProps) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(corsProps.allowedOrigins());
    config.setAllowCredentials(true);
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(
        List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Requested-With"));
    config.setExposedHeaders(List.of("Retry-After", "X-RateLimit-Remaining", "Location"));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
