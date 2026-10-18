package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.C;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.array;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.at;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.canonical;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.choiceFixture;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.copy;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.fixture;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.hash;
import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilderTest.object;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Independent RUNNER fixture artifact/hash vectors are the expected results, never Java output. */
class ObservedArtifactLowererTest {
  @Test
  void validationCanonicalRetainsPublicNameRefusalAndImmutableInputBytes() throws Exception {
    var checked = new GuidedContracts();
    ObjectNode publication =
        checked
            .object()
            .put("schemaVersion", 3)
            .put("expectedConfigurationRevision", "2")
            .put("expectedSourceRevision", "1");
    String before = publication.toString();
    String expected = GuidedContracts.canonical(publication);
    checked.validate("publication", publication);
    assertThat(checked.validateAndCanonical("publication", publication).equals(expected)).isTrue();
    assertThat(
            checked
                .validateAndCanonical("v3/publication", publication)
                .getBytes(StandardCharsets.UTF_8))
        .isEqualTo(expected.getBytes(StandardCharsets.UTF_8));
    assertThat(publication.toString().equals(before)).isTrue();
    ObjectNode invalid = publication.deepCopy().put("unexpected", true);
    assertThatThrownBy(() -> checked.validate("publication", invalid))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> checked.validateAndCanonical("publication", invalid))
        .hasMessage("INVALID_CONTRACT");
    ObjectNode nonCanonical = publication.deepCopy().put("schemaVersion", 3.5);
    assertThatThrownBy(() -> checked.validate("publication", nonCanonical))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> checked.validateAndCanonical("publication", nonCanonical))
        .hasMessage("INVALID_CONTRACT");

    var independent = fixture("fresh-order-reference");
    ObjectNode request =
        checked
            .object()
            .put("schemaVersion", 3)
            .put("attemptId", "00000000-0000-4000-8000-000000000001")
            .put("claimId", "00000000-0000-4000-8000-000000000002")
            .put("snapshotHash", "a".repeat(64))
            .put("basisHash", hash(independent.path("basis")));
    request.set("requiredProfile", independent.path("artifact").path("profile").deepCopy());
    request.set(
        "requiredBuild",
        checked
            .object()
            .put("profileHash", hash(request.path("requiredProfile")))
            .put("schemaBundleHash", "b".repeat(64))
            .put("referenceBundleHash", "c".repeat(64))
            .put("executableImageDigest", "d".repeat(64))
            .put("chromiumBuild", "synthetic-component"));
    request.set("artifact", independent.path("artifact").deepCopy());
    request.set("validationBasis", independent.path("basis").deepCopy());
    ObjectNode retained = request.deepCopy();
    String representation = request.toString();
    byte[] originalBytes = GuidedContracts.canonical(request).getBytes(StandardCharsets.UTF_8);
    byte[] reusedBytes =
        checked
            .validateAndCanonical("v3/replay-validation", request)
            .getBytes(StandardCharsets.UTF_8);
    assertThat(reusedBytes).isEqualTo(originalBytes);
    assertThat(request.equals(retained)).isTrue();
    assertThat(request.toString().equals(representation)).isTrue();
    var nodes = new java.util.ArrayDeque<JsonNode[]>();
    nodes.add(new JsonNode[] {retained, request});
    while (!nodes.isEmpty()) {
      JsonNode[] pair = nodes.removeFirst();
      assertThat(pair[0].getClass() == pair[1].getClass()).isTrue();
      if (pair[0].isObject()) {
        pair[0]
            .fields()
            .forEachRemaining(
                field -> nodes.add(new JsonNode[] {field.getValue(), pair[1].get(field.getKey())}));
      } else if (pair[0].isArray()) {
        for (int i = 0; i < pair[0].size(); i++) {
          nodes.add(new JsonNode[] {pair[0].get(i), pair[1].get(i)});
        }
      }
    }

    var http = org.mockito.Mockito.mock(java.net.http.HttpClient.class);
    org.mockito.Mockito.when(http.followRedirects())
        .thenReturn(java.net.http.HttpClient.Redirect.NEVER);
    var tokenCalls = new java.util.concurrent.atomic.AtomicInteger();
    var client =
        new ObservedValidationClient(
            java.net.URI.create("http://localhost"),
            http,
            () -> {
              tokenCalls.incrementAndGet();
              return "controlled-local-token";
            },
            checked,
            new GuidedPublicationProperties(true, 3, 15000, 5000, 8388608));
    org.mockito.Mockito.clearInvocations(http);
    var now = Instant.parse("2026-10-12T12:00:00Z");
    var expired =
        new PublicationBudget(
            now.minusMillis(1), java.time.Clock.fixed(now, java.time.ZoneOffset.UTC));
    assertThatThrownBy(() -> client.validate(request, expired)).hasMessage("EXPIRED");
    assertThat(tokenCalls.get()).isEqualTo(1);
    assertThatThrownBy(() -> client.validate(request.deepCopy().put("unexpected", true), expired))
        .hasMessage("INVALID_CONTRACT");
    assertThat(tokenCalls.get()).isEqualTo(1);
    var tight =
        new ObservedValidationClient(
            java.net.URI.create("http://localhost"),
            http,
            () -> {
              tokenCalls.incrementAndGet();
              return "controlled-local-token";
            },
            checked,
            new GuidedPublicationProperties(true, 3, 15000, 5000, 1));
    org.mockito.Mockito.clearInvocations(http);
    assertThatThrownBy(() -> tight.validate(request, expired)).hasMessage("BUDGET_EXCEEDED");
    assertThat(tokenCalls.get()).isEqualTo(1);
    org.mockito.Mockito.verifyNoInteractions(http);
  }

  @Test
  void unsupportedNullCanonicalDependencyRetainsOriginalValidationAndBudgetOrder()
      throws Exception {
    var checked = org.mockito.Mockito.spy(new GuidedContracts());
    org.mockito.Mockito.doReturn(null)
        .when(checked)
        .validateAndCanonical(
            org.mockito.ArgumentMatchers.eq("v3/replay-validation"),
            org.mockito.ArgumentMatchers.any());
    var http = org.mockito.Mockito.mock(java.net.http.HttpClient.class);
    org.mockito.Mockito.when(http.followRedirects())
        .thenReturn(java.net.http.HttpClient.Redirect.NEVER);
    var client =
        new ObservedValidationClient(
            java.net.URI.create("http://localhost"),
            http,
            () -> "controlled-local-token",
            checked,
            new GuidedPublicationProperties(true, 3, 15000, 5000, 8388608));
    var now = Instant.parse("2026-10-12T12:00:00Z");
    var expired =
        new PublicationBudget(
            now.minusMillis(1), java.time.Clock.fixed(now, java.time.ZoneOffset.UTC));
    org.mockito.Mockito.clearInvocations(http);
    assertThatThrownBy(() -> client.validate(checked.object(), expired))
        .hasMessage("INVALID_CONTRACT");
    // Existing void-path refusal stub must still win over an already-expired budget.
    org.mockito.Mockito.doThrow(new GuidedSessionException("INVALID_CONTRACT", 422))
        .when(checked)
        .validate(
            org.mockito.ArgumentMatchers.eq("v3/replay-validation"),
            org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.clearInvocations(http);
    assertThatThrownBy(() -> client.validate(checked.object(), expired))
        .hasMessage("INVALID_CONTRACT");
    org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(2))
        .validate(
            org.mockito.ArgumentMatchers.eq("v3/replay-validation"),
            org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verifyNoInteractions(http);
  }

  @Test
  void separateOwnedLoweringCopiesRetainCutAndIndependentArtifact() throws Exception {
    for (String name : List.of("fresh-order-reference", "control-value-reference")) {
      var independent = fixture(name);
      ObjectNode retainedBasis = copy(independent.path("basis"));
      ObjectNode retainedProfile = copy(independent.path("artifact").path("profile"));
      String basisRepresentation = retainedBasis.toString();
      String profileRepresentation = retainedProfile.toString();
      ObjectNode loweringBasis = retainedBasis.deepCopy();
      ObjectNode loweringProfile = retainedProfile.deepCopy();
      var candidate = new ObservedArtifactLowerer(C).lower(loweringBasis, loweringProfile);
      assertThat(retainedBasis.toString().equals(basisRepresentation)).isTrue();
      assertThat(retainedProfile.toString().equals(profileRepresentation)).isTrue();
      assertThat(loweringBasis.equals(retainedBasis)).isTrue();
      assertThat(loweringProfile.equals(retainedProfile)).isTrue();
      assertThat(candidate.artifact().equals(independent.path("artifact"))).isTrue();
      loweringBasis.remove("scope");
      loweringProfile.put("testOnlyAfterLowering", true);
      assertThat(retainedBasis.toString().equals(basisRepresentation)).isTrue();
      assertThat(retainedProfile.toString().equals(profileRepresentation)).isTrue();
      assertThat(candidate.artifact().equals(independent.path("artifact"))).isTrue();
    }
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"matched", "build", "representation", "invalid", "runtime", "fatal", "ambient"})
  void publicPublisherUsesOnlyMatchingDetachedSuccessWithFreshInputs(String mode) throws Exception {
    // Complete existing Original input, with honest current synthetic schema provenance.
    var original =
        new GuidedPlanBuilderTest.Original(fixture("fresh-order-reference").path("basis"));
    ObjectNode schemaPins =
        new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(C)
            .schemaProvenance();
    object(original.raw, "sourceManifest").set("schemaPins", schemaPins);
    String manifestHash = hash(original.raw.path("sourceManifest"));
    original.base.put("sourceManifestHash", manifestHash);
    original.expected.put("sourceManifestHash", manifestHash);
    original.expected.set(
        "learningProvenance",
        new GuidedPlanBuilder(C).learningProvenance(original.raw.path("sourceManifest")));
    var now = Instant.parse("2026-10-12T12:00:00Z");
    original.session.put("state", "FINALIZING").put("expiresAt", now.plusSeconds(300).toString());
    object(original.session, "owner").put("leaseExpiresAt", now.plusSeconds(3).toString());
    String id = original.session.path("sessionId").asText();
    ObjectNode profile = copy(fixture("fresh-order-reference").path("artifact").path("profile"));
    ObjectNode selection = C.object();
    selection.set("profile", profile);
    selection.set(
        "build",
        C.object()
            .put("profileHash", hash(profile))
            .put("schemaBundleHash", "b".repeat(64))
            .put("referenceBundleHash", "c".repeat(64))
            .put("executableImageDigest", "d".repeat(64))
            .put("chromiumBuild", "synthetic-component"));
    var depth = new java.util.concurrent.atomic.AtomicInteger();
    var callbacks = new java.util.concurrent.atomic.AtomicInteger();
    var pinCalls = new java.util.concurrent.atomic.AtomicInteger();
    var learnedPlanDepths = new java.util.ArrayList<Integer>();
    var basisDepths = new java.util.ArrayList<Integer>();
    var pinDepths = new java.util.ArrayList<Integer>();
    var sourceReadDepths = new java.util.ArrayList<Integer>();
    var evidenceReadDepths = new java.util.ArrayList<Integer>();
    var currentGuardDepths = new java.util.ArrayList<Integer>();
    var lastSessionRead = new java.util.concurrent.atomic.AtomicReference<ObjectNode>();
    var captured = new java.util.concurrent.atomic.AtomicReference<PublicationContracts.Claim>();
    var checked = org.mockito.Mockito.spy(new GuidedContracts());
    org.mockito.Mockito.doAnswer(
            invocation -> {
              learnedPlanDepths.add(depth.get());
              return invocation.callRealMethod();
            })
        .when(checked)
        .validate(
            org.mockito.ArgumentMatchers.eq("v3/learned-plan"), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(
            invocation -> {
              basisDepths.add(depth.get());
              int expectedDepth = callbacks.get() == 2 && !mode.equals("ambient") ? 0 : 1;
              assertThat(depth.get()).isEqualTo(expectedDepth);
              return invocation.callRealMethod();
            })
        .when(checked)
        .validate(org.mockito.ArgumentMatchers.eq("v3/ledger"), org.mockito.ArgumentMatchers.any());
    var sessions =
        org.mockito.Mockito.mock(
            com.citi.put.checks.studio.guided.session.GuidedSessionRepository.class);
    org.mockito.Mockito.when(sessions.transaction(org.mockito.ArgumentMatchers.any()))
        .thenAnswer(
            invocation -> {
              int ordinal = callbacks.incrementAndGet();
              int actualPrepare = mode.equals("ambient") ? 2 : 3;
              if (ordinal == actualPrepare) {
                object(original.session, "owner")
                    .put("leaseExpiresAt", now.plusSeconds(8).toString());
                if (mode.equals("invalid")) {
                  object(object(original.raw, "sourceManifest"), "schemaPins")
                      .put("strictSchemaHash", "invalid-provenance");
                }
              }
              depth.incrementAndGet();
              try {
                Object result = ((java.util.function.Supplier<?>) invocation.getArgument(0)).get();
                if (ordinal == 2 && !mode.equals("ambient")) {
                  // A caller retaining the read node cannot change the detached capture.
                  lastSessionRead.get().put("scopeHash", "changed-after-capture");
                }
                return result;
              } finally {
                depth.decrementAndGet();
              }
            });
    org.mockito.Mockito.when(sessions.lock(id))
        .thenAnswer(
            invocation -> {
              ObjectNode document = original.session.deepCopy();
              lastSessionRead.set(document);
              return new com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session(
                  document, C.object());
            });
    var bases = org.mockito.Mockito.mock(GuidedPublicationBaseRepository.class);
    org.mockito.Mockito.when(bases.find(id))
        .thenAnswer(
            invocation -> java.util.Optional.of(new PublicationContracts.Base(original.base)));
    org.mockito.Mockito.when(bases.lockCurrent(org.mockito.ArgumentMatchers.any()))
        .thenAnswer(
            invocation -> {
              sourceReadDepths.add(depth.get());
              assertThat(depth.get()).isEqualTo(1);
              return new PublicationContracts.CurrentSource(original.current);
            });
    var evidence = org.mockito.Mockito.mock(GuidedPublicationEvidenceRepository.class);
    org.mockito.Mockito.when(evidence.read(id))
        .thenAnswer(
            invocation -> {
              evidenceReadDepths.add(depth.get());
              assertThat(depth.get()).isEqualTo(1);
              return new PublicationContracts.Evidence(original.raw);
            });
    var pins = org.mockito.Mockito.mock(ObservedReplayPins.class);
    var fatal = new AssertionError("fixed-optional-fatal");
    org.mockito.Mockito.when(pins.selected())
        .thenAnswer(
            invocation -> {
              pinDepths.add(depth.get());
              int ordinal = pinCalls.incrementAndGet();
              if (ordinal == 1 && mode.equals("runtime")) {
                throw new IllegalStateException("fixed-optional-unavailable");
              }
              if (ordinal == 1 && mode.equals("fatal")) {
                throw fatal;
              }
              if (ordinal == 2 && mode.equals("build")) {
                object(selection, "build").put("chromiumBuild", "synthetic-current-build");
              }
              if (ordinal == 2 && mode.equals("representation")) {
                // STUDIO-OBS-012A: the profile is the one-key {contract:3}, so the
                // representation-only reorder moves the first build member instead.
                ObjectNode build = object(selection, "build");
                var first = build.fieldNames().next();
                var unchangedValue = build.remove(first);
                build.set(first, unchangedValue);
              }
              return selection.deepCopy();
            });
    var publications = org.mockito.Mockito.mock(GuidedPublicationRepository.class);
    org.mockito.Mockito.when(publications.receipt(id)).thenReturn(java.util.Optional.empty());
    org.mockito.Mockito.when(
            publications.reserve(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
        .thenAnswer(
            invocation -> {
              captured.set(invocation.getArgument(0));
              throw new GuidedSessionException("BUDGET_EXCEEDED", 429);
            });
    var access =
        org.mockito.Mockito.mock(
            com.citi.put.checks.studio.guided.session.GuidedSessionAccess.class);
    org.mockito.Mockito.doAnswer(
            invocation -> {
              assertThat(depth.get())
                  .isZero(); // Logical supplied callback depth, not physical JDBC TX.
              return null;
            })
        .when(access)
        .checkUser(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(
            invocation -> {
              currentGuardDepths.add(depth.get());
              assertThat(depth.get()).isEqualTo(1);
              return null;
            })
        .when(access)
        .checkCurrent(org.mockito.ArgumentMatchers.any());
    var validator = org.mockito.Mockito.mock(ObservedValidationClient.class);
    var publisher =
        new GuidedPlanPublisher(
            sessions,
            org.mockito.Mockito.mock(
                com.citi.put.checks.studio.guided.session.GuidedSessionService.class),
            bases,
            evidence,
            publications,
            checked,
            pins,
            validator,
            org.mockito.Mockito.mock(GuidedPublicationAuthorization.class),
            access,
            new GuidedPublicationProperties(true, 3, 15000, 5000, 8388608),
            new ObservedReplayProperties(
                true, 30000, 1048576, 4194304, 2097152, "[]", "[]", 1280, 720),
            java.time.Clock.fixed(now, java.time.ZoneOffset.UTC));
    ObjectNode body =
        C.object()
            .put("schemaVersion", 3)
            .put("expectedSourceRevision", original.base.path("sourceRevision").asText())
            .put(
                "expectedConfigurationRevision",
                original.base.path("configurationRevision").asText());
    boolean priorActive =
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive();
    try {
      if (mode.equals("ambient")) {
        org.springframework.transaction.support.TransactionSynchronizationManager
            .setActualTransactionActive(true);
      }
      var assertion =
          assertThatThrownBy(
              () ->
                  publisher.finalizeForUser(
                      org.mockito.Mockito.mock(
                          org.springframework.security.core.Authentication.class),
                      new org.springframework.mock.web.MockHttpServletRequest(),
                      id,
                      "component-finalize",
                      body));
      if (mode.equals("fatal")) {
        assertion.isSameAs(fatal);
      } else {
        assertion.hasMessage(mode.equals("invalid") ? "EVIDENCE_MISMATCH" : "BUDGET_EXCEEDED");
      }
    } finally {
      org.springframework.transaction.support.TransactionSynchronizationManager
          .setActualTransactionActive(priorActive);
    }
    assertThat(depth.get()).isZero();
    assertThat(basisDepths).isNotEmpty();
    if (mode.equals("ambient")) {
      assertThat(basisDepths).containsOnly(1);
    } else {
      assertThat(basisDepths.getFirst()).isZero();
      if (!mode.equals("invalid") && !mode.equals("fatal")) {
        assertThat(basisDepths).contains(1);
      }
    }
    assertThat(pinDepths)
        .containsExactlyElementsOf(
            mode.equals("ambient")
                ? List.of(1)
                : mode.equals("invalid") || mode.equals("fatal") ? List.of(0) : List.of(0, 1));
    int guardedPasses = mode.equals("ambient") || mode.equals("fatal") ? 1 : 2;
    var guardedDepths = java.util.Collections.nCopies(guardedPasses, 1);
    assertThat(sourceReadDepths).containsExactlyElementsOf(guardedDepths);
    assertThat(evidenceReadDepths).containsExactlyElementsOf(guardedDepths);
    assertThat(currentGuardDepths).containsExactlyElementsOf(guardedDepths);
    org.mockito.Mockito.verify(bases, org.mockito.Mockito.times(guardedPasses))
        .requireCurrent(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verifyNoInteractions(validator);
    org.mockito.Mockito.verify(sessions, org.mockito.Mockito.never())
        .save(org.mockito.ArgumentMatchers.any());
    if (mode.equals("invalid") || mode.equals("fatal")) {
      assertThat(captured.get()).isNull();
      assertThat(learnedPlanDepths)
          .containsExactlyElementsOf(mode.equals("invalid") ? List.of(0) : List.of());
      org.mockito.Mockito.verify(publications, org.mockito.Mockito.never())
          .reserve(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    } else {
      assertThat(captured.get()).isNotNull();
      assertThat(learnedPlanDepths)
          .containsExactlyElementsOf(
              mode.equals("matched")
                  ? List.of(0)
                  : mode.equals("runtime") || mode.equals("ambient") ? List.of(1) : List.of(0, 1));
      // Honest freshly reconstructed synthetic input, not the original opaque golden provenance.
      ObjectNode freshBasis = original.build();
      var reference = new ObservedArtifactLowerer(C).lower(freshBasis, profile);
      assertThat(captured.get().snapshot().basis().equals(freshBasis)).isTrue();
      for (String key :
          List.of(
              "learnedPlanHash",
              "artifactHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash",
              "profileHash")) {
        assertThat(
                captured.get().snapshot().identity().path(key).equals(reference.hashes().path(key)))
            .isTrue();
      }
      assertThat(captured.get().snapshot().identity().path("validationBuildHash").asText())
          .isEqualTo(hash(selection.path("build")));
      assertThat(captured.get().snapshot().identity().path("validationDeadline").asText())
          .isEqualTo(PublicationContracts.time(now.plusSeconds(8)));
      assertThat(captured.get().snapshot().identity().path("ownerFence"))
          .isEqualTo(original.session.path("owner").path("fence"));
      org.mockito.Mockito.verify(publications)
          .reserve(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
    if (mode.equals("ambient")) {
      assertThat(callbacks.get()).isEqualTo(2);
      assertThat(pinCalls.get()).isEqualTo(1);
      org.mockito.Mockito.verify(evidence).read(id);
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"fresh-order-reference", "control-value-reference"})
  void reproducesIndependentNodeArtifactAndEveryCanonicalHash(String name) throws Exception {
    var original = fixture(name);
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(original.path("basis"), original.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(original.path("artifact"));
    assertThat(candidate.learnedPlan()).isEqualTo(original.path("artifact").path("learnedPlan"));
    assertThat(candidate.policy()).isEqualTo(original.path("artifact").path("replayPolicy"));
    for (var fields = original.path("hashes").fields(); fields.hasNext(); ) {
      var entry = fields.next();
      assertThat(candidate.hashes().path(entry.getKey()))
          .as(entry.getKey())
          .isEqualTo(entry.getValue());
    }
    assertThat(hash(candidate.artifact()))
        .isEqualTo(original.path("hashes").path("artifactHash").asText());
    assertThat(candidate.artifact().path("guards").get(0).path("target"))
        .isEqualTo(C.parse("{\"kind\":\"initialBlank\"}"));
    assertThat(
            candidate
                .artifact()
                .path("steps")
                .get(1)
                .path("operations")
                .get(0)
                .path("operation")
                .path("kind")
                .asText())
        .isEqualTo("read");
    assertThat(
            candidate
                .artifact()
                .path("steps")
                .get(2)
                .path("operations")
                .get(0)
                .path("operation")
                .path("value")
                .path("kind")
                .asText())
        .isEqualTo("binding");
  }

  @Test
  void reproducesIndependentCanonicalUnicodeAndNumericVectors() throws Exception {
    var vectors =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json")));
    for (JsonNode vector : vectors.path("positive")) {
      assertThat(
              HexFormat.of()
                  .formatHex(
                      GuidedContracts.canonical(vector.path("input"))
                          .getBytes(StandardCharsets.UTF_8)))
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("canonicalUtf8Hex").asText());
      assertThat(GuidedContracts.hash(vector.path("input")))
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("sha256").asText());
      assertThat(hash(vector.path("input"))).isEqualTo(vector.path("sha256").asText());
    }
  }

  @Test
  void recipeBoundariesAndAuthoritativePlacementAreNotSilentlyNormalized() throws Exception {
    var original = fixture("fresh-order-reference").path("basis");
    var lowerer = new ObservedArtifactLowerer(C);
    var split = copy(original);
    var label = at(split, "inputs", 1);
    String source = split.path("sourceSteps").get(2).path("source").asText();
    int middle = source.indexOf("🧪") + 1;
    object(label, "provenance").put("startUtf16", middle).put("endUtf16", middle + 1);
    assertThatThrownBy(() -> lowerer.recipes(split)).isInstanceOf(GuidedSessionException.class);
    var duplicate = copy(original);
    array(duplicate, "inputs").add(duplicate.path("inputs").get(0).deepCopy());
    assertThatThrownBy(() -> lowerer.recipes(duplicate)).isInstanceOf(GuidedSessionException.class);
    var sameMeaning = copy(original);
    var extra = copy(sameMeaning.path("inputs").get(0)).put("inputId", "invented-input");
    array(sameMeaning, "inputs").add(extra);
    assertThatThrownBy(() -> lowerer.recipes(sameMeaning))
        .isInstanceOf(GuidedSessionException.class);
    var wrongStep = copy(original);
    object(at(wrongStep, "inputs", 0), "provenance")
        .put("stepId", wrongStep.path("sourceSteps").get(1).path("stepId").asText());
    assertThatThrownBy(() -> lowerer.recipes(wrongStep)).isInstanceOf(GuidedSessionException.class);
    var wrongSlot = copy(original);
    object(at(wrongSlot, "inputs", 1), "provenance").put("intendedSlot", "assert.expected");
    assertThatThrownBy(() -> lowerer.recipes(wrongSlot)).isInstanceOf(GuidedSessionException.class);
    JsonNode configured =
        C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
            .path("controlValueReferenceUsedConfiguration");
    assertThat(configured.path("basis").path("configurationReferences")).hasSize(1);
    assertThat(
            lowerer
                .lower(configured.path("basis"), configured.path("artifact").path("profile"))
                .artifact())
        .isEqualTo(configured.path("artifact"));
    assertThat(lowerer.recipes(configured.path("basis")))
        .isEqualTo(configured.path("artifact").path("inputRecipes"));
    var wrongConfig = copy(configured.path("basis"));
    at(wrongConfig, "configurationReferences", 0).put("referenceId", "different-saved-reference");
    assertThatThrownBy(() -> lowerer.recipes(wrongConfig))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void policyUsesOriginalAdmissionTupleHashAndSeparateEvidenceBundle() throws Exception {
    var original = fixture("fresh-order-reference");
    var basis = original.path("basis");
    var policy =
        new ObservedReferencePolicyDeriver(C)
            .derive(
                basis,
                original.path("artifact").path("learnedPlan"),
                original.path("artifact").path("inputRecipes"));
    assertThat(policy).isEqualTo(original.path("artifact").path("replayPolicy"));
    var tuples = C.object().putArray("items");
    for (JsonNode fact : basis.path("actions")) {
      var tuple = C.object();
      for (String key : List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        tuple.set(key, fact.path("ledger").path(key));
      }
      tuples.add(tuple);
    }
    assertThat(policy.path("admissionProvenanceHash").asText()).isEqualTo(hash(tuples));
    assertThat(policy.path("publicationEvidenceHash"))
        .isNotEqualTo(policy.path("admissionProvenanceHash"));
    var changed = copy(basis);
    object(changed, "learningProvenance").put("outputContractHash", "f".repeat(64));
    var next =
        new ObservedReferencePolicyDeriver(C)
            .derive(
                changed,
                original.path("artifact").path("learnedPlan"),
                original.path("artifact").path("inputRecipes"));
    assertThat(next.path("admissionProvenanceHash"))
        .isEqualTo(policy.path("admissionProvenanceHash"));
    assertThat(next.path("publicationEvidenceHash"))
        .isNotEqualTo(policy.path("publicationEvidenceHash"));
  }

  @Test
  void correctedCompleteBasisPreimagesKeepExactlyTheOriginalEvidenceEnvelope() throws Exception {
    JsonNode root =
        C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
            .path("incrementalContracts");
    for (int index = 0; index < 2; index++) {
      JsonNode parent = root.path("basisCases").get(index), basis = parent.path("basis");
      JsonNode before = basis.deepCopy(), expectedArtifact = parent.path("expectedArtifact");
      JsonNode basisVector = root.path("canonicalVectors").get(index == 0 ? 24 : 27);
      JsonNode evidenceVector = root.path("canonicalVectors").get(index == 0 ? 25 : 28);
      assertThat(basisVector.path("name").asText())
          .isEqualTo(
              index == 0
                  ? "complete-extended-validation-basis"
                  : "complete-incremental-boundary-validation-basis");
      assertThat(evidenceVector.path("name").asText())
          .isEqualTo(
              index == 0
                  ? "publication-evidence-preimage"
                  : "incremental-publication-evidence-preimage");
      assertThat(basis).isEqualTo(basisVector.path("input"));
      assertThat(canonical(basis)).isEqualTo(basisVector.path("canonical").asText());
      assertThat(hash(basis)).isEqualTo(basisVector.path("sha256").asText());
      ObjectNode expectedPreimage =
          C.object()
              .put("version", 1)
              .put("basisHash", hash(basis))
              .put("runAuthorizationHash", hash(basis.path("runAuthorization")))
              .put("translationHash", basis.path("translationHash").asText())
              .put("bootstrapHash", hash(basis.path("bootstrap")))
              .put("sourceManifestHash", basis.path("sourceManifestHash").asText());
      assertThat(expectedPreimage).hasSize(6).isEqualTo(evidenceVector.path("input"));
      assertThat(canonical(expectedPreimage)).isEqualTo(evidenceVector.path("canonical").asText());
      assertThat(
              HexFormat.of()
                  .formatHex(canonical(expectedPreimage).getBytes(StandardCharsets.UTF_8)))
          .isEqualTo(evidenceVector.path("canonicalUtf8Hex").asText());
      assertThat(hash(expectedPreimage)).isEqualTo(evidenceVector.path("sha256").asText());
      JsonNode actual =
          new ObservedArtifactLowerer(C).lower(basis, expectedArtifact.path("profile")).artifact();
      assertThat(actual).isEqualTo(expectedArtifact);
      assertThat(actual.path("replayPolicy").path("publicationEvidenceHash").asText())
          .isEqualTo(evidenceVector.path("sha256").asText());
      for (String field :
          List.of(
              "version",
              "basisHash",
              "runAuthorizationHash",
              "translationHash",
              "bootstrapHash",
              "sourceManifestHash")) {
        ObjectNode omitted = expectedPreimage.deepCopy();
        omitted.remove(field);
        assertThat(hash(omitted))
            .as("original envelope cannot omit %s", field)
            .isNotEqualTo(evidenceVector.path("sha256").asText());
      }
      ObjectNode wrapper = C.object();
      wrapper.set("publicationEvidence", expectedPreimage);
      assertThat(hash(wrapper)).isNotEqualTo(evidenceVector.path("sha256").asText());
      ObjectNode versionTwo = expectedPreimage.deepCopy().put("version", 2);
      assertThat(hash(versionTwo)).isNotEqualTo(evidenceVector.path("sha256").asText());
      assertThat(basis).isEqualTo(before);
    }
  }

  @ParameterizedTest(name = "exact tuple array and final plan commitments {0}")
  @ValueSource(ints = {0, 1, 2})
  void effectiveAdmissionArrayAndFinalPlanHaveTheirExactIndependentPreimages(int parentIndex)
      throws Exception {
    JsonNode root =
        C.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")))
            .path("incrementalContracts");
    JsonNode parent = root.path("basisCases").get(parentIndex), basis = parent.path("basis");
    JsonNode before = basis.deepCopy(), artifact = parent.path("expectedArtifact");
    JsonNode frozenTuples = root.path("canonicalVectors").get(26);
    assertThat(frozenTuples.path("name").asText())
        .isEqualTo("effective-admission-provenance-array");
    var tuples = C.object().putArray("items");
    for (JsonNode action : basis.path("actions")) {
      ObjectNode tuple = tuples.addObject();
      for (String field : List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        tuple.set(field, action.path("ledger").path(field).deepCopy());
      }
    }
    assertThat(tuples).isEqualTo(frozenTuples.path("input"));
    assertThat(canonical(tuples)).isEqualTo(frozenTuples.path("canonical").asText());
    assertThat(HexFormat.of().formatHex(canonical(tuples).getBytes(StandardCharsets.UTF_8)))
        .isEqualTo(frozenTuples.path("canonicalUtf8Hex").asText());
    assertThat(hash(tuples)).isEqualTo(frozenTuples.path("sha256").asText());
    ObjectNode wrappedTuples = C.object();
    wrappedTuples.set("admissions", tuples.deepCopy());
    assertThat(hash(wrappedTuples)).isNotEqualTo(frozenTuples.path("sha256").asText());
    JsonNode actual =
        new ObservedArtifactLowerer(C).lower(basis, artifact.path("profile")).artifact();
    assertThat(actual).isEqualTo(artifact);
    assertThat(actual.path("replayPolicy").path("admissionProvenanceHash").asText())
        .isEqualTo(frozenTuples.path("sha256").asText())
        .isNotEqualTo(hash(wrappedTuples));
    JsonNode expectedPlan = artifact.path("learnedPlan");
    assertThat(actual.path("learnedPlan")).isEqualTo(expectedPlan);
    assertThat(actual.path("learnedPlanHash").asText()).isEqualTo(hash(expectedPlan));
    assertThat(actual.path("replayPolicy").path("learnedPlanHash").asText())
        .isEqualTo(hash(expectedPlan));
    for (String field : List.of("stepSnapshotHashes", "reusedFrom", "incremental")) {
      assertThat(expectedPlan.has(field)).as("final plan contains %s", field).isTrue();
      ObjectNode premature = expectedPlan.deepCopy();
      premature.remove(field);
      assertThat(hash(premature))
          .as("final hash must include derived %s", field)
          .isNotEqualTo(actual.path("learnedPlanHash").asText());
    }
    if (parentIndex == 2) {
      JsonNode excluded = basis.path("incrementalEvidence").path("excludedAttempts");
      assertThat(excluded).hasSize(1);
      JsonNode failedLedger = excluded.get(0).path("action").path("ledger");
      assertThat(failedLedger.path("admission").path("admissionId").asText())
          .isEqualTo("admission-spent");
      assertThat(failedLedger.path("state").asText()).isEqualTo("FAILED");
      assertThat(canonical(tuples)).doesNotContain("admission-spent");
      var withSpent = tuples.deepCopy();
      ObjectNode spentTuple = withSpent.addObject();
      for (String field : List.of("coordinate", "admission", "operationHash", "scopeHash")) {
        spentTuple.set(field, failedLedger.path(field).deepCopy());
      }
      assertThat(hash(withSpent)).isNotEqualTo(frozenTuples.path("sha256").asText());
      ObjectNode erasedHistory = basis.deepCopy();
      ((ObjectNode) erasedHistory.path("incrementalEvidence")).putArray("excludedAttempts");
      assertThat(hash(erasedHistory)).isNotEqualTo(hash(basis));
      // Erasing history changes the raw commitment; it is not a valid semantic control.
    }
    assertThat(basis).isEqualTo(before);
  }

  @Test
  void lawfulJoinedSemanticBasisAcceptsExactlySixMiBBeforeOneLegalByteIsRefused() throws Exception {
    var parent = IncrementalBoundaryFixture.exact();
    ObjectNode basis = parent.basis(), basisBefore = basis.deepCopy();
    JsonNode expected = parent.artifact(), expectedBefore = expected.deepCopy();
    assertThat(PublicationContracts.MAX_BASIS_BYTES).isEqualTo(6_291_456);
    assertThat(PublicationContracts.MAX_VALIDATION_BYTES).isEqualTo(8_388_608);
    assertThat(IncrementalBoundaryFixture.bytes(basis)).isEqualTo(6_291_456);
    assertThat(GuidedContracts.canonical(basis).getBytes(StandardCharsets.UTF_8).length)
        .isEqualTo(6_291_456);
    assertThat(parent.baselineBytes() + 100 * parent.intentBytes() + parent.residue())
        .isEqualTo(6_291_456);
    assertThat(parent.residue()).isBetween(0, 99);
    assertBoundaryComponentsAndCompleteJoins(parent);
    assertThat(IncrementalBoundaryFixture.bytes(expected)).isLessThanOrEqualTo(1_048_576);
    assertThat(IncrementalBoundaryFixture.bytes(expected.path("replayPolicy")))
        .isLessThanOrEqualTo(524_288);
    ObjectNode oversized = IncrementalBoundaryFixture.plusOne(parent),
        oversizedBefore = oversized.deepCopy();
    assertThat(IncrementalBoundaryFixture.bytes(oversized)).isEqualTo(6_291_457);
    // The +1 is legal safeLabel text, with all model/capture/context/receipt hashes resealed.
    C.validate("v3/replay-validation#/definitions/ValidationBasis", oversized);
    var checked = org.mockito.Mockito.spy(new GuidedContracts());
    var lowerer = new ObservedArtifactLowerer(checked);
    var hashCalls = new java.util.concurrent.atomic.AtomicInteger();
    try (var hashes =
        org.mockito.Mockito.mockStatic(
            GuidedContracts.class,
            invocation -> {
              if (invocation.getMethod().getName().equals("hash")) {
                hashCalls.incrementAndGet();
              }
              return invocation.callRealMethod();
            })) {
      var accepted = lowerer.lower(basis, expected.path("profile"));
      assertThat(accepted.artifact()).isEqualTo(expected);
      assertThat(accepted.hashes()).isEqualTo(parent.hashes());
      assertThat(hashCalls.get())
          .as("positive parent observes actual semantic hashing through this hook")
          .isPositive();
      org.mockito.Mockito.verify(checked)
          .validate(
              org.mockito.ArgumentMatchers.eq("v3/replay-validation#/definitions/ValidationBasis"),
              org.mockito.ArgumentMatchers.same(basis));
      hashCalls.set(0);
      org.mockito.Mockito.clearInvocations(checked);
      assertThatThrownBy(() -> lowerer.lower(oversized, expected.path("profile")))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal.getMessage()).isEqualTo("BUDGET_EXCEEDED");
                assertThat(refusal.status()).isEqualTo(413);
              });
      assertThat(hashCalls.get()).as("+1 refused before semantic hashing").isZero();
      org.mockito.Mockito.verify(checked, org.mockito.Mockito.never())
          .validate(
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.any(JsonNode.class));
    }
    assertThat(basis).isEqualTo(basisBefore);
    assertThat(expected).isEqualTo(expectedBefore);
    assertThat(oversized).isEqualTo(oversizedBefore);
    // This pure lowerer has no dispatch, JDBC, HTTP, callback, native or model dependency.
    // Actual raw 8 MiB HTTP exact/+1 is a separate runner route obligation.
  }

  private static void assertBoundaryComponentsAndCompleteJoins(
      IncrementalBoundaryFixture.Parent parent) {
    JsonNode basis = parent.basis();
    for (String field :
        List.of("sourceSteps", "actions", "preparations", "obligationAssociations")) {
      assertThat(basis.path(field)).as(field).hasSize(100);
    }
    assertThat(basis.at("/translationPlan/obligations")).hasSize(100);
    assertThat(basis.path("observations")).hasSize(198);
    for (String field :
        List.of("allocations", "producers", "consumerEdges", "bindings", "transfers")) {
      assertThat(basis.path(field)).as(field).isEmpty();
    }
    assertThat(basis.at("/materializationEvidence/versions")).hasSize(1);
    assertThat(basis.at("/materializationEvidence/entries")).hasSize(1);
    assertThat(basis.at("/snapshotEvidence/baseProof").isNull()).isTrue();
    assertThat(basis.at("/snapshotEvidence/pinnedBase").isObject()).isTrue();
    assertThat(basis.at("/incrementalEvidence/switch/reason").asText()).isEqualTo("EMPTY_PREFIX");
    assertThat(basis.at("/incrementalEvidence/program/actions")).isEmpty();
    assertThat(basis.at("/incrementalEvidence/program/sourceStepIds")).isEmpty();
    assertThat(basis.at("/incrementalEvidence/prefixRequests")).isEmpty();
    assertThat(basis.at("/incrementalEvidence/excludedAttempts")).isEmpty();
    C.validate("v3/authored-inputs", parent.privateInputs());
    assertThat(hash(parent.privateInputs())).isEqualTo(basis.path("authoredInputsHash").asText());
    JsonNode privateInput = parent.privateInputs().path("inputs").get(0);
    assertThat(hash(privateInput))
        .isEqualTo(basis.at("/materializationEvidence/entries/0/inputHash").asText());
    ObjectNode safeInput = privateInput.deepCopy();
    safeInput.remove("value");
    assertThat(safeInput).isEqualTo(basis.at("/materializationEvidence/entries/0/metadata"));
    var observations = new java.util.LinkedHashMap<String, JsonNode>();
    int observationBytes = 0, sourceBytes = 0;
    for (JsonNode row : basis.path("observations")) {
      int bytes = IncrementalBoundaryFixture.bytes(row.path("observation"));
      assertThat(bytes).isLessThanOrEqualTo(32_768);
      observationBytes += bytes;
      C.validate("v3/observation", row.path("observation"));
      assertThat(row.path("observation").path("nodes")).hasSize(2);
      assertThat(row.path("observation").path("observedAt").asText())
          .isEqualTo("2026-10-08T03:00:05.123456789Z");
      assertThat(hash(row.path("observation"))).isEqualTo(row.path("observationHash").asText());
      assertThat(observations.put(row.path("observationHash").asText(), row)).isNull();
    }
    assertThat(observationBytes).isLessThanOrEqualTo(1_048_576);
    for (JsonNode source : basis.path("sourceSteps")) {
      sourceBytes += source.path("source").asText().getBytes(StandardCharsets.UTF_8).length;
    }
    assertThat(sourceBytes).isLessThanOrEqualTo(1_048_576);
    var preparationIds = new java.util.HashSet<String>();
    var admissionIds = new java.util.HashSet<String>();
    var obligationIds = new java.util.HashSet<String>();
    var stepIds = new java.util.HashSet<String>();
    var questionIds = new java.util.HashSet<String>();
    var attemptIds = new java.util.HashSet<String>();
    var requestIds = new java.util.HashSet<String>();
    var contextHashes = new java.util.HashSet<String>();
    var choiceIds = new java.util.HashSet<String>();
    var providerIds = new java.util.HashSet<String>();
    var builder = new GuidedPlanBuilder(C);
    var proposals = new com.citi.put.checks.studio.guided.translation.GuidedProposalValidator(C);
    JsonNode header = basis.at("/materializationEvidence/versions/0");
    var materialization =
        GuidedMaterializationEvidence.versionContext(C, basis.path("materializationEvidence"), 1);
    for (int index = 0; index < 100; index++) {
      JsonNode source = basis.path("sourceSteps").get(index),
          fact = basis.path("actions").get(index),
          prep = basis.path("preparations").get(index),
          ledger = fact.path("ledger"),
          proposal = prep.path("proposal"),
          obligation = basis.at("/translationPlan/obligations").get(index),
          association = basis.path("obligationAssociations").get(index);
      assertThat(stepIds.add(source.path("stepId").asText())).isTrue();
      assertThat(preparationIds.add(prep.path("preparationId").asText())).isTrue();
      assertThat(admissionIds.add(ledger.at("/admission/admissionId").asText())).isTrue();
      assertThat(obligationIds.add(obligation.path("obligationId").asText())).isTrue();
      assertThat(
              obligation
                  .path("targetIntent")
                  .asText()
                  .codePointCount(0, obligation.path("targetIntent").asText().length()))
          .isLessThanOrEqualTo(500);
      assertThat(ledger.path("state").asText()).isEqualTo("SUCCEEDED");
      assertThat(ledger.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(ledger.path("outcomeCode").asText()).isEqualTo("OK");
      assertThat(ledger.at("/coordinate/ordinal").asInt()).isZero();
      assertThat(ledger.at("/coordinate/stepId")).isEqualTo(source.path("stepId"));
      assertThat(obligation.path("stepId")).isEqualTo(source.path("stepId"));
      assertThat(fact.path("obligationId")).isEqualTo(obligation.path("obligationId"));
      assertThat(association.path("obligationId")).isEqualTo(obligation.path("obligationId"));
      assertThat(association.path("coordinate")).isEqualTo(ledger.path("coordinate"));
      assertThat(association.path("admissionId")).isEqualTo(ledger.at("/admission/admissionId"));
      assertThat(association.path("proposalHash").asText()).isEqualTo(hash(proposal));
      assertThat(fact.path("preparationId")).isEqualTo(prep.path("preparationId"));
      assertThat(ledger.path("preparationId")).isEqualTo(prep.path("preparationId"));
      assertThat(proposal.path("coordinate")).isEqualTo(ledger.path("coordinate"));
      assertThat(proposal.path("executionEvidence")).isEqualTo(ledger.path("executionEvidence"));
      assertThat(proposal.path("authoredInputsHash")).isEqualTo(header.path("authoredInputsHash"));
      ObjectNode progress = C.object(), actionContext = C.object();
      for (String field : List.of("generation", "evidenceHash", "executionEvidence")) {
        progress.set(field, proposal.path(field));
      }
      actionContext.putObject("authoredInputs").set("inputs", materialization.path("inputs"));
      if (index == 0) {
        assertThat(prep.has("observedChoice")).isFalse();
        proposals.action(
            parent.session(),
            progress,
            basis.path("translationPlan"),
            obligation,
            proposal,
            actionContext);
        continue;
      }
      JsonNode witness = prep.path("observedChoice");
      C.validate("v3/replay-validation#/definitions/ObservedChoiceWitness1", witness);
      assertThat(IncrementalBoundaryFixture.bytes(witness)).isLessThanOrEqualTo(262_144);
      assertThat(IncrementalBoundaryFixture.bytes(witness.path("context")))
          .isLessThanOrEqualTo(65_536);
      assertThat(IncrementalBoundaryFixture.bytes(witness.path("meanings")))
          .isLessThanOrEqualTo(65_536);
      assertThat(IncrementalBoundaryFixture.bytes(witness.path("receipt")))
          .isLessThanOrEqualTo(16_384);
      assertThat(witness.at("/questionPlan/plan")).isEqualTo(basis.path("translationPlan"));
      assertThat(witness.at("/questionPlan/plan/obligations")).hasSize(100);
      assertThat(questionIds.add(witness.at("/context/clarificationId").asText())).isTrue();
      assertThat(attemptIds.add(witness.at("/attempt/attemptId").asText())).isTrue();
      assertThat(requestIds.add(witness.at("/attempt/requestId").asText())).isTrue();
      assertThat(contextHashes.add(hash(witness.path("context")))).isTrue();
      for (JsonNode choice : witness.at("/context/question/choices")) {
        assertThat(choiceIds.add(choice.path("choiceId").asText())).isTrue();
      }
      for (JsonNode provider : witness.at("/attempt/modelQuestion/choices")) {
        assertThat(providerIds.add(provider.path("choiceId").asText())).isTrue();
      }
      JsonNode effective =
          builder.effectiveObservedObligation(
              parent.session(),
              basis.path("translationPlan"),
              materialization,
              prep,
              observations,
              obligation);
      assertThat(effective.path("selectedLocator")).isEqualTo(proposal.at("/target/locator"));
      proposals.action(
          parent.session(),
          progress,
          basis.path("translationPlan"),
          effective,
          proposal,
          actionContext);
      assertThat(prep.at("/executionEvidence/generation").asInt())
          .isGreaterThan(witness.at("/context/question/generation").asInt());
    }
    assertThat(questionIds).hasSize(99);
    assertThat(attemptIds).hasSize(99);
    assertThat(requestIds).hasSize(99);
    assertThat(contextHashes).hasSize(99);
    assertThat(choiceIds).hasSize(198);
    assertThat(providerIds).hasSize(198);
  }

  @Test
  void defensiveCandidateCannotBeChangedThroughCallerJson() throws Exception {
    var fixture = fixture("fresh-order-reference");
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(fixture.path("basis"), fixture.path("artifact").path("profile"));
    var before = candidate.artifact();
    object(candidate.artifact(), "replayPolicy").put("learnedPlanHash", "f".repeat(64));
    assertThat(candidate.artifact()).isEqualTo(before);
    var binding = candidate.artifact().path("replayPolicy").path("bindings").get(0);
    assertThat(binding.has("value")).isFalse();
    assertThat(binding.path("producer").path("ordinal").asInt()).isZero();
  }

  @Test
  void reproducesIndependentPythonObservedChoiceArtifactAndAllHashes() throws Exception {
    var independent = choiceFixture();
    var original = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    var reconstructed = original.build();
    assertThat(reconstructed).isEqualTo(original.expected);
    assertThat(reconstructed.path("sourceManifestHash"))
        .isNotEqualTo(independent.path("basis").path("sourceManifestHash"));
    // Golden fixture carries an explicitly opaque standalone manifest projection, not
    // the full source body constructed by Original. Its unchanged pure oracle stays separate.
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(independent.path("basis"), independent.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(independent.path("artifact"));
    assertThat(candidate.policy()).isEqualTo(independent.path("artifact").path("replayPolicy"));
    assertThat(candidate.learnedPlan()).isEqualTo(independent.path("artifact").path("learnedPlan"));
    for (var fields = independent.path("hashes").fields(); fields.hasNext(); ) {
      var entry = fields.next();
      assertThat(candidate.hashes().path(entry.getKey()))
          .as(entry.getKey())
          .isEqualTo(entry.getValue());
    }
    // Current unchanged independently authored choice vector, not the reconstructed manifest.
    assertThat(independent.path("hashes").path("artifactHash").asText())
        .isEqualTo("d846a0ca41fa432dd9ac7e87bf6d7cb36c37d96fc5fd64dee6d0ad1815dbb7b8");
    assertThat(hash(candidate.artifact()))
        .isEqualTo(independent.path("hashes").path("artifactHash").asText());
    assertThat(
            candidate
                .artifact()
                .path("guards")
                .get(3)
                .path("target")
                .path("locator")
                .path("value")
                .asText())
        .isEqualTo("backup-label-é");
    assertThat(
            reconstructed
                .path("translationPlan")
                .path("obligations")
                .get(3)
                .path("targetIntent")
                .asText())
        .isEqualTo("label-input");
  }

  @Test
  void compiledNodeIndependentlyValidatesChoiceAgainstCurrentPackagedBuild() throws Exception {
    var independent = choiceFixture();
    var original = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(original.build()).isEqualTo(original.expected);
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(independent.path("basis"), independent.path("artifact").path("profile"));
    var node = compiledNode(independent.path("basis"), candidate.artifact(), false);
    assertThat(node.path("artifact")).isEqualTo(independent.path("artifact"));
    assertThat(node.path("hashes")).isEqualTo(independent.path("hashes"));
    assertThat(node.path("verdict").path("ok").asBoolean()).isTrue();
    assertThat(node.path("build").path("schemaBundleHash"))
        .isEqualTo(node.path("recordedSchemaBundleHash"));
    assertThat(node.path("build").path("referenceBundleHash"))
        .isEqualTo(node.path("recordedReferenceBundleHash"));
    assertThat(node.path("build").path("profileHash").asText())
        .isEqualTo(hash(candidate.artifact().path("profile")));
    assertThat(
            compiledNode(independent.path("basis"), candidate.artifact(), true)
                .path("refusal")
                .asText())
        .isEqualTo("PROFILE_MISMATCH");
    var reconstructed =
        new ObservedArtifactLowerer(C)
            .lower(original.build(), independent.path("artifact").path("profile"));
    assertExecutableSemanticsEqual(reconstructed, candidate);
    var changed = new java.util.ArrayList<String>();
    reconstructed
        .hashes()
        .fields()
        .forEachRemaining(
            entry -> {
              if (!entry.getValue().equals(candidate.hashes().path(entry.getKey()))) {
                changed.add(entry.getKey());
              }
            });
    assertThat(changed)
        .containsExactlyInAnyOrder(
            "publicationEvidenceHash", "referencePolicyHash", "artifactHash", "revisionDigest");
    var reconstructedNode = compiledNode(original.build(), reconstructed.artifact(), false);
    assertThat(reconstructedNode.path("verdict").path("ok").asBoolean()).isTrue();
    assertThat(reconstructedNode.path("artifact")).isEqualTo(reconstructed.artifact());
    reconstructedNode
        .path("hashes")
        .fields()
        .forEachRemaining(
            entry ->
                assertThat(reconstructed.hashes().path(entry.getKey()))
                    .as(entry.getKey())
                    .isEqualTo(entry.getValue()));
    // Current packaged tuple is built from actual compiled records, never an old fixture build.
    // Image digest is explicitly synthetic; this pure test does not grant deployment authority.
  }

  static ObjectNode compiledNode(JsonNode basis, JsonNode artifact, boolean unsupportedBuild)
      throws Exception {
    String script =
        String.join(
            "\n",
            "import {readFileSync} from 'node:fs';",
            "import {deriveObservedArtifact,validateObservedRequest} from"
                + " './dist/validator/observedReplay.js';",
            "import {OBSERVED_PROFILE,OBSERVED_SCHEMA_BUNDLE_HASH,hashObserved}",
            "from './dist/validator/observedReferencePolicy.js';",
            "let input='';for await(const chunk of process.stdin)input+=chunk;",
            "const data=JSON.parse(input);",
            "const runtime=JSON.parse(readFileSync('./dist/runtime-versions.json','utf8'));",
            "const references=JSON.parse(readFileSync('./dist/observed-reference.json','utf8'));",
            "const build={profileHash:hashObserved(OBSERVED_PROFILE),",
            "schemaBundleHash:runtime.observedSchemaBundleHash,",
            "referenceBundleHash:runtime.observedReferenceBundleHash,executableImageDigest:'c'.repeat(64),",
            "chromiumBuild:runtime.observedChromiumBuild};",
            "if(build.schemaBundleHash!==OBSERVED_SCHEMA_BUNDLE_HASH||",
            "build.referenceBundleHash!==hashObserved(references))",
            "throw Error('packaged build records differ');",
            "const request={schemaVersion:3,attemptId:'00000000-0000-4000-8000-000000000900',",
            "claimId:'00000000-0000-4000-8000-000000000901',",
            "snapshotHash:'d'.repeat(64),basisHash:hashObserved(data.basis),",
            "requiredProfile:OBSERVED_PROFILE,requiredBuild:{...build},",
            "artifact:data.artifact,validationBasis:data.basis};",
            "if(data.unsupportedBuild)request.requiredBuild.schemaBundleHash='0'.repeat(64);",
            "try{const"
                + " verdict=validateObservedRequest(request,build),derived=deriveObservedArtifact(data.basis);",
            "process.stdout.write(JSON.stringify({...derived,verdict,build,",
            "recordedSchemaBundleHash:runtime.observedSchemaBundleHash,",
            "recordedReferenceBundleHash:runtime.observedReferenceBundleHash}));",
            "}catch(e){process.stdout.write(JSON.stringify({refusal:e.code??e.message}));}");
    var input = C.object().put("unsupportedBuild", unsupportedBuild);
    input.set("basis", basis);
    input.set("artifact", artifact);
    Process process =
        new ProcessBuilder("node", "--input-type=module", "-e", script)
            .directory(Path.of("../studio-runner").toFile())
            .start();
    var stdout =
        new java.util.concurrent.FutureTask<byte[]>(() -> process.getInputStream().readAllBytes());
    var errors =
        new java.util.concurrent.FutureTask<byte[]>(() -> process.getErrorStream().readAllBytes());
    Thread.ofVirtual().start(stdout);
    Thread.ofVirtual().start(errors);
    try {
      try (var stdin = process.getOutputStream()) {
        stdin.write(input.toString().getBytes(StandardCharsets.UTF_8));
      }
      assertThat(process.waitFor(Duration.ofSeconds(20).toMillis(), TimeUnit.MILLISECONDS))
          .as("bounded actual packaged Node validator completion")
          .isTrue();
      String stderr = new String(errors.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8);
      assertThat(process.exitValue()).as(stderr).isZero();
      return (ObjectNode)
          C.parse(new String(stdout.get(1, TimeUnit.SECONDS), StandardCharsets.UTF_8));
    } finally {
      if (process.isAlive()) {
        process.destroyForcibly();
      }
      stdout.cancel(true);
      errors.cancel(true);
    }
  }

  @Test
  void choiceCanonicalHashesPreserveUnicodeAndOriginalInstantWithoutNormalization()
      throws Exception {
    var f = new GuidedPlanBuilderTest.Original(choiceFixture().path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var witness = f.witness();
    var receipt = witness.path("receipt");
    assertThat(receipt.path("contextIdentityHash").asText())
        .isEqualTo(hash(witness.path("context")));
    assertThat(receipt.path("meaningsHash").asText()).isEqualTo(hash(witness.path("meanings")));
    assertThat(receipt.path("questionCaptureHash").asText())
        .isEqualTo(hash(witness.path("context").path("questionCapture")));
    assertThat(receipt.path("answer").path("resolvedAt").asText())
        .isEqualTo("2026-10-08T03:00:05.123456789Z");
    ObjectNode reordered = C.object();
    var names = new java.util.ArrayList<String>();
    witness.fieldNames().forEachRemaining(names::add);
    java.util.Collections.reverse(names);
    names.forEach(name -> reordered.set(name, witness.path(name).deepCopy()));
    assertThat(hash(reordered)).isEqualTo(hash(witness));
    assertThat(GuidedContracts.hash(reordered)).isEqualTo(hash(witness));
    ObjectNode explicitNull = copy(f.raw.path("preparations").get(0)).putNull("observedChoice");
    assertThat(hash(explicitNull)).isNotEqualTo(hash(f.raw.path("preparations").get(0)));
  }

  @Test
  void originalZeroAndSourceOnlyProofsOmitChoiceAndKeepReferenceBytes() throws Exception {
    var zero = fixture("fresh-order-reference");
    var original = new GuidedPlanBuilderTest.Original(zero.path("basis"));
    assertThat(original.build()).isEqualTo(original.expected);
    for (JsonNode preparation : original.build().path("preparations")) {
      assertThat(preparation.has("observedChoice")).isFalse();
    }
    var candidate =
        new ObservedArtifactLowerer(C)
            .lower(zero.path("basis"), zero.path("artifact").path("profile"));
    assertThat(candidate.artifact()).isEqualTo(zero.path("artifact"));
    assertThat(hash(candidate.artifact()))
        .isEqualTo(zero.path("hashes").path("artifactHash").asText());
    var reconstructed =
        new ObservedArtifactLowerer(C)
            .lower(original.build(), zero.path("artifact").path("profile"));
    assertExecutableSemanticsEqual(reconstructed, candidate);
    // Existing source-selection semantics use this original evidence and require no observed
    // witness.
    var selections = original.raw.putArray("sourceSelections");
    var selection = selections.addObject();
    selection
        .putObject("need")
        .put(
            "stepId",
            original.raw.path("translationPlan").path("obligations").get(3).path("stepId").asText())
        .put("occurrence", 1)
        .put("operationKind", "fill")
        .put("argumentSlot", "fill.value");
    selection.set(
        "reference",
        original.raw.path("translationPlan").path("sourceReferences").get(1).deepCopy());
    ObjectNode sourceOnly = original.build();
    for (JsonNode preparation : sourceOnly.path("preparations")) {
      assertThat(preparation.has("observedChoice")).isFalse();
    }
    // Source evidence has its own basis hash; executable operations/profile stay byte-identical.
    var sourceCandidate =
        new ObservedArtifactLowerer(C).lower(sourceOnly, zero.path("artifact").path("profile"));
    assertThat(sourceCandidate.learnedPlan()).isEqualTo(candidate.learnedPlan());
    assertThat(sourceCandidate.artifact().path("steps"))
        .isEqualTo(candidate.artifact().path("steps"));
    assertThat(sourceCandidate.artifact().path("profile"))
        .isEqualTo(candidate.artifact().path("profile"));
  }

  @Test
  void independentUtf8LimitsDoNotBorrowTheLargerTransportAllowance() {
    // Isolated size utility probes only: padding documents are not publication evidence.
    for (int limit :
        List.of(
            16384,
            262144,
            PublicationContracts.MAX_BASIS_BYTES,
            PublicationContracts.MAX_VALIDATION_BYTES)) {
      ObjectNode exact = C.object().put("padding", "é".repeat((limit - 14) / 2));
      int remaining = limit - canonical(exact).getBytes(StandardCharsets.UTF_8).length;
      exact.put("padding", exact.path("padding").asText() + "a".repeat(remaining));
      assertThat(canonical(exact).getBytes(StandardCharsets.UTF_8).length).isEqualTo(limit);
      assertThat(PublicationContracts.bounded(exact, limit)).isEqualTo(exact);
      ObjectNode oversized = exact.deepCopy().put("padding", exact.path("padding").asText() + "a");
      assertThatThrownBy(() -> PublicationContracts.bounded(oversized, limit))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("BUDGET_EXCEEDED");
      if (limit == PublicationContracts.MAX_BASIS_BYTES) {
        assertThat(
                PublicationContracts.bounded(oversized, PublicationContracts.MAX_VALIDATION_BYTES))
            .isEqualTo(oversized);
      }
    }
  }

  static java.util.stream.Stream<GuidedPlanBuilderTest.Mutation> pairedChoiceMutations() {
    return GuidedPlanBuilderTest.brokenChoiceJoins()
        .filter(
            m ->
                List.of(
                        "missing prospective choice witness",
                        "coherently resealed singleton original question",
                        "provider meanings order changed",
                        "exact locator kind differs with same text",
                        "answer after expiry by one nanosecond",
                        "original question plan changed meaning despite resealing",
                        "old duplicate locator on hidden unrelated node",
                        "fresh duplicate locator on hidden unrelated node",
                        "old generation equals fresh preparation with coherent snapshot",
                        "missing original question observation",
                        "coherent changed operation",
                        "coherent alternative authored input",
                        "meaning cannot replace authored argument with binding",
                        "unapproved original question origin coherently resealed")
                    .contains(m.name()));
  }

  @ParameterizedTest(name = "independent Java/Node original proof: {0}")
  @MethodSource("pairedChoiceMutations")
  void bothIndependentValidatorsRejectTheSameCoherentProofMutation(
      GuidedPlanBuilderTest.Mutation mutation) throws Exception {
    var independent = choiceFixture();
    var f = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var baseline =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    assertThat(
            compiledNode(f.suppliedBasis(), baseline.artifact(), false)
                .path("verdict")
                .path("ok")
                .asBoolean())
        .isTrue();
    mutation.change().accept(f);
    assertThatThrownBy(f::build).isInstanceOf(GuidedSessionException.class);
    var node = compiledNode(f.suppliedBasis(), baseline.artifact(), false);
    assertThat(node.has("refusal"))
        .as("coherent proof must fail before artifact comparison: %s", mutation.name())
        .isTrue();
  }

  @Test
  void providerAuditLabelsAndIdsNeverBecomeExecutableSelectors() throws Exception {
    var independent = choiceFixture();
    var f = new GuidedPlanBuilderTest.Original(independent.path("basis"));
    assertThat(f.build()).isEqualTo(f.expected);
    var before =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    at(object(object(f.witness(), "attempt"), "modelQuestion"), "choices", 1)
        .put("choiceId", "audit-provider-é🧪")
        .put("safeLabel", "Café e\u0301 🧪 untrusted audit");
    f.resealChoice();
    var result =
        new ObservedArtifactLowerer(C)
            .lower(f.build(), independent.path("artifact").path("profile"));
    assertThat(result.learnedPlan()).isEqualTo(before.learnedPlan());
    assertThat(result.artifact().path("steps")).isEqualTo(before.artifact().path("steps"));
    assertThat(result.artifact().path("guards")).isEqualTo(before.artifact().path("guards"));
    assertThat(result.artifact().path("inputRecipes"))
        .isEqualTo(before.artifact().path("inputRecipes"));
    assertThat(result.artifact().toString())
        .doesNotContain("audit-provider-é🧪", "untrusted audit");
    assertThat(result.hashes().path("publicationEvidenceHash"))
        .isNotEqualTo(before.hashes().path("publicationEvidenceHash"));
  }

  static void assertExecutableSemanticsEqual(
      PublicationContracts.Candidate reconstructed, PublicationContracts.Candidate standalone) {
    assertThat(reconstructed.learnedPlan()).isEqualTo(standalone.learnedPlan());
    for (String field :
        List.of(
            "profile",
            "steps",
            "guards",
            "inputRecipes",
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlanHash")) {
      assertThat(reconstructed.artifact().path(field))
          .as(field)
          .isEqualTo(standalone.artifact().path(field));
    }
    ObjectNode actualPolicy = copy(reconstructed.policy()),
        expectedPolicy = copy(standalone.policy());
    actualPolicy.remove("publicationEvidenceHash");
    expectedPolicy.remove("publicationEvidenceHash");
    assertThat(actualPolicy).isEqualTo(expectedPolicy);
  }
}
