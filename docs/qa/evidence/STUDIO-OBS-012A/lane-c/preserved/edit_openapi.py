#!/usr/bin/env python3
"""Lane C (STUDIO-OBS-012A AC-2/AC-4/AC-5) one-shot edit of docs/specs/studio/openapi.yaml.

Every anchor must match exactly once; the script aborts otherwise so nothing is half-applied.
"""
import re
import sys

PATH = sys.argv[1]
text = open(PATH, encoding="utf-8").read()
log = []


def once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"anchor {label!r} matched {count} times")
    text = text.replace(old, new)
    log.append(label)


def cut_between(start, end, label, replacement=""):
    """Removes [start, end) where both are unique line anchors."""
    global text
    a, b = text.count(start), text.count(end)
    if a != 1 or b != 1:
        raise SystemExit(f"cut {label!r}: start {a}, end {b}")
    i, j = text.index(start), text.index(end)
    if j <= i:
        raise SystemExit(f"cut {label!r}: end before start")
    text = text[:i] + replacement + text[j:]
    log.append(label)


# ── 1. Header: the compiler amendment paragraph becomes the ADR-SC-005 statement ──────────────
once(
    """    Compiler amendment 2026-09-16: `docs/architecture/studio-inference-contract-v1.md`
    and sibling `inference.openapi.yaml` declare not-yet-implemented v2 authoring and
    corrected compiler behavior. Existing v1/internal shapes remain defined here;
    the separate inference proposal schema is never an executable runner artifact.
""",
    """    **One authoring path (ADR-SC-005, STUDIO-OBS-012A, 2026-10-12).** The compile-to-READY
    pipeline is retired: the compile and confirmation routes and the runner's artifact-1
    validate and run routes are removed, and runner cancellation is `DELETE /v2/runs/{id}`.
    A test is learned by a guided session
    (`/guided-sessions`, whose closed bodies are `../studio-observed-authoring/contracts/v3`) and
    replayed model-free through `POST /v2/runs`. Readiness is `UNLEARNED | LEARNING | READY |
    NEEDS_RELEARN`; a draft that cannot run is `409 LEARN_REQUIRED`. This is the one public
    OpenAPI document; every public route is under `/api/v1/studio`.
""",
    "header: ADR-SC-005 paragraph replaces compiler amendment",
)

once(
    """    selected evidence references are execution-affecting revision inputs. A stale compile may not
    publish over a newer input identity, and any such edit requires a new candidate and explicit
    confirmation; persistence and state transitions are owned by later stories.
""",
    """    selected evidence references are execution-affecting revision inputs. A publication may not
    land over a newer input identity, and any such edit requires learning again; persistence and
    state transitions are owned by later stories.
""",
    "header: stale compile sentence",
)

once(
    """    Ordinary Compile remains browser-free. Run executes only an exactly confirmed artifact and is
    LLM-free. This contract adds no learning/capture endpoint or browser action. An author may
    select a `supplied` evidence reference only; `observed` provenance is minted by a future trusted
    capture boundary and cannot be asserted by an imported or user-authored request. A future
    Learn flow is page-aware at each changing step state: login-page evidence does not prove the
    authenticated page, and authenticated-page evidence does not prove the protected destination.
    Learn may use the applicable state to propose each step for review; after confirmation, normal
    execution runs the immutable artifact without an LLM. These are contract boundaries, not a
    claim that this story implements live observation or Learn behaviour.
""",
    """    Run executes only a published observed revision and is LLM-free. Learning is the guided
    session: it is page-aware at each changing step state (login-page evidence does not prove the
    authenticated page, and authenticated-page evidence does not prove the protected destination),
    and it publishes the exact exercised plan as an immutable revision (`GUIDED_RUN`). An author
    may select a `supplied` evidence reference only; `observed` provenance is minted by the trusted
    capture boundary and cannot be asserted by an imported or user-authored request.
""",
    "header: compile/learn boundary paragraph",
)

# ── 2. Draft-lifecycle 409 table: STALE_CANDIDATE belonged to confirm-compile ──────────────────
once(
    """      **The four `409` codes of the draft lifecycle are not interchangeable, and a caller must act
      differently on each.**""",
    """      **The `409` codes of the draft lifecycle are not interchangeable, and a caller must act
      differently on each.**""",
    "tests tag: 409 count wording",
)
once(
    """      | `STALE_REVISION` | intact and compilable | the caller | reload and retry; the request was built against a revision that moved (§4.2) |
      | `STALE_CANDIDATE` | intact and compilable | the caller | recompile, then confirm the candidate that results (§4.2) |
      | `CSI_IMMUTABLE` | intact and compilable | the caller | correct the body; the CSI of a draft is never moved by an update (§9.1) |
""",
    """      | `STALE_REVISION` | intact | the caller | reload and retry; the request was built against a revision that moved (§4.2) |
      | `CSI_IMMUTABLE` | intact | the caller | correct the body; the CSI of a draft is never moved by an update (§9.1) |
""",
    "tests tag: STALE_CANDIDATE row removed",
)
once(
    "      The first three are retriable by the caller after a local correction.",
    "      The first two are retriable by the caller after a local correction.",
    "tests tag: retriable count",
)

# ── 3. listTests projection prose ─────────────────────────────────────────────────────────────
cut_between(
    "        **`compileDiagnostics`, `currentCandidateArtifact`, `currentCandidateArtifactHash`,\n",
    "        **Search, filter and sort (story 10.46).** `q`, `environment`, `lastRun`",
    "listTests: projection prose",
    """        **`confirmedRevisionArtifact` and `confirmedRevisionArtifactHash` are always `null` on
        this route.** They are read from `GET /tests/{id}`: an observed artifact carries up to a
        hundred steps of learned operations, so a page of drafts would be a multi-megabyte response
        carrying executable plans no list renders. `readiness`, `firstChangedStepId` and
        `confirmedRevisionId` are on this route, so nothing a caller needs in order to know that a
        runnable revision exists is hidden (ADR-002 §16.5, §21.2; ADR-SC-005).

        The hash is omitted here rather than kept because it is only meaningful beside the artifact
        it names, and a hash carried on a list entry would invite a client to assemble one body
        out of two reads.

""",
)

# ── 4. createTest / updateTest save-time bounds ───────────────────────────────────────────────
once(
    """          because a draft is created empty and filled in the editor. It is refused at compile.
        - `SOURCE_TOO_MANY_STEPS` (more than 100 steps) and `SOURCE_LINE_TOO_LONG` (a step longer
          than 1024 characters): the compile bounds, with the same codes and messages as
          `POST /tests/{id}/compile`. The total-size bound (`SOURCE_TOO_LARGE`) is checked at
          compile only.
""",
    """          because a draft is created empty and filled in the editor. An empty draft cannot be learned.
        - `SOURCE_TOO_MANY_STEPS` (more than 100 steps) and `SOURCE_LINE_TOO_LONG` (a step longer
          than 1024 characters): the authoring bounds.
""",
    "createTest: save-time bounds prose",
)
once(
    "            step length over the compile bound (`SOURCE_TOO_MANY_STEPS`, `SOURCE_LINE_TOO_LONG`).",
    "            step length over the authoring bound (`SOURCE_TOO_MANY_STEPS`, `SOURCE_LINE_TOO_LONG`).",
    "createTest: 400 prose",
)

# ── 5. getTest examples: readiness replaces the compile projection ───────────────────────────
cut_between(
    "                    compileStatus: READY\n",
    "                needsRevision:\n",
    "getTest: ready example",
    """                    readiness: READY
                    firstChangedStepId: null
                    confirmedRevisionId: 22222222-2222-2222-2222-222222222222
                    confirmedRevisionArtifactHash: 9f2c1d5b7a3e4c6f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7
                    # confirmedRevisionArtifact (the published observed artifact, normative schema
                    # contracts/v3/replay-artifact.schema.json) is elided from this example for length.
""",
)
cut_between(
    "                needsRevision:\n",
    "                    id: 11111111-1111-1111-1111-111111111111\n                    name: Citi login smoke\n                    description: Verifies the login page still accepts the pilot account\n                    csiId: '60406'\n                    environment: Production\n                    steps:\n                      - Go to \"https://www.citi.com\"\n                      - Wobble",
    "getTest: unlearned example header",
    """                unlearned:
                  summary: No published revision matches the draft yet
                  description: |
                    `UNLEARNED`: Run starts a guided session that learns the draft (ADR-SC-005).
                    Nothing here claims the steps do what their author meant.
                  value:
""",
)
cut_between(
    "                    compileStatus: NEEDS_REVISION\n",
    "        '400': { $ref: '#/components/responses/BadRequest' }\n        '401': { $ref: '#/components/responses/SessionUnauthorized' }\n        '403': { $ref: '#/components/responses/Forbidden' }\n    put:",
    "getTest: unlearned example body",
    """                    readiness: UNLEARNED
                    firstChangedStepId: null
                    confirmedRevisionId: null
                    confirmedRevisionArtifactHash: null
                    confirmedRevisionArtifact: null
""",
)

# ── 6. updateTest / deleteTest prose ──────────────────────────────────────────────────────────
once(
    """        **Saving persists the draft and nothing else.** A source or configuration change bumps the
        revisions, clears the candidate and returns `compileStatus: STALE`; it does **not** start a
        compile. Preparing the saved revision is `POST /tests/{id}/compile`, which the Run action
        issues when the saved draft has no fresh artifact. Saving used to enqueue a compile, which
        spent a gateway call on work the author had not asked for and left a failed attempt with no
        way to retry it, because re-saving identical content is not a change.
""",
    """        **Saving persists the draft and nothing else.** A source or configuration change bumps the
        revisions, so the published revision no longer matches and `readiness` is no longer
        `READY`; saving does **not** start learning. Learning the saved revision is a guided
        session, which the Run action starts when the draft is not `READY` (ADR-SC-005).
""",
    "updateTest: save prose",
)
once(
    """            Refusal with `TEST_DELETED`/`TEST_QUARANTINED` belongs to
            compile, confirm-compile and execute, which are the three operations architecture §8.3
            and the quarantine migration name as having to *reject* rather than merely not see
            (ADR-002 §14 sweep).""",
    """            Refusal with `TEST_DELETED`/`TEST_QUARANTINED` belongs to execute, the operation
            architecture §8.3 and the quarantine migration name as having to *reject* rather than
            merely not see (ADR-002 §14 sweep).""",
    "updateTest: 409 prose",
)
once("        Rejects new execute/compile; authorized history stays readable.",
     "        Rejects new execute; authorized history stays readable.",
     "deleteTest: prose")

# ── 7. Compile routes removed ─────────────────────────────────────────────────────────────────
cut_between("  /tests/{id}/compile:\n", "  /tests/{id}/execute:\n", "remove compileTest + confirmCompile")

# ── 8. execute: LEARN_REQUIRED replaces COMPILE_REQUIRED ─────────────────────────────────────
once(
    """            The readiness predicate's first term is lifecycle, and it refuses a soft-deleted or
            quarantined draft with that draft's **own** code rather than folding it into
            `COMPILE_REQUIRED`. The distinction is not cosmetic: `COMPILE_REQUIRED` tells an author
            to confirm a candidate, which is work they can do and which would not help — a deleted
            or quarantined draft would refuse the compile too (§8.3, BRD §9).
          x-conflict-codes:
            [COMPILE_REQUIRED, RUNTIME_INCOMPATIBLE, IDEMPOTENCY_KEY_REUSED, TEST_DELETED, TEST_QUARANTINED]""",
    """            The readiness predicate's first term is lifecycle, and it refuses a soft-deleted or
            quarantined draft with that draft's **own** code rather than folding it into
            `LEARN_REQUIRED`. The distinction is not cosmetic: `LEARN_REQUIRED` tells an author to
            run a guided session, which is work they can do and which would not help — a deleted or
            quarantined draft would refuse learning too (§8.3, BRD §9; ADR-SC-005).
          x-conflict-codes:
            [LEARN_REQUIRED, RUNTIME_INCOMPATIBLE, IDEMPOTENCY_KEY_REUSED, TEST_DELETED, TEST_QUARANTINED]""",
    "executeTest: LEARN_REQUIRED",
)
once(
    """                compileRequired:
                  value: { error: COMPILE_REQUIRED, message: 'The draft changed since its last confirmation' }""",
    """                learnRequired:
                  value: { error: LEARN_REQUIRED, message: 'No published revision matches the draft; run it to learn it' }""",
    "executeTest: LEARN_REQUIRED example",
)
once(
    """            - UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED
            - COMPILE_REQUIRED
            - RUNTIME_INCOMPATIBLE""",
    """            - UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED
            - LEARN_REQUIRED
            - RUNTIME_INCOMPATIBLE""",
    "enableStudioSchedule: LEARN_REQUIRED",
)

# ── 9. validate-variables documented (kept, CLN-12) ───────────────────────────────────────────
VALIDATE_VARIABLES = """  /tests/{id}/validate-variables:
    parameters:
      - { $ref: '#/components/parameters/TestId' }
    post:
      tags: [tests]
      operationId: validateTestVariables
      summary: Check a draft's variable and secret references
      description: |
        Kept and documented by ADR-SC-005 (cleanup inventory CLN-12): the Create Check flow calls
        it. Reads the draft the caller may read and reports, without writing anything, how the
        `<var NAME>` and `<secret ID>` references in its steps match its declared variables,
        optionally counting values the caller supplies by name. A `secretRef` declaration matches
        by its `secretId`, falling back to its name. Secret values are never read or returned; it
        starts no session, learns nothing and executes nothing.

        `undeclared` lists references with no matching declaration as their source tokens,
        `unvalued` referenced plain variables with no value on the draft and none supplied,
        `conflicting` names declared both as a variable and as a secret, and `unused` declared
        names no step references. `missing` is `undeclared` followed by `unvalued`. `valid` (and
        its duplicate `isValid`) is true when `undeclared`, `unvalued` and `conflicting` are all
        empty; `unused` never invalidates. Names are listed in first-reference or declaration
        order.

        Authorization is `GET /tests/{id}`'s: an unknown id, a soft-deleted or quarantined draft,
        and a draft on a CSI the caller may not read all answer the same `403 STUDIO_FORBIDDEN`.
      x-implemented-by: Studio v1 WP6
      requestBody:
        required: false
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ValidateVariablesRequest' }
            examples:
              supplied:
                value: { variables: { USER_ID: pilot-user } }
      responses:
        '200':
          description: The reference report; nothing was written
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ValidateVariablesResponse' }
              examples:
                valid:
                  value:
                    testId: 11111111-1111-1111-1111-111111111111
                    isValid: true
                    valid: true
                    hasVariables: true
                    missing: []
                    undeclared: []
                    unvalued: []
                    conflicting: []
                    unused: []
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/SessionUnauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }

"""
once("  # ADR-002 §32 (studio-vault-secrets): a test's secrets, stored in Vault KV v2 only, at\n",
     VALIDATE_VARIABLES + "  # ADR-002 §32 (studio-vault-secrets): a test's secrets, stored in Vault KV v2 only, at\n",
     "add validateTestVariables")

# ── 10. The seven guided-session routes (moved from /api/v3; one public document) ─────────────
V3 = "../studio-observed-authoring/contracts/v3/"
PUBLIC_SESSION = """schemaVersion: 3
sessionId: sample-session
testId: test-1
state: PREPARING
expiresAt: '2026-10-10T12:00:00Z'
counters:
  actions: 0
  observations: 0
  modelProposals: 0
  modelInputTokens: 0
  modelOutputTokens: 0
  sanitizedEvidenceBytes: 0
"""
RECEIPT = """schemaVersion: 3
sessionId: sample-session
revisionId: 11111111-1111-4111-8111-111111111111
revisionDigest: '1111111111111111111111111111111111111111111111111111111111111111'
learnedPlanHash: '2222222222222222222222222222222222222222222222222222222222222222'
artifactHash: '3333333333333333333333333333333333333333333333333333333333333333'
publicationEvidenceHash: '4444444444444444444444444444444444444444444444444444444444444444'
publishedAt: '2026-10-09T12:00:00.000Z'
learnedFromThisRun: true
replayVerified: false
"""
GUIDED_COMMON_ERRORS = """        '400': { description: Strict UTF-8/JSON or closed v3 contract refused }
        '401': { $ref: '#/components/responses/SessionUnauthorized' }
        '403': { description: Current CSI/scope entitlement denied }
        '409': { description: 'Revision, authorization, state or idempotency conflict; closed `{code}` refusal' }
        '503': { description: Current authority or Vault unavailable }
"""


def indent(block, spaces):
    pad = " " * spaces
    return "".join(pad + line if line.strip() else line for line in block.splitlines(True))


GUIDED = f"""  # ────────────────────────────────────────────────────────────────────────────────────────────
  # Guided learning sessions (ADR-SC-004, ADR-SC-005; STUDIO-OBS-012A moved them here from the
  # interim OBS-007 document).
  #
  # Public BFF routes under `/api/v1/studio`, authenticated like every other public operation by
  # the platform `put_session` cookie. Request and response bodies are the closed v3 contracts in
  # `../studio-observed-authoring/contracts/v3`; secrets are references only and no body carries a
  # secret value. Synthetic examples are conformance evidence, not browser or deployment proof.
  # The internal backend/runner bridge (`/internal/v2/studio/guided-sessions/{{sessionId}}/…`) is
  # described in `../studio-observed-authoring/contracts/README.md`, not here.
  # ────────────────────────────────────────────────────────────────────────────────────────────

  /guided-sessions:
    post:
      tags: [guided-sessions]
      operationId: startGuidedSession
      summary: Start learning a draft
      x-implemented-by: STUDIO-OBS-003
      parameters:
        - {{ $ref: '#/components/parameters/GuidedIdempotencyKey' }}
      requestBody:
        required: true
        content:
          application/json:
            schema: {{ $ref: '{V3}commands.schema.json#/definitions/start' }}
            example:
              schemaVersion: 3
              testId: test-1
              sourceRevision: '1'
              configurationRevision: '1'
              environmentId: dev
              applicationId: app-1
              versions:
                contract: 3
                learnedPlan: 3
                observation: 3
                guidedPolicy: 3
                referencePolicy: 4
                lowering: 2
                artifact: 3
                language: observed-3
                executor: observed-4
      responses:
        '202':
          description: Authorized scoped session view
          content:
            application/json:
              schema: {{ $ref: '{V3}session-view.schema.json' }}
              example:
                schemaVersion: 3
                session:
{indent(PUBLIC_SESSION, 18)}                result: null
{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    get:
      tags: [guided-sessions]
      operationId: readGuidedSession
      summary: Read one guided session
      x-implemented-by: STUDIO-OBS-003
      responses:
        '200':
          description: Authorized scoped session view
          content:
            application/json:
              schema: {{ $ref: '{V3}session-view.schema.json' }}
              example:
                schemaVersion: 3
                session:
{indent(PUBLIC_SESSION, 18)}                result: null
{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}/result:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    get:
      tags: [guided-sessions]
      operationId: readGuidedResult
      summary: Read the learning run's result and publication state
      x-implemented-by: STUDIO-OBS-006
      responses:
        '200':
          description: Authorized scoped result
          content:
            application/json:
              schema: {{ $ref: '{V3}result.schema.json' }}
              example:
                schemaVersion: 3
                sessionId: sample-session
                executionId: sample-session
                scopeHash: '0000000000000000000000000000000000000000000000000000000000000000'
                mode: guided
                outcome: SUCCEEDED
                assertionsPassed: true
                learnedFromThisRun: true
                replayVerified: false
                scheduleActivated: false
                publication:
                  status: PUBLISHED
                  receipt:
{indent(RECEIPT, 20)}                currentReadiness:
                  revisionId: 11111111-1111-4111-8111-111111111111
                  ready: false
                  code: HEAD_CHANGED
                evidence:
                  kind: guidedLedger
                  ref: sample-session
                  video: null
                actionTimings: []
                errorCode: null
        '202':
          description: Pending publication, not a success claim
          content:
            application/json:
              schema: {{ $ref: '{V3}result.schema.json' }}
              example:
                schemaVersion: 3
                sessionId: sample-session
                executionId: sample-session
                scopeHash: '0000000000000000000000000000000000000000000000000000000000000000'
                mode: guided
                outcome: FINALIZING
                assertionsPassed: true
                learnedFromThisRun: false
                replayVerified: false
                scheduleActivated: false
                publication:
                  status: PENDING
                  receipt: null
                currentReadiness:
                  revisionId: null
                  ready: false
                  code: NOT_PUBLISHED
                evidence:
                  kind: guidedLedger
                  ref: sample-session
                  video: null
                actionTimings: []
                errorCode: null
{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}/clarification:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    get:
      tags: [guided-sessions]
      operationId: readGuidedClarification
      summary: Read the pending clarification question, if any
      x-implemented-by: STUDIO-OBS-005
      responses:
        '200':
          description: The pending question
          content:
            application/json:
              schema: {{ $ref: '{V3}clarification.schema.json' }}
              example:
                schemaVersion: 3
                phase: source
                clarificationId: question-1
                sessionId: session-1
                scopeHash: 136041e6c1779580bc01fa950bf5a347535a0ec6f2d9e7b50920ec61980307ea
                coordinate:
                  stepId: step-1
                  ordinal: 0
                documentId: null
                generation: 0
                reason: AMBIGUOUS_BINDING
                promptCode: CHOOSE_SOURCE
                choices:
                  - choiceId: choice-1
                    safeLabel: 'Use authored text: London'
                    nodeId: null
                    bindingId: null
                expiresAt: '2026-10-08T03:10:00Z'
        '204':
          description: No pending question
{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}/clarify:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    post:
      tags: [guided-sessions]
      operationId: clarifyGuidedSession
      summary: Answer the pending clarification question
      x-implemented-by: STUDIO-OBS-005
      parameters:
        - {{ $ref: '#/components/parameters/GuidedIdempotencyKey' }}
      requestBody:
        required: true
        content:
          application/json:
            schema: {{ $ref: '{V3}commands.schema.json#/definitions/clarify' }}
            example:
              schemaVersion: 3
              clarificationId: clarification-1
              choiceId: choice-1
              generation: 1
      responses:
        '202':
          description: Authorized scoped session
          content:
            application/json:
              schema: {{ $ref: '{V3}session-view.schema.json#/definitions/PublicSession' }}
              example:
{indent(PUBLIC_SESSION, 16)}{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}/cancel:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    post:
      tags: [guided-sessions]
      operationId: cancelGuidedSession
      summary: Cancel a guided session
      x-implemented-by: STUDIO-OBS-003
      parameters:
        - {{ $ref: '#/components/parameters/GuidedIdempotencyKey' }}
      requestBody:
        required: true
        content:
          application/json:
            schema: {{ $ref: '{V3}commands.schema.json#/definitions/cancel' }}
            example:
              schemaVersion: 3
              reason: userRequested
      responses:
        '202':
          description: Authorized scoped session
          content:
            application/json:
              schema: {{ $ref: '{V3}session-view.schema.json#/definitions/PublicSession' }}
              example:
{indent(PUBLIC_SESSION.replace('state: PREPARING', 'state: CANCELLED'), 16)}{GUIDED_COMMON_ERRORS}
  /guided-sessions/{{id}}/finalize:
    parameters:
      - {{ $ref: '#/components/parameters/GuidedSessionId' }}
    post:
      tags: [guided-sessions]
      operationId: finalizeObservedPublication
      summary: Publish the exact exercised plan as a revision
      description: Served by GuidedPublicationController; exact exercised plan, no model or browser action.
      x-implemented-by: STUDIO-OBS-006
      parameters:
        - {{ $ref: '#/components/parameters/GuidedIdempotencyKey' }}
      requestBody:
        required: true
        content:
          application/json:
            schema: {{ $ref: '{V3}publication.schema.json' }}
            example:
              schemaVersion: 3
              expectedSourceRevision: '1'
              expectedConfigurationRevision: '1'
      responses:
        '200':
          description: Publication receipt
          content:
            application/json:
              schema: {{ $ref: '{V3}publication.schema.json#/definitions/PublicationReceipt' }}
              example:
{indent(RECEIPT, 16)}{GUIDED_COMMON_ERRORS}
"""
once(
    "  # ────────────────────────────────────────────────────────────────────────────────────────────\n  # Internal surface, architecture §8.4, in the order that section tabulates it.\n",
    GUIDED + "  # ────────────────────────────────────────────────────────────────────────────────────────────\n  # Internal surface, architecture §8.4, in the order that section tabulates it.\n",
    "add seven guided-session routes",
)

# ── 11. Runner artifact-1 routes removed; cancellation moves to /v2/runs/{id} ─────────────────
cut_between("  /v1/validate:\n", "  /v1/runs/{id}:\n", "remove runnerValidateArtifact + runnerAdmitRun")
once("  /v1/runs/{id}:\n", "  /v2/runs/{id}:\n", "runnerCancelRun moves to /v2/runs/{id}")
once("        recorded; authenticated exactly like `POST /v1/runs`, on the request head. `id` is the",
     "        recorded; authenticated exactly like `POST /v2/runs`, on the request head. `id` is the",
     "runnerCancelRun: auth prose")
once("Neither model gateway is reachable. Existing DELETE /v1/runs/{id} controls both families.",
     "Neither model gateway is reachable. DELETE /v2/runs/{id} cancels it.",
     "runObservedRevision: cancel prose")

# ── 12. Tags and parameters ───────────────────────────────────────────────────────────────────
once(
    """  - name: executions
    description: Execution history, live snapshots and evidence
""",
    """  - name: executions
    description: Execution history, live snapshots and evidence
  - name: guided-sessions
    description: |
      Guided learning sessions (ADR-SC-004, ADR-SC-005): observe, propose, clarify, act and publish
      the exact exercised plan as an immutable revision. Bodies are the closed v3 contracts.
""",
    "tags: guided-sessions",
)
once(
    """  parameters:
    TestId:
""",
    """  parameters:
    GuidedSessionId:
      name: id
      in: path
      required: true
      schema: { type: string, minLength: 1, maxLength: 256 }
    GuidedIdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema: { type: string, minLength: 1, maxLength: 256 }
    TestId:
""",
    "parameters: GuidedSessionId, GuidedIdempotencyKey",
)

# ── 13. AuthoringRevisionInputs prose ─────────────────────────────────────────────────────────
once(
    """        covers the ordered stable step IDs/text plus all four collections. A change makes a
        candidate stale and requires matching recompile/reconfirmation.""",
    """        covers the ordered stable step IDs/text plus all four collections. A change means the
        published revision no longer matches and the draft must be learned again.""",
    "AuthoringRevisionInputs prose",
)

# ── 14. TestDto: readiness replaces the compile-state projection ─────────────────────────────
once(
    "      required: [id, name, csiId, environment, steps, variables, configuration, sourceRevision, configurationRevision, compileStatus]",
    "      required: [id, name, csiId, environment, steps, variables, configuration, sourceRevision, configurationRevision, readiness, firstChangedStepId]",
    "TestDto: required",
)
cut_between(
    "        One Studio draft. `compileStatus`, `currentCandidateRevisionId`, `confirmedRevisionId`,\n",
    "        This remains the live v1 response projection.",
    "TestDto: description",
    """        One Studio draft. `readiness` is derived on every read, never stored (ADR-SC-005):
        `UNLEARNED` — no published revision matches the current steps and configuration;
        `LEARNING` — a guided session for this draft is in progress; `READY` — the confirmed
        observed revision matches the draft and replays model-free; `NEEDS_RELEARN` — a published
        revision exists and a step changed, and `firstChangedStepId` names the first changed
        step. `firstChangedStepId` is non-null only with `NEEDS_RELEARN`; the detection that sets
        it is STUDIO-OBS-015, so until then the server never emits `NEEDS_RELEARN`.

        `confirmedRevisionId`, `confirmedRevisionArtifactHash` and `confirmedRevisionArtifact`
        are read with the draft in one transaction (ADR-002 §30).

""",
)
cut_between(
    "        compileStatus:\n          type: string\n          enum: [STALE, COMPILING, AWAITING_CONFIRMATION, READY, NEEDS_REVISION]\n",
    "        confirmedRevisionId: { type: string, format: uuid, nullable: true }\n",
    "TestDto: compile fields replaced by readiness",
    """        readiness:
          type: string
          enum: [UNLEARNED, LEARNING, READY, NEEDS_RELEARN]
        firstChangedStepId:
          type: string
          format: uuid
          nullable: true
          description: The first changed step's stable ID; non-null only with `NEEDS_RELEARN`.
""",
)
once(
    """            Immutable validated artifact of exactly confirmedRevisionId, read in the same transaction
            as confirmedRevisionArtifactHash. Its normative schema is artifact.schema.json, as for
            currentCandidateArtifact. Null when no readable retained confirmed revision exists;
            always null on GET /tests. Edits and failed compiles do not replace this artifact with
            candidate source. A stale draft cannot execute merely because historical source exists.
        compileError: { $ref: '#/components/schemas/CompileError' }
        compileDiagnostics: { $ref: '#/components/schemas/CompileDiagnostics' }
""",
    """            Immutable published artifact of exactly confirmedRevisionId, read in the same
            transaction as confirmedRevisionArtifactHash. Its normative schema is the observed
            `../studio-observed-authoring/contracts/v3/replay-artifact.schema.json`. Null when no
            readable retained confirmed revision exists; always null on GET /tests. Edits do not
            replace this artifact. A changed draft cannot execute merely because historical source
            exists.
""",
    "TestDto: confirmed artifact prose, compile refs removed",
)


# ── 15. Remaining runner-route prose follows cancellation to /v2/runs ─────────────────────────
once("        `cancelRequested: true` stops the run through the same path as `DELETE /v1/runs/{id}`.",
     "        `cancelRequested: true` stops the run through the same path as `DELETE /v2/runs/{id}`.",
     "readExecutionControl: cancel path prose")
once("        `POST /v1/runs`, because removing it from the Service would only move the same saturation",
     "        `POST /v2/runs`, because removing it from the Service would only move the same saturation",
     "runnerReadiness: saturation prose")
once("            run on it exactly as on `DELETE /v1/runs/{id}`; it never returns to false.",
     "            run on it exactly as on `DELETE /v2/runs/{id}`; it never returns to false.",
     "ExecutionControl: cancel prose")
once("            by `DELETE /v1/runs/{id}` is `ERROR` with `CANCELLED`, and the API assigns its own",
     "            by `DELETE /v2/runs/{id}` is `ERROR` with `CANCELLED`, and the API assigns its own",
     "RunOutcome: cancel prose")
once("""            confirmed revision in one transaction (ADR-002 §30). Independent of the current
            candidate. Null when no readable retained confirmed revision exists; always null on
            GET /tests. Never synthesized from draft steps or substituted from the candidate.""",
     """            confirmed revision in one transaction (ADR-002 §30). Null when no readable retained
            confirmed revision exists; always null on GET /tests. Never synthesized from draft
            steps.""",
     "TestDto: confirmed hash prose")

open(PATH, "w", encoding="utf-8").write(text)
print("\n".join(log))
