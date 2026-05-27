package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestExecution;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UITestExecutionRepository extends JpaRepository<UITestExecution, UUID> {

  Page<UITestExecution> findByTestId(UUID testId, Pageable pageable);
}
