package com.citi.put.checks.checks;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.model.CheckConfiguration;
import com.citi.put.checks.checks.model.CheckType;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ExhaustivenessTest {

  @Test
  void jsonSubTypesCoversAllPermittedSubclasses() {
    Class<?>[] permitted = CheckConfiguration.class.getPermittedSubclasses();
    assertThat(permitted).as("Sealed interface must have permitted subclasses").isNotEmpty();

    JsonSubTypes annotation = CheckConfiguration.class.getAnnotation(JsonSubTypes.class);
    assertThat(annotation).as("@JsonSubTypes must be present on CheckConfiguration").isNotNull();

    Set<String> permittedNames =
        Arrays.stream(permitted).map(Class::getSimpleName).collect(Collectors.toSet());
    Set<String> registeredNames =
        Arrays.stream(annotation.value())
            .map(t -> t.value().getSimpleName())
            .collect(Collectors.toSet());

    assertThat(registeredNames)
        .as(
            "Every permitted subclass must have a @JsonSubTypes.Type registration. "
                + "Missing: %s",
            permittedNames.stream()
                .filter(n -> !registeredNames.contains(n))
                .collect(Collectors.joining(", ")))
        .containsAll(permittedNames);
  }

  @Test
  void checkTypeEnumMatchesJsonSubTypeNames() {
    JsonSubTypes annotation = CheckConfiguration.class.getAnnotation(JsonSubTypes.class);
    Set<String> jsonTypeNames =
        Arrays.stream(annotation.value()).map(JsonSubTypes.Type::name).collect(Collectors.toSet());

    Set<String> enumNames =
        Arrays.stream(CheckType.values()).map(Enum::name).collect(Collectors.toSet());

    Set<String> registeredButNotInEnum =
        jsonTypeNames.stream().filter(n -> !enumNames.contains(n)).collect(Collectors.toSet());
    assertThat(registeredButNotInEnum)
        .as("@JsonSubTypes types registered but missing from CheckType enum")
        .isEmpty();
  }
}
