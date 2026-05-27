package com.citi.put.checks.checks;

import com.citi.put.checks.checks.dto.CheckSourceDto;
import com.citi.put.checks.checks.dto.CheckSourcesResponse;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.config.CheckSourceProperties;
import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/checks")
public class CheckSourcesController {

  private final CheckSourceProperties sourceProperties;

  public CheckSourcesController(CheckSourceProperties sourceProperties) {
    this.sourceProperties = sourceProperties;
  }

  @GetMapping("/sources")
  public ResponseEntity<CheckSourcesResponse> getSources() {
    List<CheckSourceDto> sources =
        Arrays.stream(CheckType.values())
            .map(t -> CheckSourceDto.of(t, sourceProperties.isEnabled(t)))
            .toList();
    return ResponseEntity.ok(new CheckSourcesResponse(sources));
  }
}
