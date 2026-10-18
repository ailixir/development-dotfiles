package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

class StudioSecretsControllerRoutePinTest {
  @Test
  void createAndNamesOnlyListAreTheEntireRouteSetAndResponseHasNoSecretValue() throws Exception {
    assertThat(StudioSecretsController.class.getAnnotation(RequestMapping.class).value())
        .containsExactly("/api/v1/studio");
    var routes =
        Arrays.stream(StudioSecretsController.class.getDeclaredMethods())
            .flatMap(
                method -> {
                  if (method.isAnnotationPresent(GetMapping.class)) {
                    return Arrays.stream(method.getAnnotation(GetMapping.class).value())
                        .map(path -> "GET " + path);
                  }
                  if (method.isAnnotationPresent(PostMapping.class)) {
                    return Arrays.stream(method.getAnnotation(PostMapping.class).value())
                        .map(path -> "POST " + path);
                  }
                  return java.util.stream.Stream.<String>empty();
                })
            .collect(Collectors.toSet());
    assertThat(routes)
        .containsExactlyInAnyOrder("GET /tests/{id}/secrets", "POST /tests/{id}/secrets");
    var mapper = new ObjectMapper();
    var response =
        mapper.valueToTree(
            new StudioSecretDto("PASS", "7", java.util.List.of("https://fixture.example")));
    assertThat(response.size()).isEqualTo(3);
    assertThat(response.has("value")).isFalse();
    assertThat(
            Arrays.stream(StudioSecretDto.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
        .containsExactly("name", "version", "allowedOrigins");
  }
}
