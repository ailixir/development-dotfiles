package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;

/**
 * Authenticated publication coordinator: immutable snapshot, charged pure validation, atomic
 * adoption.
 */
public final class GuidedPlanPublisher {
  private final GuidedSessionRepository sessions;
  private final com.citi.put.checks.studio.guided.session.GuidedSessionService lifecycle;
  private final GuidedPublicationBaseRepository bases;
  private final GuidedPublicationEvidenceRepository evidence;
  private final GuidedPublicationRepository publications;
  private final GuidedContracts contracts;
  private final GuidedPlanBuilder builder;
  private final ObservedArtifactLowerer lowerer;
  private final ObservedReplayPins pins;
  private final ObservedValidationClient validator;
  private final GuidedPublicationAuthorization authorization;
  private final GuidedSessionAccess access;
  private final GuidedPublicationProperties properties;
  private final ObservedReplayProperties replay;
  private final Clock clock;

  private record Prepared(
      PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate,
      PublicationContracts.Attempt attempt,
      JsonNode session,
      JsonNode build) {}

  public GuidedPlanPublisher(
      GuidedSessionRepository sessions,
      com.citi.put.checks.studio.guided.session.GuidedSessionService lifecycle,
      GuidedPublicationBaseRepository bases,
      GuidedPublicationEvidenceRepository evidence,
      GuidedPublicationRepository publications,
      GuidedContracts contracts,
      ObservedReplayPins pins,
      ObservedValidationClient validator,
      GuidedPublicationAuthorization authorization,
      GuidedSessionAccess access,
      GuidedPublicationProperties properties,
      ObservedReplayProperties replay,
      Clock clock) {
    this.sessions = sessions;
    this.lifecycle = lifecycle;
    this.bases = bases;
    this.evidence = evidence;
    this.publications = publications;
    this.contracts = contracts;
    this.pins = pins;
    this.validator = validator;
    this.authorization = authorization;
    this.access = access;
    this.properties = properties;
    this.replay = replay;
    this.clock = clock;
    builder = new GuidedPlanBuilder(contracts);
    lowerer = new ObservedArtifactLowerer(contracts);
  }

  public PublicationContracts.Receipt finalizeForUser(
      Authentication caller, HttpServletRequest request, String id, String key, JsonNode body) {
    contracts.validate("v2/publication", body);
    require(key != null && !key.isBlank() && key.length() <= 256, "INVALID_CONTRACT", 422);
    String digest = GuidedContracts.hash(body);
    var previous = publications.receipt(id);
    if (previous.isPresent()) {
      authorization.authorizeReceiptRead(caller, request, previous.get());
      require(
          previous.get().document().path("finalizeDigest").asText().equals(digest),
          "IDEMPOTENCY_CONFLICT",
          409);
      return previous.get();
    }
    require(properties.enabled(), "PUBLICATION_DISABLED", 409);
    require(replay.enabled(), "REPLAY_DISABLED", 409);
    // Current caller/account checks occur without a database lock; final Core proof is refreshed
    // later.
    JsonNode original = sessions.transaction(() -> sessions.lock(id).document().deepCopy());
    access.checkUser(caller, original);
    access.checkCurrent(original);
    Prepared prepared;
    try {
      prepared = sessions.transaction(() -> prepare(id, key, digest, body));
    } catch (GuidedSessionException failure) {
      if (failure.getMessage().equals("PUBLICATION_CONFLICT")) {
        conflictBeforeClaim(id);
      }
      throw failure;
    }
    PublicationContracts.Attempt attempt = prepared.attempt();
    try {
      if (attempt.status() == PublicationContracts.AttemptStatus.RESERVED) {
        sessions.transaction(
            () -> {
              sessions.lock(id);
              return publications.claim(
                  id,
                  attempt.attemptId(),
                  attempt.claimId(),
                  prepared.snapshot().hash(),
                  clock.instant());
            });
        ObjectNode outgoing =
            contracts
                .object()
                .put("schemaVersion", 2)
                .put("attemptId", attempt.attemptId().toString())
                .put("claimId", attempt.claimId().toString())
                .put("snapshotHash", prepared.snapshot().hash())
                .put("basisHash", prepared.snapshot().identity().path("basisHash").asText());
        outgoing.set("requiredProfile", prepared.candidate().artifact().path("profile"));
        outgoing.set("requiredBuild", prepared.build());
        outgoing.set("artifact", prepared.candidate().artifact());
        outgoing.set("validationBasis", prepared.snapshot().basis());
        JsonNode verdict;
        try {
          verdict =
              validator.validate(
                  outgoing, new PublicationBudget(attempt.validationDeadline(), clock));
        } catch (GuidedSessionException failure) {
          sessions.transaction(
              () -> {
                sessions.lock(id);
                boolean unknown =
                    failure.getMessage().equals("UNKNOWN_OUTCOME")
                        || failure.getMessage().equals("EXPIRED");
                return publications.finish(
                    id,
                    attempt.attemptId(),
                    attempt.claimId(),
                    prepared.snapshot().hash(),
                    unknown
                        ? PublicationContracts.AttemptStatus.UNKNOWN
                        : PublicationContracts.AttemptStatus.REJECTED,
                    null,
                    unknown ? "VALIDATION_UNKNOWN" : "VALIDATION_REJECTED",
                    clock.instant());
              });
          throw failure;
        }
        boolean passed = verdict.path("ok").asBoolean();
        sessions.transaction(
            () -> {
              sessions.lock(id);
              return publications.finish(
                  id,
                  attempt.attemptId(),
                  attempt.claimId(),
                  prepared.snapshot().hash(),
                  passed
                      ? PublicationContracts.AttemptStatus.VALIDATED
                      : PublicationContracts.AttemptStatus.REJECTED,
                  passed ? verdict : null,
                  passed ? null : "VALIDATION_REJECTED",
                  clock.instant());
            });
        require(passed, "INVALID_CONTRACT", 422);
      } else {
        require(
            attempt.status() == PublicationContracts.AttemptStatus.VALIDATED,
            "PUBLICATION_PENDING",
            409);
      }
      // A long validator cannot age a pre-validation identity check into commit authority.
      access.checkCurrent(prepared.session());
      PublicationContracts.Grant grant =
          authorization.authorizePublication(
              caller, request, prepared.snapshot(), prepared.session());
      return sessions.transaction(
          () -> {
            require(properties.enabled() && replay.enabled(), "RUNTIME_INCOMPATIBLE", 409);
            var currentSession = sessions.lock(id);
            var base =
                bases.find(id).orElseThrow(() -> new GuidedSessionException("MISSING_SOURCE", 409));
            var source = bases.lockCurrent(UUID.fromString(text(base.document(), "testId")));
            bases.requireCurrent(base, source);
            pins.supported(prepared.candidate().artifact().path("profile"), prepared.build());
            var raw = evidence.read(id);
            JsonNode basis =
                builder.basis(
                    base,
                    source,
                    raw,
                    currentSession.document(),
                    builder.learningProvenance(raw.document().path("sourceManifest")));
            require(
                GuidedContracts.hash(basis)
                    .equals(prepared.snapshot().identity().path("basisHash").asText()),
                "PUBLICATION_CONFLICT",
                409);
            PublicationContracts.Receipt receipt =
                publications.commit(
                    new PublicationContracts.Commit(
                        id,
                        UUID.randomUUID(),
                        attempt.attemptId(),
                        attempt.claimId(),
                        key,
                        digest,
                        prepared.snapshot(),
                        prepared.candidate(),
                        grant),
                    clock.instant());
            lifecycle.publicationCommitted(id);
            return receipt;
          });
    } catch (GuidedSessionException failure) {
      if (failure.getMessage().equals("PUBLICATION_CONFLICT")) {
        sessions.transaction(
            () -> {
              sessions.lock(id);
              publications.conflict(id, prepared.snapshot().hash(), clock.instant());
              return null;
            });
      }
      throw failure;
    }
  }

  private void conflictBeforeClaim(String id) {
    sessions.transaction(
        () -> {
          var current = sessions.lock(id);
          if (publications.receipt(id).isPresent()
              || !current.document().path("state").asText().equals("FINALIZING")) {
            return null;
          }
          var base = bases.find(id);
          if (base.isEmpty()) {
            return null;
          }
          bases.lockCurrent(UUID.fromString(text(base.get().document(), "testId")));
          current.document().put("state", "PUBLICATION_CONFLICT");
          current.progress().put("errorCode", "PUBLICATION_CONFLICT");
          sessions.save(current);
          return null;
        });
  }

  private Prepared prepare(String id, String key, String digest, JsonNode expected) {
    var session = sessions.lock(id);
    JsonNode document = session.document();
    require(document.path("state").asText().equals("FINALIZING"), "PUBLICATION_CONFLICT", 409);
    var base = bases.find(id).orElseThrow(() -> new GuidedSessionException("MISSING_SOURCE", 409));
    require(
        expected.path("expectedSourceRevision").equals(base.document().path("sourceRevision"))
            && expected
                .path("expectedConfigurationRevision")
                .equals(base.document().path("configurationRevision")),
        "REVISION_CONFLICT",
        409);
    var source = bases.lockCurrent(UUID.fromString(text(base.document(), "testId")));
    bases.requireCurrent(base, source);
    var raw = evidence.read(id);
    ObjectNode basis =
        builder.basis(
            base,
            source,
            raw,
            document,
            builder.learningProvenance(raw.document().path("sourceManifest")));
    ObjectNode supported = pins.selected();
    PublicationContracts.Candidate candidate = lowerer.lower(basis, supported.path("profile"));
    ObjectNode identity = contracts.object();
    identity.set("base", base.document());
    identity.set("ownerWorkerId", document.path("owner").path("workerId"));
    identity.set("ownerFence", document.path("owner").path("fence"));
    identity.set("translationHash", basis.path("translationHash"));
    identity.put("basisHash", GuidedContracts.hash(basis));
    for (String name :
        List.of(
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      identity.set(name, candidate.hashes().path(name));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(supported.path("build")));
    Instant deadline = clock.instant().plusMillis(properties.validationTimeoutMs());
    for (Instant ceiling :
        List.of(
            Instant.parse(text(document, "expiresAt")),
            Instant.parse(text(document.path("owner"), "leaseExpiresAt")))) {
      if (deadline.isAfter(ceiling)) {
        deadline = ceiling;
      }
    }
    JsonNode cached = session.progress().path("publicationSnapshotIdentity");
    if (cached.isObject()) {
      ObjectNode comparable = PublicationContracts.copy(cached);
      comparable.remove("validationDeadline");
      if (comparable.equals(identity)
          && Instant.parse(text(cached, "validationDeadline")).isAfter(clock.instant())) {
        deadline = Instant.parse(text(cached, "validationDeadline"));
      }
    }
    deadline = PublicationContracts.millisecond(deadline);
    identity.put("validationDeadline", PublicationContracts.time(deadline));
    PublicationContracts.Snapshot snapshot = new PublicationContracts.Snapshot(identity, basis);
    var attempt =
        publications.reserve(
            new PublicationContracts.Claim(id, key, digest, snapshot), clock.instant());
    require(attempt.number() <= properties.maxValidationAttempts(), "BUDGET_EXCEEDED", 429);
    session.progress().set("publicationSnapshotIdentity", identity.deepCopy());
    sessions.save(session);
    return new Prepared(
        snapshot, candidate, attempt, document.deepCopy(), supported.path("build").deepCopy());
  }
}
