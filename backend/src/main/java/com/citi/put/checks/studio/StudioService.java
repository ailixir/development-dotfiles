package com.citi.put.checks.studio;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestExecutionDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StudioService {

  private final StudioRepository studioRepository;
  private final UITestExecutionRepository executionRepository;
  private final ObjectProvider<LocalStudioExecutionRunner> localExecutionRunner;

  public StudioService(
      StudioRepository studioRepository,
      UITestExecutionRepository executionRepository,
      ObjectProvider<LocalStudioExecutionRunner> localExecutionRunner) {
    this.studioRepository = studioRepository;
    this.executionRepository = executionRepository;
    this.localExecutionRunner = localExecutionRunner;
  }

  public Page<UITestDto> listTests(String csiId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return studioRepository.findAllFiltered(csiId, pageable).map(UITestDto::from);
  }

  @Transactional
  public UITestDto createTest(UITestRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    UITest test =
        new UITest(
            request.name(),
            request.description(),
            request.csiId(),
            request.steps(),
            request.variables(),
            request.browser(),
            request.viewportWidth(),
            request.viewportHeight(),
            request.environment(),
            identity.email());
    test = studioRepository.save(test);
    return UITestDto.from(test);
  }

  public UITestDto findTestById(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    return UITestDto.from(test);
  }

  @Transactional
  public UITestDto updateTest(UUID id, UITestRequest request) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    test.setName(request.name());
    test.setDescription(request.description());
    test.setCsiId(request.csiId());
    test.setSteps(request.steps());
    test.setVariables(request.variables());
    test.setBrowser(request.browser());
    test.setViewportWidth(request.viewportWidth());
    test.setViewportHeight(request.viewportHeight());
    test.setEnvironment(request.environment());
    test.setUpdatedAt(Instant.now());
    return UITestDto.from(test);
  }

  @Transactional
  public void softDeleteTest(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    test.setDeletedAt(Instant.now());
  }

  @Transactional
  public UITestExecutionDto executeTest(UUID testId) {
    UITest test =
        studioRepository
            .findById(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    UITestExecution execution = new UITestExecution(testId, "PENDING", Instant.now());
    execution = executionRepository.save(execution);
    LocalStudioExecutionRunner runner = localExecutionRunner.getIfAvailable();
    if (runner != null) {
      executionRepository.flush();
      runner.run(execution.getId(), test);
    }
    return UITestExecutionDto.from(execution);
  }

  public UITestExecutionDto findExecutionById(UUID executionId) {
    UITestExecution execution =
        executionRepository
            .findById(executionId)
            .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));
    return UITestExecutionDto.from(execution);
  }

  public Page<UITestExecutionDto> listExecutions(UUID testId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    Page<UITestExecution> executions =
        testId == null
            ? executionRepository.findAll(pageable)
            : executionRepository.findByTestId(testId, pageable);
    return executions.map(UITestExecutionDto::from);
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
