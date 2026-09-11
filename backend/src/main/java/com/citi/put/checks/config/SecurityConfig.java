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
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
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
@Profile("!worker")
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
  public Cache<String, CachedResponse> idempotencyCache(MeterRegistry registry) {
    Cache<String, CachedResponse> cache =
        Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(50_000)
            .recordStats()
            .build();
    CaffeineCacheMetrics.monitor(registry, cache, "idempotency-cache");
    return cache;
  }

  @Bean
  public IdempotencyFilter idempotencyFilter(
      @Qualifier("idempotencyCache") Cache<String, CachedResponse> idempotencyCache,
      ObjectMapper objectMapper,
      MeterRegistry registry) {
    return new IdempotencyFilter(idempotencyCache, objectMapper, registry);
  }

  @Bean
  public RateLimitClassifier rateLimitClassifier() {
    return new RateLimitClassifier();
  }

  @Bean
  public BucketStore bucketStore(
      RateLimitClassifier rateLimitClassifier, RateLimitProperties rateLimitProps) {
    return new BucketStore(rateLimitClassifier, rateLimitProps);
  }

  @Bean
  public RateLimitFilter rateLimitFilter(
      BucketStore bucketStore,
      RateLimitClassifier rateLimitClassifier,
      ObjectMapper objectMapper,
      MeterRegistry registry) {
    return new RateLimitFilter(bucketStore, rateLimitClassifier, objectMapper, registry);
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
      HttpSecurity http,
      BffSessionAuthenticationFilter bffFilter,
      IdempotencyFilter idempotencyFilter,
      RateLimitFilter rateLimitFilter,
      CorsProperties corsProps,
      Optional<LocalDevAuthFilter> localDevAuthFilter)
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
                    .requestMatchers(HttpMethod.GET, "/api/v1/checks/sources")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/features")
                    .permitAll()
                    // The internal callbacks are served by StudioInternalSecurityConfig's
                    // higher-precedence chain and must never reach the permissive tail below.
                    // This matcher is defence in depth: if that chain were ever removed or its
                    // securityMatcher narrowed, /internal/** would otherwise become open again,
                    // which is exactly the hole story 10.7 AC-6a closes.
                    .requestMatchers("/internal/**")
                    .denyAll()
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .permitAll())
        .addFilterBefore(bffFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(idempotencyFilter, BffSessionAuthenticationFilter.class)
        .addFilterAfter(rateLimitFilter, IdempotencyFilter.class);

    // In the local profile, register a dev-only filter BEFORE BffSessionAuthenticationFilter
    // so that a default identity is injected and the session cookie check is satisfied.
    localDevAuthFilter.ifPresent(
        filter -> http.addFilterBefore(filter, BffSessionAuthenticationFilter.class));

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
    config.setExposedHeaders(
        List.of(
            "Retry-After",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Location",
            "Idempotent-Replayed"));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
