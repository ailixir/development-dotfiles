package com.citi.put.checks.studio.authoring;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Binds the save-time authoring bounds. */
@Configuration
@EnableConfigurationProperties(StudioAuthoringProperties.class)
public class StudioAuthoringConfiguration {}
