package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.config.IdentityBypassProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySource;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * ED-02, story 10.18b AC-19a: the three identity bypasses, each closed, each with a permit
 * companion, and each watched against the production symbol.
 *
 * <h2>Why this file exists in this shape</h2>
 *
 * <p><strong>Three paths, not one.</strong> Every record in this epic — the manifest's {@code
 * ED-02} description, the run log's wave-1 baseline entry — described the bypass as a single
 * hardcoded flag. {@link BffSessionAuthenticationFilter#resolveIdentity} reads the client-supplied
 * {@code X-User-Id} header and returns <em>before</em> it reaches the Core-service bypass, and
 * {@code applyTemporaryCsiReadBypass} is a third path that appends {@code checks-admin} to any GET
 * under {@code /api/v1/csi}. Closing one of three is the "two guards each covering half a property"
 * shape applied to authentication: a story that closed only the flag could report "production auth
 * bypass absent" while any caller that reaches the pod supplies its own roles.
 *
 * <p><strong>Every refusal has a permit companion, and that is a named risk this story
 * carries.</strong> Story 10.17's exact failure mode, one story later: the refusal tests get
 * written carefully with injected identities and the permit companions are left to ride whatever
 * the default is, because they pass either way and nobody looks at a passing test. A test suite
 * that only proves "deny" would be satisfied by a filter that denies everything, which is not a fix
 * — it is an outage. So each closure below is paired with the observation that the path it does not
 * govern still works.
 *
 * <p><strong>The header mutation is run with the bypass CLOSED.</strong> If {@code coreService}
 * were open while the header path was tested, closing the header path would change a 200 into a
 * different 200 and the result would be unreadable. With the bypass closed, the header path's
 * refusal is a 401 and its permit is a 200 — an unambiguous difference. The one case where both
 * matter is {@link Watch#closingTheHeaderPathIsNotSatisfiedByTheBypassBeingOpen()}, which is there
 * precisely because it is the one mutation in this story that could otherwise pass while the
 * property failed.
 *
 * <p><strong>The watch is pinned to the production class.</strong> {@code Watch} constructs the
 * real {@link BffSessionAuthenticationFilter} and drives it under both values of each property.
 * There is no test-local stand-in for the filter anywhere in this file — a guard whose name states
 * a structural property of a production symbol while its body asserts over a stand-in is the
 * sixteenth catalogued vacuous shape, found twice in story 10.17.
 *
 * <p><strong>What this does NOT do.</strong> It does not remove the bypasses. @po ruled at wave-6
 * validation that removal is out of scope — deleting the Core-service bypass moves identity
 * resolution onto {@code CoreServiceClient}, which the target platform does not provide, and the
 * filter's own comment records that. Their <em>absence from the deployed profile</em> is asserted
 * over the rendered Helm manifest in {@code studio-runner/test/deployment/edge.test.ts}. The vault
 * is still a stub and ED-02's owner still reads TBD.
 */
class BffSessionBypassClosureTest {

  private static final String COOKIE = "put_session";
  private static final String SESSION_VALUE = "a-real-session-value";

  /** The identity a real Core session resolves to. Deliberately NOT an admin. */
  private static final UserIdentity REAL_USER =
      new UserIdentity(
          "u123456",
          "real.user@citi.com",
          "Real User",
          "Checks",
          List.of("checks-viewer"),
          List.of());

  private final CoreServiceClient coreServiceClient = mock(CoreServiceClient.class);

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private BffSessionAuthenticationFilter filterWith(IdentityBypassProperties bypass) {
    return new BffSessionAuthenticationFilter(
        coreServiceClient,
        Caffeine.newBuilder().build(),
        mock(ApplicationEventPublisher.class),
        new ObjectMapper(),
        bypass);
  }

  private static IdentityBypassProperties allClosed() {
    return IdentityBypassProperties.closed();
  }

  private static MockHttpServletRequest get(String uri) {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
    request.setRequestURI(uri);
    return request;
  }

  /**
   * Runs the filter and reports what the downstream chain saw.
   *
   * <p>The identity has to be captured <em>inside</em> the chain: the filter clears the security
   * context in a {@code finally} block, so reading {@code SecurityContextHolder} after {@code
   * doFilter} returns would observe an empty context for every case — a test that could not tell a
   * bypass from a refusal, and would be green for both.
   */
  private Outcome run(BffSessionAuthenticationFilter filter, MockHttpServletRequest request)
      throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    AtomicReference<UserIdentity> seen = new AtomicReference<>();
    FilterChain capturing =
        (req, res) -> {
          Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
          if (authentication instanceof BffAuthenticationToken token) {
            seen.set((UserIdentity) token.getPrincipal());
          }
        };
    filter.doFilter(request, response, capturing);
    return new Outcome(response.getStatus(), seen.get(), response.getContentAsString());
  }

  private record Outcome(int status, UserIdentity identity, String body) {
    boolean reachedTheApplication() {
      return identity != null;
    }
  }

  // ── Path 1 of 3: the Core-service bypass — the flag ED-02 names ────────────────────────────

  @Nested
  @DisplayName("path 1/3 — isCoreServiceBypassed")
  class CoreServiceBypass {

    @Test
    @DisplayName("REFUSAL: closed, a request with no session is 401 and never becomes an admin")
    void closedMeansUnauthenticated() throws Exception {
      Outcome outcome = run(filterWith(allClosed()), get("/api/v1/checks"));

      assertThat(outcome.status()).isEqualTo(401);
      assertThat(outcome.body()).contains("UNAUTHENTICATED");
      assertThat(outcome.reachedTheApplication())
          .withFailMessage(
              "a request with no session reached the application with an identity; the "
                  + "hardcoded CORE_SERVICE_BYPASS_IDENTITY carries checks-admin AND platform-admin")
          .isFalse();
      verifyNoInteractions(coreServiceClient);
    }

    @Test
    @DisplayName(
        "PERMIT: open, the same request is the platform-bypass admin — the path still works")
    void openStillProducesTheBypassIdentity() throws Exception {
      IdentityBypassProperties open = new IdentityBypassProperties(true, false, false);

      Outcome outcome = run(filterWith(open), get("/api/v1/checks"));

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity().userId()).isEqualTo("platform-bypass");
      assertThat(outcome.identity().roles()).contains("checks-admin", "platform-admin");
    }

    @Test
    @DisplayName(
        "PERMIT: closed, a REAL session still authenticates — deny-everything is not a fix")
    void closedDoesNotBreakTheOrdinarySessionPath() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      MockHttpServletRequest request = get("/api/v1/checks");
      request.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome outcome = run(filterWith(allClosed()), request);

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity()).isEqualTo(REAL_USER);
      assertThat(outcome.identity().roles()).doesNotContain("checks-admin");
    }
  }

  // ── Path 2 of 3: the X-User-Id header, checked BEFORE the bypass ───────────────────────────

  @Nested
  @DisplayName("path 2/3 — the client-supplied identity headers")
  class IdentityHeaders {

    private MockHttpServletRequest forged(String uri) {
      MockHttpServletRequest request = get(uri);
      request.addHeader("X-User-Id", "attacker");
      request.addHeader("X-User-Email", "attacker@example.invalid");
      request.addHeader("X-User-Roles", "checks-admin,platform-admin");
      request.addHeader("X-User-Csi-Ownership", "12345:owner");
      return request;
    }

    @Test
    @DisplayName("REFUSAL: closed, a caller cannot supply its own identity, roles or CSI ownership")
    void closedMeansTheHeadersAreIgnored() throws Exception {
      // Run with the bypass CLOSED so that "no change" is unambiguous: the refusal is a 401 and
      // the permit is a 200, rather than two different 200s.
      Outcome outcome = run(filterWith(allClosed()), forged("/api/v1/checks"));

      assertThat(outcome.status()).isEqualTo(401);
      assertThat(outcome.reachedTheApplication())
          .withFailMessage(
              "a direct caller supplied its own identity — architecture §9.1's "
                  + "direct-backend impersonation, and this repository contains no gateway that "
                  + "strips these headers")
          .isFalse();
    }

    @Test
    @DisplayName("PERMIT: open, the headers still resolve — the trusted-gateway path is intact")
    void openStillParsesTheHeaderIdentity() throws Exception {
      IdentityBypassProperties open = new IdentityBypassProperties(false, true, false);

      Outcome outcome = run(filterWith(open), forged("/api/v1/checks"));

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity().userId()).isEqualTo("attacker");
      assertThat(outcome.identity().roles()).contains("checks-admin", "platform-admin");
      assertThat(outcome.identity().csiOwnership()).hasSize(1);
    }

    @Test
    @DisplayName("PERMIT: closed, a real session is unaffected by a forged header riding along")
    void closedLeavesTheRealSessionPathAlone() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      MockHttpServletRequest request = forged("/api/v1/checks");
      request.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome outcome = run(filterWith(allClosed()), request);

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity()).isEqualTo(REAL_USER);
      assertThat(outcome.identity().userId()).isNotEqualTo("attacker");
    }
  }

  // ── Path 3 of 3: applyTemporaryCsiReadBypass ───────────────────────────────────────────────

  @Nested
  @DisplayName("path 3/3 — the /api/v1/csi read bypass")
  class CsiReadBypass {

    @Test
    @DisplayName("REFUSAL: closed, a GET under /api/v1/csi does not gain checks-admin")
    void closedLeavesRolesAlone() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      MockHttpServletRequest request = get("/api/v1/csi/12345");
      request.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome outcome = run(filterWith(allClosed()), request);

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity().roles())
          .withFailMessage("a viewer was promoted to checks-admin by the request path alone")
          .doesNotContain("checks-admin");
      assertThat(outcome.identity().roles()).isEqualTo(REAL_USER.roles());
    }

    @Test
    @DisplayName("PERMIT: open, the same GET still gains checks-admin — the path still works")
    void openStillAppendsTheRole() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      IdentityBypassProperties open = new IdentityBypassProperties(false, false, true);
      MockHttpServletRequest request = get("/api/v1/csi/12345");
      request.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome outcome = run(filterWith(open), request);

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity().roles()).contains("checks-admin", "checks-viewer");
    }

    @Test
    @DisplayName("PERMIT: closed, a non-CSI route for the same user is unchanged either way")
    void closedDoesNotDisturbOtherRoutes() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      MockHttpServletRequest request = get("/api/v1/checks");
      request.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome outcome = run(filterWith(allClosed()), request);

      assertThat(outcome.status()).isEqualTo(200);
      assertThat(outcome.identity().roles()).isEqualTo(REAL_USER.roles());
    }
  }

  // ── The watch, pinned to the production symbols (M14) ──────────────────────────────────────

  @Nested
  @DisplayName("the watch — each property must keep discriminating on the PRODUCTION filter")
  class Watch {

    /**
     * M14. If {@code isCoreServiceBypassed()} is ever restored to an unconditional {@code return
     * true}, the closed case below stops being a 401 and this test reddens. The assertion is over
     * the production method's observable behaviour under both property values, not over a copy of
     * its logic.
     */
    @Test
    @DisplayName("isCoreServiceBypassed: closed is 401 and open is 200 — never the same answer")
    void coreServiceBypassDiscriminates() throws Exception {
      Outcome closed = run(filterWith(allClosed()), get("/api/v1/checks"));
      Outcome open =
          run(filterWith(new IdentityBypassProperties(true, false, false)), get("/api/v1/checks"));

      assertThat(closed.status())
          .withFailMessage(
              "the Core-service bypass has stopped reading its property — a hardcoded "
                  + "`return true` makes a 401 unreachable on every route in the product")
          .isEqualTo(401);
      assertThat(open.status()).isEqualTo(200);
      assertThat(closed.status()).isNotEqualTo(open.status());
    }

    /**
     * The mutation @po strengthened. Closing the Core-service bypass while the header path stays
     * open changes nothing for a caller that sends a header, because {@code resolveIdentity} checks
     * the header FIRST. This test states that relation directly so it cannot be re-introduced by an
     * ordering change in the filter.
     */
    @Test
    @DisplayName(
        "ordering: an open header path defeats a closed bypass — the header is checked first")
    void closingTheHeaderPathIsNotSatisfiedByTheBypassBeingOpen() throws Exception {
      MockHttpServletRequest request = get("/api/v1/checks");
      request.addHeader("X-User-Id", "attacker");
      request.addHeader("X-User-Roles", "checks-admin");

      // Bypass CLOSED, headers OPEN: the caller still wins. This is the state a story that closed
      // only the flag would have shipped while reporting "production auth bypass absent".
      Outcome headerWins =
          run(filterWith(new IdentityBypassProperties(false, true, false)), request);
      assertThat(headerWins.status()).isEqualTo(200);
      assertThat(headerWins.identity().userId()).isEqualTo("attacker");

      // Headers CLOSED, bypass OPEN: the header is genuinely ignored rather than merely producing
      // a 401 for some unrelated reason — the identity is the platform's, not the caller's.
      MockHttpServletRequest second = get("/api/v1/checks");
      second.addHeader("X-User-Id", "attacker");
      second.addHeader("X-User-Roles", "checks-admin");
      Outcome bypassWins =
          run(filterWith(new IdentityBypassProperties(true, false, false)), second);
      assertThat(bypassWins.status()).isEqualTo(200);
      assertThat(bypassWins.identity().userId()).isEqualTo("platform-bypass");
    }

    @Test
    @DisplayName(
        "applyTemporaryCsiReadBypass: closed leaves roles alone, open appends — never both")
    void csiReadBypassDiscriminates() throws Exception {
      when(coreServiceClient.getUserMe(anyString())).thenReturn(REAL_USER);
      MockHttpServletRequest closedRequest = get("/api/v1/csi");
      closedRequest.setCookies(new Cookie(COOKIE, SESSION_VALUE));
      MockHttpServletRequest openRequest = get("/api/v1/csi");
      openRequest.setCookies(new Cookie(COOKIE, SESSION_VALUE));

      Outcome closed = run(filterWith(allClosed()), closedRequest);
      Outcome open = run(filterWith(new IdentityBypassProperties(false, false, true)), openRequest);

      assertThat(closed.identity().roles()).doesNotContain("checks-admin");
      assertThat(open.identity().roles()).contains("checks-admin");
    }

    /**
     * The default is the criterion, not the property. AC-19a part 1 is "reads a property whose
     * default is {@code false}" — a key that defaults open is a bypass with a longer name. This
     * binds the real record from an EMPTY property source, so it fails if any {@code @DefaultValue}
     * is changed or dropped.
     */
    @Test
    @DisplayName("the binder default for all three is closed, from an empty property source")
    void defaultsAreClosed() {
      ConfigurationPropertySource empty = new MapConfigurationPropertySource(Map.of());

      // `bindOrCreate`, not `bind`: an empty source binds nothing at all and `bind` returns an
      // unbound result, so a test that fell back to a locally-constructed instance would be
      // asserting over its own fallback and not over the record's @DefaultValue annotations.
      IdentityBypassProperties bound =
          new Binder(empty).bindOrCreate("checks.security.bypass", IdentityBypassProperties.class);

      assertThat(bound.coreService()).isFalse();
      assertThat(bound.identityHeaders()).isFalse();
      assertThat(bound.csiRead()).isFalse();
    }

    @Test
    @DisplayName("the binder reads all three keys — the defaults are not simply unreachable")
    void everyKeyIsBindable() {
      ConfigurationPropertySource source =
          new MapConfigurationPropertySource(
              Map.of(
                  "checks.security.bypass.core-service", "true",
                  "checks.security.bypass.identity-headers", "true",
                  "checks.security.bypass.csi-read", "true"));

      IdentityBypassProperties bound =
          new Binder(source)
              .bind("checks.security.bypass", IdentityBypassProperties.class)
              .orElseThrow(() -> new AssertionError("the three keys did not bind at all"));

      assertThat(bound.coreService()).isTrue();
      assertThat(bound.identityHeaders()).isTrue();
      assertThat(bound.csiRead()).isTrue();
    }
  }
}
