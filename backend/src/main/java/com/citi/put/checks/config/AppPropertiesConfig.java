package com.citi.put.checks.config;

import com.citi.put.checks.csi.CsiApiProperties;
import com.citi.put.checks.dc.DcProperties;
import com.citi.put.checks.studio.StudioExecutionProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  CheckSourceProperties.class,
  CoreServiceProperties.class,
  CorsProperties.class,
  CsiApiProperties.class,
  DcProperties.class,
  FeatureFlagProperties.class,
  IdentityBypassProperties.class,
  RateLimitProperties.class,
  SourceConcurrencyProperties.class,
  StudioExecutionProperties.class
})
public class AppPropertiesConfig {}
