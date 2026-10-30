package com.citi.put.checks.studio.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The deployment's allowed domains, validated at startup (an invalid list, or an allow-all value
 * that is not {@code true} or {@code false}, fails the context).
 */
@Configuration
@EnableConfigurationProperties(AllowedDomains.Properties.class)
public class AllowedDomainsConfiguration {
  private static final Logger LOGGER = LoggerFactory.getLogger(AllowedDomainsConfiguration.class);

  @Bean
  AllowedDomains allowedDomains(AllowedDomains.Properties properties) {
    AllowedDomains domains = properties.domains();
    if (domains.allowAll()) {
      // The list is ignored while the option is on; say so once, and log no URL or domain.
      LOGGER.warn("Studio navigation allowed to all domains (allow-all-domains=true)");
    } else {
      LOGGER.info("Studio allowed domains ({}): {}", domains.entries().size(), domains.entries());
    }
    return domains;
  }
}
