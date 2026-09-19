# Fold ruling — the video route's `503` envelope, and the ADR-002 register's double entry

**Authority:** @architect (Aria), ADR-002 §12 Class C ("routes, security schemes, tags, `servers`,
status-code semantics, and anything on the public surface. **Architect, always.**", ADR-002
`docs/architecture/ADR-002-internal-contract-surface.md:306`).
**Date:** 2026-09-18.
**Scope:** the two items the Epic 10 fold could not decide mechanically —
`tools/epic10-fold/RULINGS.md` rows **#6** (`docs/specs/studio/openapi.yaml`) and **#4**
(`docs/architecture/ADR-002-internal-contract-surface.md`).

This document **rules**; it does not amend. Neither `openapi.yaml` nor
`ADR-002-internal-contract-surface.md` is edited by this commit — both are fold blockers, and
editing them now would add a third side to a two-sided merge. The fold applies what is written
here. Every instruction below is anchored on quoted text rather than line numbers, because both
files move.

---

## 0. What was read, and when

| Side | Location | Ref | State |
|---|---|---|---|
| Ours | `wt/arch-503` | branch `arch/epic10-503-ruling`, HEAD `57a6e9095`; `epic/EPIC-10-w7` resolves to the same commit | clean |
| Theirs | `wt/epic` | branch `epic/EPIC-10`, HEAD `ff0513385`, **working tree uncommitted** | read-only; read 2026-09-18 **03:59:35Z – 04:05:33Z** |

`git merge-base epic/EPIC-10 epic/EPIC-10-w7` = `ff0513385` — verified, so their working tree is
base + uncommitted delta and the three-way merge below is the real one.

Digests recomputed with `shasum -a 256`, not transcribed:

| File | sha256 |
|---|---|
| `openapi.yaml` @ base `ff0513385` | `51850b016cd8a697899a944eab12ddce5456967beecf4f3e011720498bc02efa` |
| `openapi.yaml` ours (`epic/EPIC-10-w7`) | `d9f5f2a2bfac4f51baa2a334b1129236578703acbe5f0d137c98ab54b227af6a` |
| `openapi.yaml` theirs (worktree, 04:02:34Z) | `c877d6dda9436bfb2827680a2409ee454c2ea2a918943d9d5f6d7164fc760187` |

Both values quoted in the brief are **confirmed**. Neither is the merged digest; see §2.5.

The three-way merge was reproduced in a scratch copy (`git merge-file` against the base, our
tree's file, and a copy of theirs taken at 04:02:34Z): **rc 5, five conflicts**, all in the two
regions the brief names plus three component descriptions. Their side of `openapi.yaml` is
**purely additive**: `git diff --stat` = `98 insertions(+), 1 deletion(-)` (read 04:02:07Z).

---

## 1. The runtime behaviour their §30 rests on — **VERIFIED, in code, and their claim is true**

Their §30 asserts *"Unlike §24.6's earlier proposed 503 schema, the landed schema declares
`oneOf`"*, on the basis of `BffSessionAuthenticationFilter.write503`. Nobody had checked it.
I read it. It is correct.

### 1.1 The method, quoted in full

`backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java:258-270`:

```java
  private void write503(HttpServletResponse response, String traceId) throws IOException {
    response.setStatus(503);
    response.setHeader("Retry-After", "5");
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(
        response.getWriter(),
        Map.of(
            "error",
            Map.of(
                "code", "AUTH_TEMPORARILY_UNAVAILABLE",
                "message", "Authentication service temporarily unavailable",
                "traceId", traceId)));
  }
```

**It emits a nested body and a `Retry-After: 5` header.** `error` is an *object*.

The file is **byte-identical in both trees** and **unmodified in theirs** (`diff` → identical;
`git status --short` on that path in `wt/epic` → empty, 03:59:5xZ). So this is shared, already-landed
production code, not something either program is changing. The claim could have been checked at any
point today.

### 1.2 It is reachable on the video route, before authorization

- Route: `ExecutionVideoController.java:36` `@RequestMapping("/api/v1/studio")` +
  `:55` `@GetMapping("/executions/{id}/video")` → path is under `/api/`.
- The filter does **not** skip it: `BffSessionAuthenticationFilter.java:75`
  `if (!request.getRequestURI().startsWith("/api/")) { chain.doFilter(...); return; }`.
- `:91-103`: `resolveIdentity(request)` runs **before** `chain.doFilter(request, response)` at
  `:99`; `CoreServiceUnavailableException` is caught at `:102` and answered by `write503` at `:103`.
- That exception is real and thrown on the session-resolution path:
  `CoreServiceClient.java:50, :71, :96`, reached via `resolveCoreSessionIdentity` →
  `coreServiceClient.getUserMe(cookieValue)` (`:160`).

So a `503` on `GET /api/v1/studio/executions/{id}/video` can be written **before any Studio code
runs**, carrying a shape the controller never produces.

### 1.3 The other `503` producer on the same route

`ExecutionVideoException.storeUnavailable()`
(`backend/src/main/java/com/citi/put/checks/studio/evidence/ExecutionVideoException.java:89-95`)
→ `ChecksExceptionHandler.handleExecutionVideo`
(`backend/src/main/java/com/citi/put/checks/config/ChecksExceptionHandler.java:99-109`), whose
last line is:

```java
    return response.body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
```

Flat: `error` is a *string*. **No `Retry-After`** is set — the only header that handler can add is
`Content-Range` (`:104-107`), and `storeUnavailable()` passes `null` for it (`:93`).
`grep -rn "Retry-After" backend/src/main` returns seven hits; none is in the video path.

### 1.4 The two shapes are disjoint, and that is *measured*, not argued

`openapi.yaml` components (ours, `:1373-1395`): `ErrorResponse` is
`required: [error, message]` with `error: { type: string }`; `PlatformErrorResponse` is
`required: [error]` with `error` an object of `code`/`message`/`traceId`. Each therefore rejects
the other's body — and our own story-10.31 test already proves it against the live document:

`backend/src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoRefusalEnvelopeIT.java:154-160`
asserts `ErrorResponse` **must reject** the nested body and `PlatformErrorResponse` **must reject**
the flat one, both schemas read from `components.schemas` at `:214-217`.

This matters for the combinator: `oneOf` requires **exactly one** branch to match. Because the two
branches are mutually exclusive — measured — `oneOf` is correct and cannot produce the classic
"matched 2 schemas" failure. It is also the *right* combinator rather than `anyOf`: it says these
are two producers, not one loose shape.

### 1.5 Every row of their §30 producer table checks out

| Their row | Verified at |
|---|---|
| `writeError` → 401 nested `UNAUTHENTICATED` / "Session required" / `traceId` | `BffSessionAuthenticationFilter.java:101` + `:248-256` |
| `handleStudioAccessDenied` → 403 flat `STUDIO_FORBIDDEN` | `ChecksExceptionHandler.java:70`, `HttpStatus.FORBIDDEN` + flat `Map.of` |
| `storeUnavailable` → 503 flat, after authorization | `ExecutionVideoException.java:89-95`, `ChecksExceptionHandler.java:99-109` |
| `write503` → 503 nested, `Retry-After: 5`, before authorization | `BffSessionAuthenticationFilter.java:258-270`, §1.2 above |

### 1.6 Our own landed document already conceded the second shape — in prose only

Ours, `openapi.yaml` `503` description (`:814-819`):

> *"A `503` written by the platform authentication layer before authorization carries that layer's
> envelope instead (ADR-002 §25)."*

…while the very next lines declare `schema: { $ref: '#/components/schemas/ErrorResponse' }` and
nothing else. **Our contract states in prose what its schema denies.** A machine reading the
document — a generator, a validator, a mock — sees one shape; the running system sends two.

Worse, our refusal-order paragraph (`:764-769`) says:

> *"`404`, `410`, `416` and `503` are reachable only after authorization"*

which §1.2 shows is **false** for the filter's `503`. Theirs corrects exactly this sentence.

**Conclusion of §1: the claim is verified. Theirs is true of the running system; ours is not.**

---

## 2. Ruling 1 — the merged contract carries **theirs** for the `503`, **ours** for the components

### 2.1 The decision

The governing question the brief sets is the right one: *which is true of the running system.*
Under-declaring is bad; declaring a shape the system cannot emit is worse; declaring one shape
while the adjacent prose names a second is worst, because it defeats both the human and the
machine reader at once.

The merged `openapi.yaml` carries, **hunk by hunk** (`git merge-file` conflict numbering, in file
order):

| # | Region | Ruling | Why |
|---|---|---|---|
| 1 | `getExecutionVideo` **description** (refusal-order paragraphs) | **THEIRS, verbatim** | Ours contains a false sentence (§1.6). Theirs separates the store `503` from the authentication `503` correctly, keeps the `403`-conflation statement, keeps the branch-on-status instruction, and cites `§§24, 25, 30`. No test asserts any needle in this description — checked, see §2.4. |
| 2 | `getExecutionVideo` **`'503'` response object** | **THEIRS, verbatim** — `oneOf` + `Retry-After` header + `authenticationUnavailable` example | §1. It is the only version of this block that is true. |
| 3 | `components.responses.SessionUnauthorized.description` | **OURS** | See §2.2. |
| 4 | `components.responses.SessionUnauthorized.examples.sessionRequired.value` | **OURS** (flow form) | Semantically identical YAML. Ours matches the document's prevailing style — every other example on this route uses flow form (`noEvidence`, `expired`, `unsatisfiable`, `storeUnavailable`). |
| 5 | `components.schemas.PlatformErrorResponse.description` | **OURS** | See §2.2. |

**These five are the whole of row #6.** Everything else in their 98-line addition to this file
merges clean and is kept.

### 2.2 Why the components go the other way — and it is not symmetry for its own sake

Both descriptions are **§25.4 "The authorized edit, exact text"**
(`ADR-002-internal-contract-surface.md:2222`; the two paragraphs are at `:2233` and `:2252`),
applied verbatim by story 10.31, and the register row records exactly that: *"Exact text in §25.4,
applied verbatim"*.

Theirs is a faithful **paraphrase** of the same substance — I read both; they say the same thing.
But replacing an authorized-verbatim block with a paraphrase that carries no new fact would make
the register's own claim false, and would put the document out of step with the §25.4 text it is
supposed to be the application of. Under §12, "authorized amendment" means *this text*, not *text
to this effect*. Their one addition of substance is the `§30` cross-reference, which §2.3 places
properly.

The asymmetry with the `503` block is therefore principled, not arbitrary: **their `503` block
carries a fact ours lacks; their component descriptions carry no fact ours lacks.** Accuracy wins
where accuracy is at stake; the authorized text stands where it is not.

### 2.3 Optional, one clause — the `§30` cross-reference

If the folder wants theirs' one substantive addition without the paraphrase, append to our
`SessionUnauthorized` description, after *"(ADR-002 §25)"*:

> ` See also §30 for the two `503` producers on `getExecutionVideo`.`

This is discretionary. It changes the digest either way; §2.5 handles that.

### 2.4 Test impact — **the brief's stated basis is wrong; its conclusion is right**

The brief says *"No test of ours pins the 503 schema — a grep found none."* That is **not
accurate**, and the distinction is load-bearing rather than pedantic.

`ExecutionVideoEvidenceIT.java:598-606` **does** validate a `503` body against a schema:

```java
    JsonSchema errorResponse = componentSchema("ErrorResponse");
    assertThat(errorResponse.validate(bodyOf(unreachable)))
```

What makes taking theirs safe is **not** that no test pins the `503` schema. It is that this test
resolves `ErrorResponse` **by component name** — `componentSchema` reads
`components.schemas.<name>` (`:661` and, in `ExecutionVideoRefusalEnvelopeIT`, `:214-217`) — and
the `oneOf` change touches **neither component**. A `oneOf` whose branches are unchanged leaves
every component-level assertion exactly as it was.

I then checked the thing that *would* have broken, which the grep as described would not have
found: does any test read the `503`'s **response-level** schema?

- `ExecutionVideoContractTest` reads `content → application/json → schema → $ref` for the **`404`**
  (`:157-161`) and the **`416`** (`:167-170`) only. **Not the `503`.** Under `oneOf` there is no
  `$ref` at that path, so had either been a `503` assertion it would have gone red.
- `ExecutionVideoContractEscalationTest:93-111` and `ExecutionVideoContractTest:334` and
  `StudioContractTest:317` assert the **status set** (`200,206,401,403,404,410,416,503`) and
  nothing about bodies. Unaffected.
- `grep -rn '"503"' backend/src/test` filtered for `schema|content|responseOf`: **no hits.**
- No frontend or runner test asserts the video `503` schema.

**Net: taking theirs has no test impact — verified by reading the tests, on a stronger basis than
the one recorded.** The ruling is safe; the reasoning recorded for it needed correcting.

One side effect that is **not** a test failure but is a falsehood, and the fold must fix it: the
narrative in `studio-runner/test/run/confinement.test.ts` — item 7 of the re-anchor comment
(~`:168-185`) — says 10.31 landed *"a `503` with `ErrorResponse` content"* and *"its description
gains the refusal order and the 'branch on the status, never on the body' paragraph"*. Under this
ruling **both clauses become false.** That comment is the audit record the digest pin exists to
protect; leaving it stale launders the change. See §2.5, item 3.

### 2.5 The digest — three actions, one commit

`RULINGS.md` #17 is right that neither pin fits, and `pin-contract.sh` is the right tool, but it
moves **only the hash**. Three things must happen in the same commit as the contract change:

1. Resolve `openapi.yaml` per §2.1 (no conflict markers left — `pin-contract.sh` refuses otherwise).
2. `tools/epic10-fold/pin-contract.sh .` — re-reads the merged file and moves `BASE_SHA256`.
   **Do not hand-type either existing digest.** Ours (`d9f5f2a2…`) and theirs (`c877d6dd…`) are
   both wrong for the merged file; I verified they are the digests of the two *unmerged* files.
3. Reconcile the **narrative** around the pin, which the script does not touch. Keep our item 7,
   keep their two added comment lines (10.20 C0; 10.27/§29), and correct item 7's two false
   clauses. Suggested minimal edit — replace, in item 7, the phrase

   > `and a `503` with `ErrorResponse` content and a `storeUnavailable` example carrying `VIDEO_STORE_UNAVAILABLE`; its description gains the refusal order and the "branch on the status, never on the body" paragraph.`

   with

   > `and a `503` carrying a `storeUnavailable` example with `VIDEO_STORE_UNAVAILABLE`. **As finally merged, that `503` declares `oneOf ErrorResponse | PlatformErrorResponse` and a `Retry-After` header, and the operation's refusal-order paragraphs are the fold's, not 10.31's** — the second `503` producer is real (ADR-002 §30, and the fold ruling in `ADR-002-fold-ruling-video-503-envelope.md`). §24.6's text records what 10.31 landed; this file records what shipped.`

   Note also, as a finding rather than a required edit: their re-pin comment attributes their digest
   move to *"Story 10.20 C0"* and *"Story 10.27 / ADR-002 §29 … the confirmed artifact pair on
   public reads only"*, but their `openapi.yaml` diff **also** adds the video `401`/`403`/`503`,
   `SessionUnauthorized` and `PlatformErrorResponse` (hunks `@@ -756,0 +773,2 @@` and
   `@@ -784,0 +803,26 @@`, read 04:02:07Z). Their own pin narrative is incomplete about what moved
   their digest. This is corroborating evidence for Ruling 2, not a blocker.

### 2.6 Amendment class — **Class C**, and it needs saying why it is not a forbidden loosening

`docs/specs/studio/openapi.yaml` is frozen under ADR-002 §12. This change is **Class C**:
§12's Class C paragraph (`:306`) names *"status-code semantics, and anything on the public
surface"*, and `getExecutionVideo` is public surface. **Architect, always** — which is why this
ruling exists and why the fold may apply it: it is an authorized amendment, issued here, by the
authority §12 names. It is not a story exercising Class A latitude.

The objection that must be met, because it will be raised: §12's first binding rule says
**"Loosening is never a story's call. Reopening a closed body, relaxing `required`, or widening an
enum to admit what a producer happens to send is Class B even when it looks like Class A."**
Is `ErrorResponse` → `oneOf ErrorResponse | PlatformErrorResponse` that manoeuvre?

**No, and the rule's own wording says why.** Its target is widening *"to admit what a producer
happens to send"* — the INT-4 move, whose only effect is to stop a test telling the truth. Three
things distinguish this:

1. **It admits nothing new.** Both branches are pre-existing, closed, mutually exclusive shapes
   (§1.4, measured). Their union rejects every body neither producer emits. A `oneOf` of two
   disjoint closed schemas is not an open schema; `required` is relaxed nowhere and no enum widens.
2. **It is not accommodating a surprise producer.** Both producers were landed and known; our own
   document names the second one in prose (§1.6). The schema was behind the prose, not ahead of the
   code.
3. **It removes a statement nothing could satisfy rather than adding one.** Under §12's Class A
   definition — *"defects no producer or consumer could ever have satisfied"* — a `503` declared
   `ErrorResponse` on a route where a producer sends `PlatformErrorResponse` is precisely that
   defect. It sits on a Class C surface, so **Class C governs the authority**; but its character is
   corrective, not permissive.

The one thing this ruling deliberately does **not** do, and which stays open: it does not decide
which envelope the application should standardise on. That is O-19 / ADR-003, outside Epic 10, and
both programs' texts already say so. Declaring two shapes is an accurate description of a system
with two; it is not an endorsement of having two.

### 2.7 One fragility accepted, named so it is not re-litigated

Theirs declares `Retry-After` as `schema: { type: integer, enum: [5] }`. The `5` is accurate today
— it is the hardcoded literal at `BffSessionAuthenticationFilter.java:260` — and the header is
correctly optional (no `required: true`), matching §1.3's finding that the store `503` sends none.

But nothing enforces it: no test reads that header from the document, so if the literal is ever
tuned, the contract becomes quietly false rather than red. I considered dropping `enum: [5]`,
keeping `type: integer` and the description. **I am ruling take theirs verbatim** — it is true now,
it is discriminating, and a one-line hand-edit at fold time buys a hypothetical against a real
increase in merge risk. Recorded as a known weak point for whoever owns the next amendment to this
operation; not a fold action.

---

## 3. Ruling 2 — the register's double entry

### 3.1 What the merged register would actually say

Correcting the brief first: ours marks **two** rows *"LANDED by story 10.31 at `113948325`"*, not
three — `grep -c "113948325"` = 2, at lines 340 (§24.6, the video refusals) and 341 (§25.4, the
`401` envelope). Line 339 is story 10.15 and line 342 is story 10.30. The count does not change the
ruling; the rows do, so it is worth being right about which they are.

Theirs adds one row (their `:324`, read 04:05:33Z):

> `| 2026-09-17 | Land video 401/403/503 declarations from §§24/25, truthful nested session envelope, and both shipped 503 producer shapes (§30). No application behavior changed | C | @architect, story 10.27 | ESC-1/ESC-2 assertions unchanged; owner reruns contract/status fixtures and re-anchors digest |`

Merged as-is the register carries **three** defects, not one:

1. **Double attribution.** The same amendment lands twice, under 10.31 and 10.27, with two
   different `503` schemas. A reader cannot tell what the contract says or who changed it — which
   is the one job this table has.
2. **A false claim in the merged document.** *"Land video 401/403/503 declarations"* was true of
   their tree, where the video route had no `401`/`403`/`503`. In the merged document 10.31 landed
   them at `113948325` and their row would claim the landing a second time. The same applies to
   *"truthful nested session envelope"*: `SessionUnauthorized`/`PlatformErrorResponse` are already
   there, and **ours re-points eleven further operations at them that theirs does not** — verified
   by counting: `grep -c "responses/SessionUnauthorized"` = **12 ours / 1 theirs**;
   `responses/Unauthorized` = **2 ours / 13 theirs**.
3. **Ordering.** §13's table is chronological **ascending** — `2026-09-11` ×12, then `09-12`, then
   `09-16`, then `09-16 (landed 09-17)`. Their `2026-09-17` row is inserted as the **first** data
   row, above the `2026-09-11` entries.

It also makes our row 340 stale, since that row says the `503` is `ErrorResponse` and *"Exact text
in §24.6, applied verbatim"*, which Ruling 1 supersedes.

### 3.2 The principle the reconciling text has to satisfy

Neither account may be silently deleted, and the reader must be able to tell what actually
happened. Those two pull against each other only if you treat the register as a list of authors.
It is not: it is a list of **amendments in the order the document acquired them**. The merged
document acquired the video refusal surface **once**, from 10.31 — and then acquired a **correction
to one response object** at the fold, which theirs is the source of and which is genuinely new.

So: keep 10.31's rows as the record of the landing; convert theirs from a *second landing* into the
*correction* it actually is in the merged document; and make each row point at the other so neither
can be read alone. Their §§29/30 stay in full — §30 is the analysis that justifies the correction,
and it is the better piece of work on this question.

### 3.3 Exact text to apply at fold time

Three edits, all in `docs/architecture/ADR-002-internal-contract-surface.md`. Anchors are quoted
strings, not line numbers.

---

**R2-a — amend our §24.6 row.** In the row beginning
`| 2026-09-16 (landed 2026-09-17) | **LANDED** by story 10.31 at `113948325`. `getExecutionVideo` declares`:

*Find:*

```
and **`503`** (`ErrorResponse`, `storeUnavailable` example, code `VIDEO_STORE_UNAVAILABLE`)
```

*Replace with:*

```
and **`503`** (`storeUnavailable` example, code `VIDEO_STORE_UNAVAILABLE`; declared `ErrorResponse` as §24.6 wrote it, **superseded at the 2026-09-18 fold — see the last row of this table**)
```

*and, in the same row, find:*

```
Exact text in §24.6, applied verbatim.
```

*Replace with:*

```
Exact text in §24.6, applied verbatim as landed. §24.6 is left unedited: it is the record of what story 10.31 landed, and the `503` response object it specifies was superseded at the fold, not retracted.
```

Nothing else in this row changes. Its measurement cell stays exactly as it is — those numbers were
measured against what 10.31 landed and remain true of it.

---

**R2-b — replace their row, and move it.** Delete their inserted row in full (the one beginning
`| 2026-09-17 | Land video 401/403/503 declarations from §§24/25`) and insert the following as the
**last** data row of §13's table, after the story-10.30 row:

```
| 2026-09-18 (fold) | **CORRECTION, not a second landing.** The video refusal surface was landed once, by story 10.31 at `113948325` (the two rows above). This row records what the fold of the studio-inference program changed about it: `getExecutionVideo`'s **`503` response object only**. It now declares **`oneOf` `ErrorResponse` \| `PlatformErrorResponse`**, an optional **`Retry-After`** header, and a second example `authenticationUnavailable`; and the operation's refusal-order paragraphs are replaced. Reason: the route has **two** `503` producers, and §24.6's single `ErrorResponse` could never describe one of them — `BffSessionAuthenticationFilter.write503` (`:258-270`) sends a nested `PlatformErrorResponse` body with `Retry-After: 5`, **before** Studio authorization, on any `/api/**` path. §24.6's own prose already conceded this envelope while its schema denied it, and its refusal-order paragraph said all `503`s occur after authorization, which is false for that producer. Analysis and the producer table are in **§30**, contributed by the studio-inference program; the runtime behaviour was independently verified in code at the fold (`ADR-002-fold-ruling-video-503-envelope.md` §1) before this was accepted. **What did *not* change:** no status set moved; `components.schemas.ErrorResponse` and `components.responses.Unauthorized` are still unedited; `SessionUnauthorized`/`PlatformErrorResponse` and the twelve-operation `401` re-point are story 10.31's and are untouched here; no production code changed. O-19 / ADR-003 remains undecided. | C — status-code semantics on a public operation (§12) | Ruled by @architect at the fold, `ADR-002-fold-ruling-video-503-envelope.md`. Source of the amended text and of §§29–30: the studio-inference program, drafted there as "story 10.27" | No test asserts the `503`'s response-level schema — verified by reading, not by absence of a grep hit: `ExecutionVideoEvidenceIT:598` and `ExecutionVideoRefusalEnvelopeIT:137-138` validate `503`/`401`/`403` bodies against **components**, which are unchanged, and `ExecutionVideoContractTest` reads a response-level `schema.$ref` for the `404` (`:157`) and `416` (`:167`) only. Status-set assertions (`StudioContractTest:317`, `ExecutionVideoContractTest:334`, `ExecutionVideoContractEscalationTest:110`) are unaffected: the set is still `200,206,401,403,404,410,416,503`. The runner digest moves once for this and every other fold edit, via `tools/epic10-fold/pin-contract.sh`, in the same commit (§28) |
```

---

**R2-c — disclose §30's provenance where §30 is read.** Their §30 heading and first line attribute
the work to story 10.27 and were written against a tree that did not contain `113948325`. Both
accounts survive; the reader is told which is which. *Find:*

```
## 30. Video error responses landed — story 10.27 (2026-09-17)
```

*Replace with:*

```
## 30. Video error responses — the two `503` producers (drafted 2026-09-17, applied at the 2026-09-18 fold)

> **Provenance.** Drafted in the studio-inference program as story 10.27, on a tree that did not
> yet contain story 10.31's landing (`113948325`). Read against the merged document, its framing
> is one amendment out of date: the `401`/`403` declarations and the
> `SessionUnauthorized`/`PlatformErrorResponse` components it describes as being landed here were
> already landed by 10.31, which additionally re-pointed **eleven** further public operations at
> `SessionUnauthorized` — so the paragraph below beginning *"This video-only landing does not
> claim"* is true of the tree this was drafted on and **not** of the merged document. What §30
> contributes, and what the fold adopted, is the **producer table and the `oneOf` ruling for the
> `503`**. Its producer table was re-verified line by line against the code at the fold
> (`ADR-002-fold-ruling-video-503-envelope.md` §1.5) and is accurate. See the 2026-09-18 row of §13.
```

§29 needs no change: it is about `confirmedRevisionArtifact`, has no counterpart on our side, and
is not part of this double entry.

### 3.4 What a reader ends up able to say

Reading §13 top to bottom, in date order: 10.31 landed the video refusal surface on 2026-09-17,
including a `503` declared `ErrorResponse`; the fold on 2026-09-18 corrected that one response
object to `oneOf` because a second producer exists; §24.6 and §25.4 record what was authorized
then, §30 records why it was corrected, and this ruling records who checked the code and what they
found. Neither program's account is deleted, and neither is left standing where it is false.

---

## 4. Ruling 3 — RECON-1 is a design disagreement, and it will come back

I did not re-decide the fold ruling (ours governs authorization in full, their additive overloads
kept) and I do not need to. But the brief asks whether the divergence is an accident. **It is not.
It is a coherent, different model of authorization, and that is worse than an accident because
accidents do not recur.**

The evidence, as recorded in `RULINGS.md` #1 and consistent with what I read of the merged
semantics:

- Theirs authorizes `updateTest` on `findCsiIdIncludingWithheld(id)` — **through** the withheld
  read, ahead of the revision check.
- Theirs leaves `DELETE` with no identity at all: their `StudioController` is unmodified, so the
  base `deleteTest(@PathVariable UUID id)` runs.
- Their `StudioAuthoringService` authorizes only its own routes.

Read together these are not three slips; they are one consistent position — **authorization is a
per-route concern, applied where each route is written.** Ours is the opposite position:
authorization is a property of the *service boundary*, applied uniformly, and the withheld read is
deliberately not an input to it, because reading through it lets a withheld draft's owner
distinguish *withheld* from *absent* (ADR-002 §14.5).

Two consequences worth stating plainly:

1. **Per-route authorization fails silently and open.** A route added without the check is
   authorized for anyone; there is no place where its absence is visible. That is exactly the shape
   of the `DELETE` gap — nobody removed a check, someone added a service and did not add one. The
   boundary model fails *closed* and *loudly*: our `requireWrite` rename is what makes their calls
   fail to compile, which is how this divergence surfaced at all rather than shipping.
2. **"Authorize on the withheld read" is an information-flow decision, not an ordering detail.**
   It will look like a harmless refactor every time someone meets it, because the authorization
   outcome is the same in every case except the one that matters.

**Recommendation — not a fold action, and not a blocker on this ruling:** the fold lands ours, and
then someone should write the boundary rule down where the next person writing a Studio service
will meet it, rather than leaving it implicit in a method name. ADR-002 §14.5 has the withheld-read
half; the "authorization lives at the service boundary, never per-route" half is currently only in
reviewers' heads. I am not opening that as work here — it is outside Epic 10's closure and it needs
the other program in the room, not a ruling issued at them.

---

## 5. Corrections to the brief and to `RULINGS.md`

Stated because the brief asks to be checked rather than complied with, and each of these was found
by checking.

| Claim | Status |
|---|---|
| *"Ours marks **three** register rows 'LANDED by story 10.31'"* | **Wrong — two** (`:340`, `:341`). `grep -c "113948325"` = 2. |
| *"No test of ours pins the 503 schema — a grep found none"* | **Wrong as stated; conclusion right.** `ExecutionVideoEvidenceIT:598-606` validates a `503` body against a schema. It survives because it resolves `ErrorResponse` **by component**, which `oneOf` does not touch. The safety comes from *that*, not from absence. §2.4. |
| *"Their ADR text asserts … they claim the runtime actually emits two shapes"* | **Verified true.** §1. |
| *"Ours is `d9f5f2a2…`; theirs computes `c877d6dd…`"* | **Confirmed**, both recomputed. |
| *"`epic/EPIC-10-w7` at `c025422bb`"* (`RULINGS.md` header) | Now `57a6e9095`; three fold-tooling commits later. Immaterial — merge-base is unchanged at `ff0513385`. |
| *"~263 dirty paths"* in `wt/epic` | **241** at 2026-09-18T03:59:35Z. Oscillating, as warned. |
| `RULINGS.md` #17: *"Run `pin-contract.sh` after #6, same commit"* | **Necessary but not sufficient.** The script moves only the hash; the re-anchor **narrative** in the same file becomes false under this ruling and must be corrected in that commit. §2.5 item 3. |
| `RULINGS.md` #6: *"rc 5, all same-region"* | **Confirmed** — rc 5, five conflicts, reproduced independently. |
| `RULINGS.md` #2: recommends our wording for `StudioContractTest`'s `.as()` attribution (10.31 over 10.27) | **Still correct under this ruling.** The *landing* is 10.31's; the fold correction is recorded in §13, not in a test message. |

---

## 6. What I could not verify

Stated plainly, and none of it blocks either ruling.

- **I ran no tests.** No Gradle (MED-2: `./gradlew check` hangs and must never be run; another run
  may be in flight), no Vitest. Every test claim above comes from **reading test source**, and is
  a claim about what the code asserts, not about it passing. In particular I have **not** observed
  the merged contract green anywhere.
- **`spotless` / `googleJavaFormat` conformance** of anything in the merged `StudioService.java` or
  the reflowed `ExecutionVideoContractTest` — unchecked, as `RULINGS.md` already says.
- **Their tree is uncommitted and moved while I read it** (263 → 241 dirty paths between the brief
  and 03:59:35Z). Every "theirs" fact above is a snapshot of `wt/epic` @ `ff0513385` + working tree
  between **03:59:35Z and 04:05:33Z on 2026-09-18**, and `openapi.yaml` specifically as copied at
  **04:02:34Z** (sha256 `c877d6dd…`). **The folder must re-verify that digest before applying
  Ruling 1**; if it has changed, their `503` block must be re-read before it is taken. `preview.sh`
  recomputes from the live tree.
- **I did not read the other ~230 dirty paths** in their tree. If any of them touches
  `BffSessionAuthenticationFilter`, `ChecksExceptionHandler` or `ExecutionVideoException` after
  04:05:33Z, §1 needs re-running. At the time read, the filter was **unmodified** in their tree.
- **Whether `oneOf` degrades any downstream generator or mock** (OpenAPI codegen, MSW handlers) —
  not investigated. No test covers it; I found no generator committed in this repo that consumes
  this document, but I did not search exhaustively.
- **`ExecutionVideoRefusalEnvelopeIT`'s recorded discrimination results** (`[$.error: object found,
  string expected]` etc.) are quoted from the ADR-002 register cell, i.e. **someone else's
  measurement**. I verified that the test makes those assertions; I did not re-run it to confirm
  the messages.

---

## 7. Applying this — where it slots into the fold

Unchanged from `tools/epic10-fold/RULINGS.md` "Sequence, Path B", with this ruling supplying
step 2's content for rows #4 and #6 and adding one item to step 3:

- **Step 2**, row #6 → §2.1 of this document (five hunks, three ours / two theirs).
- **Step 2**, row #4 → §3.3 of this document (R2-a, R2-b, R2-c).
- **Step 3**, after `pin-contract.sh` → §2.5 item 3: correct the re-anchor narrative in
  `studio-runner/test/run/confinement.test.ts` **in the same commit**.
- Steps 4–7 unchanged. Remote publication and PR creation remain @devops-exclusive.

Both rulings are self-contained: nothing here waits on anything else, and nothing here requires
either program to change code.
