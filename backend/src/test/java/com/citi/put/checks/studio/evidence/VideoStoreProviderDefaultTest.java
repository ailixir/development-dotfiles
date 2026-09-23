package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * The shipped application default is the fully functional local filesystem adapter. Clustered
 * deployments select S3 explicitly because private pod filesystems cannot be shared implicitly.
 */
class VideoStoreProviderDefaultTest {

  @Test
  void theShippedDefaultUsesLocalFilesystemStorage() throws IOException {
    MutablePropertySources sources = new MutablePropertySources();
    for (PropertySource<?> source :
        new YamlPropertySourceLoader()
            .load("application.yml", new ClassPathResource("application.yml"))) {
      sources.addLast(source);
    }
    Binder binder =
        new Binder(
            ConfigurationPropertySources.from(sources),
            new PropertySourcesPlaceholdersResolver(sources));

    VideoStoreProperties bound =
        binder.bind("studio.execution.video-store", VideoStoreProperties.class).get();

    assertThat(bound.provider()).isEqualTo(VideoStoreProperties.PROVIDER_LOCAL);
    assertThat(bound.servesRecordings()).isTrue();
  }
}
