package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * A draft records its author, and {@code ui_tests.created_by} is {@code REFERENCES users(email)}
 * (V1). The mirror row that satisfies it is written by story 1.6's {@code @Async} listener, which
 * runs concurrently with the request that triggered it — so before this guard existed, whether
 * {@code POST /api/v1/studio/tests} answered {@code 201} or {@code 500} on a user's first draft was
 * decided by a race between the request thread and the listener's thread. That race is exactly what
 * made {@code StudioApiIT} order-dependent on the Epic 10 integration branch.
 *
 * <p>These two run against the real {@link StudioService} bean and a real database, and they
 * deliberately do <em>not</em> go through HTTP: a request would publish {@code
 * UserAuthenticatedEvent} and let the asynchronous listener provision the author behind the test's
 * back, which is the very nondeterminism under repair. An author that no request ever announced is
 * the only way to state the property so that it cannot be satisfied by luck.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class AuthorMirrorIT {

  private static final String CSI_ID = "60491";
  private static final String CSI_OWNER = "author-mirror-owner@citi.com";

  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;

  @BeforeEach
  void setUp() {
    seedUser(CSI_OWNER, "Author Mirror Owner", "Ops");
    seedCsi();
  }

  @Test
  void aDraftIsCreatedByAnAuthorWhoseMirrorRowHasNotLandedYet() {
    UserIdentity author = freshAuthor();
    assertThat(mirrorRowsFor(author.email()))
        .as("precondition: this author has never been mirrored")
        .isZero();

    UITestDto created =
        studioService.createTest(
            draft("Draft by an unmirrored author"), new BffAuthenticationToken(author));

    assertThat(storedAuthorOf(created.id()))
        .as("the draft records the authenticated author, which is what the foreign key binds")
        .isEqualTo(author.email());
    assertThat(mirrorRowsFor(author.email()))
        .as("the write established the author's mirror row rather than waiting for the listener")
        .isEqualTo(1);
    assertThat(ssoIdFor(author.email()))
        .as("and mirrored the identity that actually wrote, not a placeholder")
        .isEqualTo(author.userId());
  }

  @Test
  void anAlreadyMirroredAuthorIsLeftExactlyAsTheListenerRecordedThem() {
    UserIdentity author = freshAuthor();
    Instant recordedLogin = Instant.now().minus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
    seedUser(author.email(), "Recorded By The Listener", "Recorded Department");
    jdbc.update(
        "UPDATE users SET last_login = ? WHERE email = ?",
        Timestamp.from(recordedLogin),
        author.email());

    studioService.createTest(
        draft("Draft by a mirrored author"), new BffAuthenticationToken(author));

    assertThat(mirrorRowsFor(author.email())).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT name || '|' || department FROM users WHERE email = ?",
                String.class,
                author.email()))
        .as("a write path may require the row to exist; it may not restate what it holds")
        .isEqualTo("Recorded By The Listener|Recorded Department");
    assertThat(
            jdbc.queryForObject(
                    "SELECT last_login FROM users WHERE email = ?", Timestamp.class, author.email())
                .toInstant())
        .as("last_login belongs to story 1.6's listener, not to draft creation")
        .isEqualTo(recordedLogin);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** An identity no request has ever announced, so nothing can have mirrored it. */
  private static UserIdentity freshAuthor() {
    String suffix = UUID.randomUUID().toString().substring(0, 8);
    return new UserIdentity(
        "uid-author-" + suffix,
        "author-" + suffix + "@citi.com",
        "Fresh Author " + suffix,
        "Freshly Authored",
        List.of("checks-admin"),
        List.of());
  }

  /**
   * A draft with no steps: an empty source enqueues no compile (§8.3), which keeps this about the
   * author and the foreign key and off the gateway.
   */
  private static UITestRequest draft(String name) {
    return new UITestRequest(
        name, "author mirror guard", CSI_ID, "Production", List.of(), List.of(), null, null, null);
  }

  private Integer mirrorRowsFor(String email) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, email);
  }

  private String ssoIdFor(String email) {
    return jdbc.queryForObject("SELECT sso_id FROM users WHERE email = ?", String.class, email);
  }

  private String storedAuthorOf(UUID testId) {
    return jdbc.queryForObject(
        "SELECT created_by FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private void seedUser(String email, String name, String department) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, department, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        name,
        email,
        department,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Author Mirror CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL',"
            + " ?, ?) ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        CSI_OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
