package com.citi.put.checks.config;

import com.citi.put.checks.csi.CsiApiProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
  CheckSourceProperties.class,
  CoreServiceProperties.class,
  CorsProperties.class,
  CsiApiProperties.class,
  FeatureFlagProperties.class,
  RateLimitProperties.class,
  SourceConcurrencyProperties.class
})
public class AppPropertiesConfig {}
