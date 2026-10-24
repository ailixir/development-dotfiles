package com.citi.put.checks.studio.dispatch;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Binds runner properties; StudioRunnerTls.Wiring owns the profile-aware validation. */
@Configuration
@EnableConfigurationProperties(StudioRunnerProperties.class)
public class StudioRunnerConfiguration {}
