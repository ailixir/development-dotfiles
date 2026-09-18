package com.citi.put.checks.studio.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.entity.UITestExecution;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UITestExecutionDtoTest {

  @Test
  void preservesLegacyPlainTextLogs() {
    UITestExecution execution = new UITestExecution(UUID.randomUUID(), "PASSED", Instant.now());
    execution.setLogs("Step 1: Navigate OK | Step 2: Assert visible OK");

    UITestExecutionDto dto = UITestExecutionDto.from(execution);

    assertThat(dto.logs()).singleElement().extracting("message").isEqualTo(execution.getLogs());
  }
}
