package com.citi.put.checks.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.users.entity.User;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class UserProvisioningIT {

  @Autowired UserProvisioningService provisioningService;
  @Autowired UserRepository userRepository;
  @Autowired RateLimitedProvisioningWrapper wrapper;

  @Test
  void firstCallInsertsNewUser() {
    UserIdentity identity =
        new UserIdentity(
            "prov-test-1", "prov1@citi.com", "Prov User", "Ops", List.of("operator"), List.of());

    provisioningService.provisionOrTouch(identity);

    Optional<User> found = userRepository.findBySsoId("prov-test-1");
    assertThat(found).isPresent();
    assertThat(found.get().getEmail()).isEqualTo("prov1@citi.com");
    assertThat(found.get().getName()).isEqualTo("Prov User");
    assertThat(found.get().getLastLogin()).isNotNull();
  }

  @Test
  void secondCallUpdatesLastLogin() throws InterruptedException {
    UserIdentity identity =
        new UserIdentity(
            "prov-test-2", "prov2@citi.com", "Prov User 2", "Ops", List.of("operator"), List.of());

    provisioningService.provisionOrTouch(identity);
    User first = userRepository.findBySsoId("prov-test-2").orElseThrow();
    var firstLogin = first.getLastLogin();

    Thread.sleep(50);
    provisioningService.provisionOrTouch(identity);
    User second = userRepository.findBySsoId("prov-test-2").orElseThrow();

    assertThat(second.getLastLogin()).isAfter(firstLogin);
  }

  @Test
  void provisionUpdatesNameAndDepartmentIfChanged() {
    UserIdentity v1 =
        new UserIdentity(
            "prov-test-3",
            "prov3@citi.com",
            "Old Name",
            "Old Dept",
            List.of("operator"),
            List.of());
    provisioningService.provisionOrTouch(v1);

    UserIdentity v2 =
        new UserIdentity(
            "prov-test-3",
            "prov3@citi.com",
            "New Name",
            "New Dept",
            List.of("operator"),
            List.of());
    provisioningService.provisionOrTouch(v2);

    User updated = userRepository.findBySsoId("prov-test-3").orElseThrow();
    assertThat(updated.getName()).isEqualTo("New Name");
    assertThat(updated.getDepartment()).isEqualTo("New Dept");
  }
}
