package com.citi.put.checks.studio.storage;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Provider selection shared by video playback and result recovery. */
@ConfigurationProperties("studio.storage")
public record StudioStorageProperties(
    @DefaultValue("disabled") String provider,
    @DefaultValue("/tmp/studio-runner-objects") String directory,
    String bucket,
    String region,
    String credentialsDirectory,
    @DefaultValue("10s") Duration requestTimeout) {}
