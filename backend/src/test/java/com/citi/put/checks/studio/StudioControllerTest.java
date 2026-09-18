package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.dto.UITestExecutionDto;
import com.citi.put.checks.studio.validation.StepValidator;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;

class StudioControllerTest {

  @Test
  void listsAllExecutionsWhenNoTestIdIsProvided() {
    StudioService studioService = org.mockito.Mockito.mock(StudioService.class);
    when(studioService.listExecutions(null, 0, 20)).thenReturn(Page.empty());
    StudioController controller = new StudioController(studioService, new StepValidator());

    ResponseEntity<java.util.Map<String, Object>> response = controller.listExecutions(null, 0, 20);

    assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
    assertThat(response.getBody()).containsEntry("totalElements", 0L);
    verify(studioService).listExecutions(null, 0, 20);
  }

  @Test
  void filtersExecutionsWhenTestIdIsProvided() {
    StudioService studioService = org.mockito.Mockito.mock(StudioService.class);
    UUID testId = UUID.randomUUID();
    when(studioService.listExecutions(testId, 1, 10)).thenReturn(Page.<UITestExecutionDto>empty());
    StudioController controller = new StudioController(studioService, new StepValidator());

    ResponseEntity<java.util.Map<String, Object>> response =
        controller.listExecutions(testId, 1, 10);

    assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
    verify(studioService).listExecutions(testId, 1, 10);
  }
}
