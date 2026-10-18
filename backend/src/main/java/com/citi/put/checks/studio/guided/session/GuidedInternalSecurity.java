package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guided-only RS256 service JWT + container-validated mutual TLS. TLS must terminate at this
 * connector with clientAuth=need and its configured truststore; forwarded headers are never proof.
 * Keys are deployment-pinned X.509 SPKI, not token-selected URLs. Rotate by draining sessions,
 * updating the configured key/issuer together and restarting controllers/workers.
 */
@Configuration
@Profile("!worker")
public class GuidedInternalSecurity {
  @Bean
  @Order(0)
  SecurityFilterChain guidedInternalChain(
      HttpSecurity http,
      @Value("${studio.guided-authoring.service-public-key:}") String key,
      @Value("${studio.guided-authoring.service-issuer:}") String issuer,
      @Value("${studio.guided-authoring.mtls-required:false}") boolean mtls)
      throws Exception {
    // Construct in-chain only: intentionally not a Filter bean or servlet auto-registration.
    var filter = new IdentityFilter(key, issuer, mtls, Clock.systemUTC());
    http.securityMatcher("/internal/v2/studio/guided-sessions/**")
        .csrf(c -> c.disable())
        .cors(c -> c.disable())
        .formLogin(c -> c.disable())
        .httpBasic(c -> c.disable())
        .anonymous(c -> c.disable())
        .sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(c -> c.anyRequest().authenticated())
        .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  public static void requireRole(Authentication auth, String role) {
    require(auth instanceof Identity && auth.isAuthenticated(), "UNAUTHENTICATED", 401);
    require(((Identity) auth).role.equals(role), "FORBIDDEN_SCOPE", 403);
  }

  static final class Identity extends AbstractAuthenticationToken {
    private final String subject;
    private final String role;

    Identity(String subject, String role) {
      super(List.of(new SimpleGrantedAuthority("GUIDED_" + role)));
      this.subject = subject;
      this.role = role;
      setAuthenticated(true);
    }

    @Override
    public String getPrincipal() {
      return subject;
    }

    @Override
    public Object getCredentials() {
      return null;
    }
  }

  static final class IdentityFilter extends OncePerRequestFilter {
    private final String publicKey;
    private final String issuer;
    private final boolean mtls;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();

    IdentityFilter(String publicKey, String issuer, boolean mtls, Clock clock) {
      this.publicKey = publicKey;
      this.issuer = issuer;
      this.mtls = mtls;
      this.clock = clock;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws IOException, ServletException {
      Identity identity;
      try {
        identity = authenticate(request);
      } catch (Exception e) {
        response.setStatus(401);
        response.setContentType("application/json");
        var failure =
            new java.util.HashMap<String, Object>(
                new GuidedSessionException("UNAUTHENTICATED", 401).response());
        failure.put("schemaVersion", 3);
        json.writeValue(response.getOutputStream(), failure);
        return;
      }
      SecurityContextHolder.getContext().setAuthentication(identity);
      try {
        chain.doFilter(request, response);
      } finally {
        SecurityContextHolder.clearContext();
      }
    }

    Identity authenticate(HttpServletRequest request) throws Exception {
      require(mtls && !publicKey.isBlank() && !issuer.isBlank(), "UNAUTHENTICATED", 401);
      Object certificates = request.getAttribute("jakarta.servlet.request.X509Certificate");
      require(
          certificates instanceof X509Certificate[]
              && ((X509Certificate[]) certificates).length > 0,
          "UNAUTHENTICATED",
          401);
      ((X509Certificate[]) certificates)[0].checkValidity(java.util.Date.from(clock.instant()));
      String bearer = request.getHeader("Authorization");
      require(
          bearer != null && bearer.startsWith("Bearer ") && bearer.length() <= 8192,
          "UNAUTHENTICATED",
          401);
      String[] parts = bearer.substring(7).split("\\.", -1);
      require(parts.length == 3, "UNAUTHENTICATED", 401);
      for (String p : parts) {
        require(!p.isEmpty() && p.matches("[A-Za-z0-9_-]+"), "UNAUTHENTICATED", 401);
      }
      JsonNode header = decode(parts[0]);
      require(
          header.isObject()
              && header.size() == 2
              && header.path("alg").asText().equals("RS256")
              && header.path("typ").asText().equals("JWT"),
          "UNAUTHENTICATED",
          401);
      byte[] key =
          Base64.getDecoder()
              .decode(
                  publicKey
                      .replace("-----BEGIN PUBLIC KEY-----", "")
                      .replace("-----END PUBLIC KEY-----", "")
                      .replaceAll("\\s", ""));
      var rsa = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(key));
      require(
          ((java.security.interfaces.RSAPublicKey) rsa).getModulus().bitLength() >= 2048,
          "UNAUTHENTICATED",
          401);
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initVerify(rsa);
      signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
      require(signature.verify(Base64.getUrlDecoder().decode(parts[2])), "UNAUTHENTICATED", 401);
      JsonNode claims = decode(parts[1]);
      require(
          claims.isObject()
              && claims.path("iss").isTextual()
              && claims.path("iss").asText().equals(issuer)
              && claims.path("sub").isTextual()
              && !claims.path("sub").asText().isBlank()
              && claims.path("sub").asText().length() <= 256
              && claims.path("aud").isTextual()
              && claims.path("role").isTextual()
              && claims.path("iat").isIntegralNumber()
              && claims.path("exp").isIntegralNumber()
              && claims.path("iat").canConvertToLong()
              && claims.path("exp").canConvertToLong(),
          "UNAUTHENTICATED",
          401);
      Set<String> allowedClaims = Set.of("iss", "sub", "aud", "role", "iat", "exp", "nbf");
      claims
          .fieldNames()
          .forEachRemaining(name -> require(allowedClaims.contains(name), "UNAUTHENTICATED", 401));
      String role = claims.path("role").asText();
      require(Set.of("owning-worker", "backend-controller").contains(role), "UNAUTHENTICATED", 401);
      // This receiver is the ledger controller for both callers. The actual OBS-004 runner
      // receiver has a distinct audience and must not accept these controller-bound tokens.
      require(
          claims.path("aud").asText().equals("studio-guided-controller"), "UNAUTHENTICATED", 401);
      long now = clock.instant().getEpochSecond(),
          issued = claims.path("iat").asLong(),
          expires = claims.path("exp").asLong();
      require(
          issued >= 0
              && issued <= now
              && expires > now
              && expires > issued
              && expires - issued <= 300,
          "UNAUTHENTICATED",
          401);
      if (claims.has("nbf")) {
        require(
            claims.path("nbf").isIntegralNumber()
                && claims.path("nbf").canConvertToLong()
                && claims.path("nbf").asLong() >= 0
                && claims.path("nbf").asLong() <= now,
            "UNAUTHENTICATED",
            401);
      }
      return new Identity(claims.path("sub").asText(), role);
    }

    private JsonNode decode(String segment) {
      return new GuidedContracts().parseWire(Base64.getUrlDecoder().decode(segment), 8, 4096);
    }
  }
}
