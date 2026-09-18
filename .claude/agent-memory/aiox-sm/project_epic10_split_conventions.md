---
name: epic10-split-conventions
description: Epic 10 (Checks Studio execution) story conventions — a/b criteria splits for externally gated work, and where the 10.6/10.7 scope boundary was redrawn.
metadata:
  type: project
---

Epic 10 stories split any externally gated acceptance criterion into an `a` part verifiable
now and a `b` part naming the later owning story plus its `ED-0n` gate. Deferred parts are
recorded as *skipped, never passed*. Established by 10.3, reused by 10.6 and 10.7.

Story 10.6 was redrafted runner-only on 2026-09-11; about thirteen API-side criteria
(admission CAS persistence, progress/terminal persistence, persist-before-acknowledge,
snapshot revision assignment, the `/internal/**` chain, restart recovery, reapers, ambiguity
resolution, SSE) moved to 10.7.

**Why:** architecture §9.2 gives the runner no DB/vault/CSI/LLM credential, so anything
implying persistence on the runner's side of the wire never belonged in 10.6.

**How to apply:** when drafting or validating any remaining Epic 10 story, check whether a
criterion implies persistence, identity or vault access on the runner side — if so it belongs
to an API story. Do not re-litigate the 10.6/10.7 boundary; 10.6's Out-of-scope section is the
authoritative list. See [[normative-sources-outrank-brief]].

**The M → L pattern has a second cause, found drafting 10.15 (2026-09-12) — seven for seven.**
@po's diagnosis was "an architect ruling landed after the estimate", and the proposed rule is that
every ADR-002 amendment **assigning an open item (O-n) to a story** carries a manifest size re-check
in the same PR. That rule would not have caught 10.15: it carries **no** assigned open item, which is
exactly why @po declined to re-estimate it. What moved it is ADR-002 **§12's amendment classes, §13's
log obligation and `FOC-04`'s pin re-anchor rule** — a *standing obligation on every story that
touches a shared artefact*, all of which postdate the manifest's sizes.
**Why:** an amendment that creates a standing obligation invalidates estimates just as an assigned
open item does, for every story still holding a pre-amendment number, and it is invisible to a rule
keyed on assignment.
**How to apply:** when sizing or validating any remaining story, ask not only "does it carry an O-n"
but "does it touch the frozen contract, a pinned artefact, or anything §12 classifies". If yes, the
pre-ADR-002 letter is unverified regardless of open items. Proposed as a one-clause amendment to
@pm's rule in 10.15's *Size* section. See [[anti-vacuous-criteria]].

**Dependency assumptions: write the property AND its rediscovery method.** @po's note that
property-shaped assumptions survived a merge that broke an identifier-shaped one is right but
incomplete — 10.14's A-4 named a *call sequence*, which is a property, and it still broke. What held
were assumptions naming **observable behaviour with a way to relocate it**: "flip the execution's CSI
→ the answer flips; flip the parent's → it does not" identifies the right code path without naming it.
10.15's B-1…B-9 are written that way, each verified by reading the merged code rather than the
depended-on story.

**A manifest comment that says a config→child plumbing path is "inferred, not traced" is telling you
the size estimate rests on an unverified chain — trace the whole thing before drafting, not just the
two named endpoints.** Found drafting 10.32 (2026-09-16, O-20): the manifest named `server/config.ts`
`KEY_SPECS` and `childRuntime.ts:285` as the two ends and left the middle inferred. The real chain has
five hops (`main.ts` → `ChildLauncherOptions` → the `LaunchMessage` the child is `fork`ed with →
`protocol.ts`'s default-deny validation → the child-side read), because **`studio-runner`'s child
process environment is NOT inherited from the parent** — `launcher.ts`'s `childEnvironment` builds it
from an explicit `INHERITED_ENV_KEYS` allowlist only, deliberately, so runner configuration "never
enters the process that opens untrusted pages" (§9.3). Any new runner setting that a *child-process*
code path needs travels as data in the `LaunchMessage`/`ExecuteMessage` IPC channel, the same way
`recording: { width, height }` already does — never as a new `STUDIO_RUNNER_*` env var, no matter how
natural that looks from the config-loader side alone. **How to apply:** before sizing or drafting any
Epic 10 story that adds a runner config key consumed inside `src/run/**` (the child side), grep
`ChildLauncherOptions`, `LaunchMessage`/`ExecuteMessage`, and `ACCEPTED_LAUNCH_KEYS`/
`ACCEPTED_EXECUTE_KEYS` in `protocol.ts` — that is the real channel, and each hop is a file the story
must name. See [[anti-vacuous-criteria]].

**Epic 10 has no CodeRabbit Integration section in any story, in any wave — do not add one from the
generic template.** Ruled once by @po on 2026-09-11, restated verbatim in `10.17.story.md:879-882`:
`coderabbit_integration.installation_mode` is `wsl`, the repository is worked on a Darwin host, the
CLI is absent, and `graceful_degradation.skip_if_not_installed: true` applies. Confirmed still true
and still followed by every Epic 10 story checked through 10.16 (2026-09-16). **How to apply:** when
drafting any Epic 10 story, cite that ruling once (do not re-derive it) and omit the section entirely,
even though `core-config.yaml` reports `coderabbit_integration.enabled: true` and the generic
`create-next-story` task and `story-draft-checklist` both ask for it — the epic-specific ruling
overrides the generic template for this epic only.
