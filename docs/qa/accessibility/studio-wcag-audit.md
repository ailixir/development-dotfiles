# Checks Studio — WCAG conformance audit

> **Revalidation — 2026-09-20:** The two-panel Studio redesign removed all pinned
> critical/serious violations from the five `ChecksStudioPage` states and from `StudioRunsPage`.
> `StudioTestsPage` retains one `button-name` and one `aria-prohibited-attr` node. The automated
> guard has been re-anchored to those current counts, with `A11Y-3` and `A11Y-4` closed and
> `A11Y-1`/`A11Y-2` narrowed in the acceptance register. The historical 2026-09-17 measurement
> below is retained as the original audit record. Manual assistive-technology, contrast, and
> target-size validation remain outstanding.

**Story:** [10.19](../../stories/10.19.story.md) AC-12, closing story 10.10 AC-18(b).
**Date:** 2026-09-17 · **Branch:** `story/10.19` at integration head `d3700f23d`
**Scope:** the standalone / MSW-backed build. **Not staging.** No `ED-*` or `SPK-*` id gates this
audit, and none is claimed.

> ## Verdict, up front
>
> **AC-12(a) — automated scan: DONE, and it found real defects.** All seven named surfaces were
> scanned. **Every one carries at least one `critical` or `serious` violation.** AC-12(a) permits
> exactly two outcomes: zero such violations, *or* every one of them ticketed with a named owner and
> severity in the register. This audit takes the second branch — see `A11Y-1` … `A11Y-4` in
> [`../staging-acceptance-register.md`](../staging-acceptance-register.md).
>
> **AC-12(b) — manual assistive-technology pass: NOT DONE.** It requires a human driving a screen
> reader (VoiceOver or NVDA) through write → confirm → run → watch and writing down every place the
> announced role/name/state diverges from what is visually shown. **No screen reader was run. No
> transcript exists.** It is not recorded here as skipped-because-blocked — nothing external blocks
> it — it is recorded as **outstanding work with an owner**, below. **AC-12 as a whole is therefore
> PARTIAL, and story 10.19's AC-12 checkbox stays unticked.**
>
> Fabricating an assistive-technology walkthrough would have been the easiest thing in this story to
> fake and the hardest thing to catch. It is not faked.

---

## 1. AC-12(a) — the automated scan

**Harness:** `frontend/src/test/a11y/studioWcagAudit.test.tsx`
**Engine:** `axe-core` **4.13.0**, added as a `devDependency` under AC-12's own provision
(`frontend/package.json`, installed with `npm` per this project's lockfile convention).
**Machine-readable result:** [`axe-results.json`](axe-results.json), written by the harness itself so
this document quotes a reading rather than a recollection.
**Command:** `npx vitest run src/test/a11y/studioWcagAudit.test.tsx` from `frontend/` — **7 passed
(7)**.

### 1.1 What was scanned

`axe.run` is given the live `document.body`, not the container React Testing Library returns, so a
dialog or portal rendering outside that container is not silently unscanned.

| # | Surface | How it was driven |
|---|---|---|
| 1 | Studio tests list (`StudioTestsPage`) | MSW-served draft list; scanned after the served draft's name appears, so the loaded list is read rather than a spinner |
| 2 | Studio runs list (`StudioRunsPage`) | MSW-served empty executions page |
| 3 | `ChecksStudioPage` — **author** | `readyDraft`, scanned once `Run Test` is present |
| 4 | `ChecksStudioPage` — **compile-review** | `awaitingDraft`; the page mounts `CompileReviewPanel` inline for the selected draft |
| 5 | `ChecksStudioPage` — **confirm** | `awaitingDraft`; **1 confirm affordance found and reachable** — recorded because its absence would have been a finding, not a silent pass |
| 6 | `ChecksStudioPage` — **run / SSE-progress** | the scripted transport seam (10.11b's) driven with three `RUNNING` frames from `DEV_TRANSPORT_SCENARIO` |
| 7 | `ChecksStudioPage` — **video-playback** | `TERMINAL_EVIDENCE_SETTLED`; asserted exactly one `<video>` is mounted before scanning |

### 1.2 Results — every surface, every impact

| Surface | critical | serious | moderate |
|---|---|---|---|
| `StudioTestsPage` | `button-name` ×2 | `aria-prohibited-attr` ×2 | `heading-order` ×1, `region` ×7 |
| `StudioRunsPage` | `button-name` ×1 | `aria-prohibited-attr` ×1 | `region` ×1 |
| `ChecksStudioPage/author` | `button-name` ×13, `label` ×4 | `aria-prohibited-attr` ×12 | `heading-order` ×1, `region` ×14 |
| `ChecksStudioPage/compile-review` | `button-name` ×13, `label` ×4 | `aria-prohibited-attr` ×12 | `heading-order` ×1, `region` ×15 |
| `ChecksStudioPage/confirm` | `button-name` ×13, `label` ×4 | `aria-prohibited-attr` ×12 | `heading-order` ×1, `region` ×15 |
| `ChecksStudioPage/run-progress` | `button-name` ×13, `label` ×4 | `aria-progressbar-name` ×3, `aria-prohibited-attr` ×12 | `heading-order` ×1, `region` ×18 |
| `ChecksStudioPage/video-playback` | `button-name` ×13, `label` ×4 | `aria-prohibited-attr` ×12 | `heading-order` ×1, `region` ×16 |

**Re-measured 2026-09-20 on `main` (`cd2ab3001`), after the Epic 10 / Studio v1 fold.** Two rows above changed; the table is left as measured on 2026-09-17 and the pins in `studioWcagAudit.test.tsx` were re-anchored to these:

| Surface | critical | serious | moderate |
|---|---|---|---|
| `StudioTestsPage` | `button-name` ×1 | `aria-prohibited-attr` ×1 | `heading-order` ×1, `region` ×7 |
| `StudioRunsPage` | — | — | `region` ×1 |

The cause is Studio v1 WP5 (`2e06d0b5d`), which added an `aria-label` to the runs page's Refresh `IconButton` and to the tests page's Run button. The five `ChecksStudioPage` rows were unchanged by WP5; the later two-panel redesign cleared them (see the 2026-09-20 revalidation note at the top, which is what the current pins and `axe-results.json` record).

**Re-measured 2026-10-04 after the compact Tests and Runs lists.** Both list surfaces now have
zero critical/serious violations. The Tests-page Delete button has its own `aria-label`, search
fields have programmatic names, and tooltip wrappers use `describeChild` instead of putting
labels on generic spans. The Tests-page pins are now empty; A11Y-1 and A11Y-2 are resolved in
the automated scan. This does not close the outstanding manual assistive-technology pass.

### 1.3 The four ticketed critical/serious findings

Each is `A11Y-N` in the register, with an owner and a severity.

| Ticket | Rule | Impact | WCAG | What it is | Where |
|---|---|---|---|---|---|
| **`A11Y-1`** | `button-name` | **critical** | 4.1.2 Name, Role, Value (A) | Icon buttons with no discernible text. The name lives on a wrapper `<span aria-label="…">` that MUI's `ListItemSecondaryAction` clones around the button, so the **button itself** has no accessible name. A screen reader announces "button" with nothing else. | Step-list row controls (*Move up*, *Move down*, *Remove step*) ×12 on `ChecksStudioPage`, plus one page-level control; ×2 on `StudioTestsPage`, ×1 on `StudioRunsPage` |
| **`A11Y-2`** | `aria-prohibited-attr` | **serious** | 4.1.2 (A) | The same wrapper: `aria-label` on a generic `<span>` with no role. ARIA forbids `aria-label` on elements with no role that supports a name, so the label is discarded rather than merely misplaced. **`A11Y-1` and `A11Y-2` are one defect seen from two sides** and should be fixed together — move the `aria-label` onto the `IconButton`. | Same nodes as `A11Y-1` |
| **`A11Y-3`** | `label` | **critical** | 1.3.1 Info and Relationships (A), 3.3.2 Labels or Instructions (A) | Four form elements with no programmatic label. Present on every `ChecksStudioPage` state (targets `#:r10:`, `#:r14:`, `#:r18:`, `#:r1c:` — MUI-generated ids, so they must be identified by position in the tree, not by id). | `ChecksStudioPage`, all five states |
| **`A11Y-4`** | `aria-progressbar-name` | **serious** | 4.1.2 (A) | Three `role="progressbar"` nodes (a `LinearProgress`, a `CircularProgress` and the root) with no accessible name. A screen-reader user in a live run hears a progress bar that does not say what is progressing. **Only on the run/SSE-progress surface** — the one where progress is the whole point. | `ChecksStudioPage/run-progress` |

### 1.4 The moderate findings — recorded, not ticketed

AC-12's threshold is `critical`/`serious`. These are recorded so the next audit starts from a
reading rather than from scratch, and so nobody infers the pages are otherwise clean.

- **`region` (7 / 1 / 14–18 nodes)** — content outside any landmark. The scan renders each page
  *without* `ChecksLayout`, which supplies the `<main>` landmark, so this count is **inflated by the
  harness** and is not a trustworthy figure for the running application. Stated rather than quietly
  dropped. Re-measure once ENV-1(a) lets `ChecksLayout` render.
- **`heading-order` (1 node)** — a heading level skipped. Present on six of the seven surfaces.

### 1.5 What this scan cannot tell you — three named limits

1. **`ChecksLayout` was not scanned at all.** It imports `PlatformSidebar` from
   `@put/core-components`, whose symlink does not resolve from a worktree (**ENV-1(a)**, @devops's).
   `ChecksLayout.a11y.test.tsx` fails at file level for the same reason and contributes no counted
   test. **The skip link that ENV-1(c) and AC-14 are about therefore could not be scanned, and is
   not claimed here as scanned.**
2. **`color-contrast` and `target-size` were disabled.** jsdom has no layout engine; both rules need
   computed geometry and colour. Their absence from the results is **an unmeasured area, not a clean
   one.** They need a browser-driven run (Playwright + `@axe-core/playwright`) or a manual check.
3. **An automated scan is a floor.** `axe-core` mechanically covers roughly a third of WCAG's success
   criteria. Focus order, meaningful sequence, error identification and the live-region behaviour
   during a run are **judged, not measured** — which is precisely what AC-12(b) exists to do, and it
   has not been done.

### 1.6 The guard is pinned, and it was falsified

The harness does not merely record. It pins the exact critical/serious node count per surface and
fails on **four** directions: a new rule, a rule that grew, a rule that shrank, and a ticketed rule
that disappeared. The last two fail *on improvement*, deliberately — a ticket that no longer
describes reality has to be closed, not left to rot.

Proven by mutation on 2026-09-17, each restored and verified with `shasum -a 256`:

| Mutation | Result |
|---|---|
| **Product:** strip `aria-label="Reload scenarios"` from a real `IconButton` in `ChecksStudioPage.tsx` | **RED** on all five `ChecksStudioPage` surfaces (`button-name` 13→14, `aria-prohibited-attr` 12→13); **green** on `StudioTestsPage` and `StudioRunsPage`, which do not mount that control |
| Remove `label` from the author surface's pin | **RED** — *"NEW critical/serious violation `label` (critical, 4 nodes)"* |
| Inflate `StudioRunsPage`'s `aria-prohibited-attr` pin 1→5 | **RED** — *"SHRANK … close or re-scope its ticket … and re-anchor this number in the same PR"* |
| Pin `image-alt` ×2 on a surface that does not produce it | **RED** — *"ticketed violation `image-alt` is GONE"* |

The first row is the one that matters: it proves the guard is wired to the product, not only to its
own table.

---

## 2. AC-12(b) — the assistive-technology pass

> **STATUS: NOT DONE. NO SCREEN READER WAS RUN.**

AC-12(b) requires a manual walkthrough of the full **write → confirm → run → watch** flow with a
screen reader, recording which one (VoiceOver or NVDA), and documenting every place the announced
role/name/state diverges from what is visually shown.

**It has not been performed.** There is no transcript, no recording and no session. This section is
the work item, not its result.

| Field | Value |
|---|---|
| Screen reader used | **none — not run** |
| Date | — |
| Operator | — |
| Flow covered | — |
| Divergences found | — |

### Owner and next step

**@ux-design-expert (Uma)** runs it, alongside AC-13's user trial, which needs the same assembled
flow and the same scheduling; **@qa (Quinn)** records the divergences. It is **not** blocked on any
`ED-*`/`SPK-*` id and must never be recorded as blocked.

### What the automated scan predicts it will find

Stated as **predictions from §1's readings**, so the walkthrough has something to confirm or refute
rather than starting blank. **None of these is a finding until a human hears it.**

1. **The step-list controls will announce as bare "button"** (`A11Y-1`/`A11Y-2`). Reordering or
   removing a step by screen reader alone is the first thing to try.
2. **The progress bar during a run will announce without a name** (`A11Y-4`). Whether the run's
   state is recoverable from the live region instead is exactly the kind of question §1 cannot
   answer.
3. **Four form fields will announce without labels** (`A11Y-3`). Which four, and what a user hears
   instead, needs the walkthrough.
4. **The confirm step is the highest-stakes surface in the product** — BRD §8's rubber-stamp risk.
   Whether the artifact under review is *readable by ear* is a judgement no rule set makes.

---

## 3. Register cross-reference

`A11Y-1` … `A11Y-4` and this audit's two open items (AC-12(b); the unmeasured `color-contrast` /
`target-size` area) are carried in
[`../staging-acceptance-register.md`](../staging-acceptance-register.md) §4.4. If the two documents
ever disagree, the register is the handover document and this one is the measurement.
