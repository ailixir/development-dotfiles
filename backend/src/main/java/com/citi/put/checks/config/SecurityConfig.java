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
      ObjectMapper objectMapper,
      IdentityBypassProperties identityBypass) {
    return new BffSessionAuthenticationFilter(
        coreServiceClient, identityCache, eventPublisher, objectMapper, identityBypass);
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
    // ── FINDING: CSRF is disabled while the browser authenticates with a COOKIE (AC-21a) ────────
    //
    // Architecture §9.1: "cookie-authenticated mutations require a documented CSRF control." That
    // control does not exist, and until story 10.18b nobody had been asked for it. Two facts bound
    // the gap, both read on this branch:
    //
    //   1. the browser's credential is a cookie — `BffSessionAuthenticationFilter.COOKIE_NAME` is
    //      `put_session`, read off the request by `extractSessionCookie`; and
    //   2. CORS is CREDENTIALED — `buildCorsSource` below sets `setAllowCredentials(true)` for
    //      `/api/**`, and the chart deploys the MFE and the API on different hosts
    //      (`checks.citi.com` vs `checks-api.citi.com`).
    //
    // An ambient cookie plus a state-changing endpoint is the classic forgery surface. `SameSite`
    // on the cookie would bound it, but this application does not set the cookie — Core does — and
    // what Core sets is not established anywhere in this repository.
    //
    // **This story deliberately does NOT enable Spring's CSRF filter and does NOT drop CORS
    // credentials.** Either change alters the public request contract of every existing Checks
    // route — every mutation would need a token the frontend does not send today — and landing
    // that inside a Studio story is the Class C change ADR-002 §12 reserves for a ruling. The gap
    // is recorded here, in `docs/runbooks/studio-runner.md` §10 as an open launch prerequisite, and
    // as SPK-02 question 7: "Is CSRF protection for cookie-authenticated mutations defined?" — a
    // question the PLATFORM's browser-auth route may already answer, which is why the answer is
    // ED-06's to state in writing (AC-21b, blocked) rather than this story's to invent.
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
