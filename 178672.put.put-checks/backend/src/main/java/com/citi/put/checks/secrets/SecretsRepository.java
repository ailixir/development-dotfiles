package com.citi.put.checks.secrets;

import com.citi.put.checks.secrets.entity.Secret;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecretsRepository extends JpaRepository<Secret, UUID> {

  Optional<Secret> findByReferenceId(String referenceId);
}
