package com.citi.put.checks.studio.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.StudioVariable;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Studio v1 WP6 (plan ADD-7): validate-variables answers from the draft, not {@code true}. */
class VariableReferenceValidatorTest {

  @Test
  void aDraftWhoseReferencesAreAllDeclaredAndValuedIsValid() {
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(
            List.of(
                "Type \"<var USERNAME>\" in the \"Username\" field",
                "Type \"<secret LOGIN_PW>\" in the \"Password\" field"),
            List.of(
                StudioVariable.plain("USERNAME", "svc-user"),
                StudioVariable.secretRef("Password", "LOGIN_PW")),
            Map.of());

    assertThat(result.isValid()).isTrue();
    assertThat(result.missing()).isEmpty();
    assertThat(result.unused()).isEmpty();
  }

  @Test
  void anUndeclaredReferenceOfEitherKindIsInvalid() {
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(
            List.of("Type \"<var USRENAME>\" in the \"Username\" field", "Type \"<secret PW>\""),
            List.of(StudioVariable.plain("USERNAME", "svc-user")),
            Map.of());

    assertThat(result.isValid()).isFalse();
    assertThat(result.undeclared()).containsExactly("<var USRENAME>", "<secret PW>");
    assertThat(result.unused()).containsExactly("USERNAME");
  }

  @Test
  void aNameDeclaredWithTheOtherKindDoesNotSatisfyAReference() {
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(
            List.of("Type \"<var TOKEN>\" in the \"Token\" field"),
            List.of(StudioVariable.secretRef("TOKEN", "TOKEN")),
            Map.of());

    assertThat(result.undeclared()).containsExactly("<var TOKEN>");
  }

  @Test
  void aReferencedVariableWithNoValueIsMissingUntilTheCallerSuppliesOne() {
    List<String> steps = List.of("Go to \"<var BASE_URL>\"");
    List<StudioVariable> declared = List.of(StudioVariable.plain("BASE_URL", " "));

    VariableReferenceValidator.Result unsupplied =
        VariableReferenceValidator.validate(steps, declared, Map.of());
    assertThat(unsupplied.isValid()).isFalse();
    assertThat(unsupplied.unvalued()).containsExactly("BASE_URL");
    assertThat(unsupplied.missing()).containsExactly("BASE_URL");

    Map<String, Object> blank = new HashMap<>();
    blank.put("BASE_URL", "");
    assertThat(VariableReferenceValidator.validate(steps, declared, blank).isValid()).isFalse();

    assertThat(
            VariableReferenceValidator.validate(
                    steps, declared, Map.of("BASE_URL", "https://example.test"))
                .isValid())
        .isTrue();
  }

  @Test
  void aNameDeclaredAsBothKindsIsInvalidEvenIfUnreferenced() {
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(
            List.of("Go to the home page"),
            List.of(StudioVariable.plain("PW", "x"), StudioVariable.secretRef("PW", "PW")),
            Map.of());

    assertThat(result.isValid()).isFalse();
    assertThat(result.conflicting()).containsExactly("PW");
  }

  @Test
  void aDraftWithNoReferencesAndNoDeclarationsIsValid() {
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(List.of("Go to the home page"), List.of(), null);

    assertThat(result.isValid()).isTrue();
  }
}
