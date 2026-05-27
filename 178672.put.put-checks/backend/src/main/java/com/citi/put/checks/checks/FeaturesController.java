package com.citi.put.checks.checks;

import com.citi.put.checks.checks.dto.CheckSourceDto;
import com.citi.put.checks.checks.dto.FeatureFlagDto;
import com.citi.put.checks.checks.dto.FeaturesResponse;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.config.FeatureFlag;
import com.citi.put.checks.config.FeatureFlagProperties;
import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/features")
public class FeaturesController {

  private final CheckSourceProperties sourceProperties;
  private final FeatureFlagProperties featureFlagProperties;

  public FeaturesController(
      CheckSourceProperties sourceProperties, FeatureFlagProperties featureFlagProperties) {
    this.sourceProperties = sourceProperties;
    this.featureFlagProperties = featureFlagProperties;
  }

  @GetMapping
  public ResponseEntity<FeaturesResponse> getFeatures() {
    List<CheckSourceDto> sources =
        Arrays.stream(CheckType.values())
            .map(t -> CheckSourceDto.of(t, sourceProperties.isEnabled(t)))
            .toList();

    List<FeatureFlagDto> features =
        Arrays.stream(FeatureFlag.values())
            .map(f -> FeatureFlagDto.of(f, featureFlagProperties.isEnabled(f)))
            .toList();

    return ResponseEntity.ok(new FeaturesResponse(sources, features));
  }
}
