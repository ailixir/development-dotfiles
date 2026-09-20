package com.citi.put.checks.studio.evidence;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Binds the evidence store's deployment values (§8.5). */
@Configuration
@EnableConfigurationProperties(VideoStoreProperties.class)
public class StudioEvidenceConfig {}
