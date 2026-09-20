package com.citi.put.checks.studio.context;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextProvenance;
import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultLiteralValue;
import com.citi.put.checks.studio.dto.EvidenceReference;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.LiteralInput;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.SecretReference;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScopedContextResolverTest {

  private static final String CSI = "61837";
  private final ScopedContextResolver resolver = new ScopedContextResolver();

  @Test
  void explicitThenStepThenGlobalPrecedencePreservesExactTypedLiteral() {
    UUID id = UUID.randomUUID();
    String exact = "  雪 \\\"quote\\\" / slash\n  ";
    AuthoringV2Request authoring =
        authoring(
            new GlobalAuthoringContext(
                List.of(new ContextualDefault("input", new DefaultLiteralValue("global"))),
                List.of()),
            new AuthoringStep(
                id,
                "fill",
                new StepAuthoringContext(List.of(new LiteralInput("step")), List.of())));
    ExplicitStepIntent explicit =
        new ExplicitStepIntent(
            id,
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            null,
            new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, exact),
            List.of(),
            "/login",
            "login");

    ResolvedAuthoringContext result = resolve(authoring, List.of(explicit), List.of());

    assertThat(result.blocked()).isFalse();
    assertThat(((ResolvedLiteralInput) result.steps().get(0).input()).value()).isEqualTo(exact);
    assertThat(result.steps().get(0).contextProvenance())
        .extracting(ContextProvenance::scope)
        .contains(ContextProvenance.Scope.EXPLICIT_STEP);
  }

  @Test
  void sameScopeValueConflictBlocksResolution() {
    UUID id = UUID.randomUUID();
    AuthoringV2Request authoring =
        authoring(
            GlobalAuthoringContext.empty(),
            new AuthoringStep(
                id,
                "fill",
                new StepAuthoringContext(
                    List.of(new LiteralInput("one"), new LiteralInput("two")), List.of())));

    ResolvedAuthoringContext result = resolve(authoring, List.of(), List.of());

    assertThat(result.blocked()).isTrue();
    assertThat(result.diagnostics())
        .extracting(d -> d.category().name())
        .contains("CONFLICTING_VALUE");
  }

  @Test
  void loginEvidenceCannotVerifyAuthenticatedOrProtectedFutureState() {
    UUID login = UUID.randomUUID();
    UUID submit = UUID.randomUUID();
    UUID authenticated = UUID.randomUUID();
    UUID protectedPage = UUID.randomUUID();
    AuthoringEvidenceReference loginEvidence = supplied(login, "/login", "login");
    AuthoringV2Request authoring =
        new AuthoringV2Request(
            2,
            new GlobalAuthoringContext(List.of(), List.of(loginEvidence)),
            List.of(
                step(login, "login", StepAuthoringContext.empty()),
                step(
                    submit,
                    "submit",
                    new StepAuthoringContext(
                        List.of(new SecretReference("LOGIN_PASSWORD")), List.of())),
                step(authenticated, "authenticated", StepAuthoringContext.empty()),
                step(protectedPage, "protected", StepAuthoringContext.empty())));
    List<ExplicitStepIntent> intents =
        List.of(
            intent(login, ResolvedOperation.Kind.NAVIGATE, "/login", "login"),
            new ExplicitStepIntent(
                submit,
                new ResolvedOperation(ResolvedOperation.Kind.FILL),
                null,
                new ResolvedReferenceInput(
                    ResolvedReferenceInput.Kind.SECRET_REF, "LOGIN_PASSWORD"),
                List.of(),
                "/login",
                "login"),
            intent(authenticated, ResolvedOperation.Kind.ASSERT, "/home", "authenticated"),
            intent(protectedPage, ResolvedOperation.Kind.NAVIGATE, "/admin", "protected"));
    EvidenceReference observedAuthenticated = observed(authenticated, "/home", "authenticated");

    ResolvedAuthoringContext result = resolve(authoring, intents, List.of(observedAuthenticated));

    assertThat(result.evidenceCoverage())
        .extracting(EvidenceCoverage::source)
        .contains(EvidenceCoverage.Source.SUPPLIED, EvidenceCoverage.Source.OBSERVED)
        .endsWith(EvidenceCoverage.Source.PREDICTED);
    assertThat(result.toString()).doesNotContain("secret-canary-value");
    assertThat(((ResolvedReferenceInput) result.steps().get(1).input()).referenceId())
        .isEqualTo("LOGIN_PASSWORD");
  }

  private ResolvedAuthoringContext resolve(
      AuthoringV2Request authoring,
      List<ExplicitStepIntent> intents,
      List<EvidenceReference> evidence) {
    return resolver.resolve(
        authoring,
        evidence == null ? List.of() : intents,
        evidence,
        CSI,
        "Production",
        ResolutionPolicy.compilerLanguage());
  }

  private static AuthoringV2Request authoring(GlobalAuthoringContext global, AuthoringStep step) {
    return new AuthoringV2Request(2, global, List.of(step));
  }

  private static AuthoringStep step(UUID id, String text, StepAuthoringContext context) {
    return new AuthoringStep(id, text, context);
  }

  private static ExplicitStepIntent intent(
      UUID id, ResolvedOperation.Kind operation, String route, String state) {
    return new ExplicitStepIntent(
        id, new ResolvedOperation(operation), null, null, List.of(), route, state);
  }

  private static AuthoringEvidenceReference supplied(UUID step, String route, String state) {
    return new AuthoringEvidenceReference(
        UUID.randomUUID(),
        1,
        AuthoringEvidenceReference.Source.SUPPLIED,
        CSI,
        "Production",
        route,
        state,
        step,
        OffsetDateTime.parse("2026-09-18T12:00:00Z"),
        AuthoringEvidenceReference.Completeness.COMPLETE,
        "a".repeat(64));
  }

  private static EvidenceReference observed(UUID step, String route, String state) {
    return new EvidenceReference(
        UUID.randomUUID(),
        1,
        EvidenceReference.Source.OBSERVED,
        CSI,
        "Production",
        route,
        state,
        step,
        OffsetDateTime.parse("2026-09-18T12:01:00Z"),
        AuthoringEvidenceReference.Completeness.COMPLETE,
        "b".repeat(64));
  }
}
