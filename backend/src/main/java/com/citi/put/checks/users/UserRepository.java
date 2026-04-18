package com.citi.put.checks.users;

import com.citi.put.checks.users.entity.User;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

  Optional<User> findBySsoId(String ssoId);

  Optional<User> findByEmail(String email);
}
