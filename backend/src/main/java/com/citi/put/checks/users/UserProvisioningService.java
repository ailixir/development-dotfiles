package com.citi.put.checks.users;

import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.users.entity.User;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProvisioningService {

  private static final Logger LOG = LoggerFactory.getLogger(UserProvisioningService.class);

  private final UserRepository userRepository;

  public UserProvisioningService(UserRepository userRepository) {
    this.userRepository = userRepository;
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
