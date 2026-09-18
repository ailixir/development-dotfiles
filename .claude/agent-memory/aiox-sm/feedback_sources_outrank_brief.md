---
name: feedback-sources-outrank-brief
description: When a spawn brief conflicts with Epic 10 / architecture normative sources, verify against the sources and surface the conflict before drafting
metadata:
  type: feedback
---

When a coordinator's mission brief conflicts with the normative sources (Article IV: the retired
Epic 10 markdown at commit `9425e7e7d`, `docs/architecture/studio-execution.md`,
`docs/epics/EPIC-10-EXECUTION.yaml`, `docs/architecture/ADR-001-studio-runner-scaffolding.md`),
the sources win. Verify, then state the conflict plainly in the report's open-questions section.

**Why:** drafting story 10.6 (2026-09-11), the brief instructed me to put the API-side admission
CAS, progress persistence, reapers and restart recovery into a story whose epic scope line is
runner-only. I drafted it as briefed and flagged the seam as an open question. The coordinator
checked the sources and ruled my question correct — the brief was wrong, and the misplacement
would have given the browser runner database credentials, breaking architecture §9.2
("the runner … has no platform user session or DB/vault/CSI/LLM credentials"). The redraft cost
a full rewrite that a pre-draft check would have avoided.

**How to apply:** before drafting any Epic 10 story, read the retired epic's section for *that
story and its immediate neighbours*, plus the manifest's `depends_on`/`blocks` and ADR-001's
directory map. If the brief expands scope past what those say the story owns, raise it before
writing, not after. A brief that assigns a component work its architecture forbids is the
strongest signal — check the component's credential/isolation rules first.
