package com.citi.put.checks.users;

import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.users.entity.User;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProvisioningService {

  private static final Logger LOG = LoggerFactory.getLogger(UserProvisioningService.class);

  /**
   * Inserts the mirror row only if the identity has none, on the database's terms.
   *
   * <p>{@code ON CONFLICT DO NOTHING} rather than a read followed by an insert: the asynchronous
   * listener is provisioning the <em>same</em> identity concurrently, on the same request, so a
   * read-then-insert would trade a foreign key violation for a unique one. With no conflict target
   * this covers both of {@code users}' unique constraints — {@code sso_id} and the partial unique
   * index on {@code email} — and a concurrent uncommitted insert is waited for rather than lost.
   */
  private static final String INSERT_MIRROR_IF_ABSENT =
      "INSERT INTO users (sso_id, name, email, department, created_at, last_login, is_active)"
          + " VALUES (?, ?, ?, ?, NOW(), NOW(), true) ON CONFLICT DO NOTHING";

  private final UserRepository userRepository;
  private final JdbcTemplate jdbcTemplate;

  public UserProvisioningService(UserRepository userRepository, JdbcTemplate jdbcTemplate) {
    this.userRepository = userRepository;
    this.jdbcTemplate = jdbcTemplate;
  }

  /**
   * Guarantees the identity has a mirror row <em>before</em> a write that references it commits.
   *
   * <p>Story 1.6 AC-4 provisions the mirror asynchronously, deliberately, so that reads are not
   * charged for a write. AC-6 names the consequence for {@code GET /users/me} — a {@code 404} with
   * {@code Retry-After} while provisioning has not landed yet — but every write that stores an
   * author is in the same window and cannot answer that way: {@code ui_tests.created_by}, {@code
   * checks.created_by} and {@code reports.created_by} are {@code REFERENCES users(email)}, so an
   * author whose mirror has not landed is a foreign key violation and a {@code 500}, on the first
   * thing a newly provisioned user does. Whether it 500s is decided by a race between the request
   * thread and the listener's thread.
   *
   * <p>This closes that window for one write at a time, at the write itself: it joins the caller's
   * transaction, so the author exists for the foreign key check and disappears again with the row
   * if the write is rolled back. It is not a substitute for AC-4's listener — {@code last_login}
   * and any upstream change to {@code name}, {@code email} or {@code department} remain that
   * listener's business — it only asserts the row's existence, which is what the constraint asks
   * for.
   *
   * @param identity the authenticated author of the write about to happen
   * @return {@code true} if this call inserted the mirror row
   */
  @Transactional(propagation = Propagation.REQUIRED)
  public boolean ensureMirrored(UserIdentity identity) {
    int inserted =
        jdbcTemplate.update(
            INSERT_MIRROR_IF_ABSENT,
            identity.userId(),
            identity.name(),
            identity.email(),
            identity.department());
    if (inserted > 0) {
      LOG.info("Mirrored author sso_id={} ahead of a write referencing them", identity.userId());
    }
    return inserted > 0;
  }

  @Transactional
  public void provisionOrTouch(UserIdentity identity) {
    var existing =
        userRepository
            .findBySsoId(identity.userId())
            .or(() -> userRepository.findByEmail(identity.email()));

    if (existing.isPresent()) {
      User user = existing.get();
      user.setName(identity.name());
      user.setEmail(identity.email());
      user.setDepartment(identity.department());
      user.setLastLogin(Instant.now());
      LOG.debug("Updated last_login for user sso_id={}", identity.userId());
    } else {
      User user =
          new User(identity.userId(), identity.name(), identity.email(), identity.department());
      userRepository.save(user);
      LOG.info("Provisioned new user sso_id={}", identity.userId());
    }
  }
}
