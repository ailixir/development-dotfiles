---
name: epic10-coderabbit-format
description: Epic 10 stories carry no CodeRabbit section — the integration is wsl-mode on a Darwin host and the CLI is absent
metadata:
  type: project
---

**No Epic 10 story carries a CodeRabbit section.** Ruled once for the epic by @po on
2026-09-11 (recorded in story 10.12's Implementation Notes) so it is not re-decided per story.

**Why:** `.aiox-core/core-config.yaml` sets `coderabbit_integration.enabled: true` but
`installation_mode: wsl`, and its commands are literal `wsl bash -c …`. This repository is
worked on a Darwin host where that cannot run; `~/.local/bin/coderabbit` does not exist and
`coderabbit` is not on PATH. `graceful_degradation.skip_if_not_installed: true` applies. No
story in `docs/stories/` has ever carried such a section and `docs/qa/coderabbit-reports/`
does not exist.

**How to apply:** when a draft checklist expects a CodeRabbit section and the house story
format has none, the house format wins — do not add the heading and do not mark it a gap. If
the CLI is ever installed on a supported host, @devops re-enables it and the format changes
once for the whole epic, not story by story.
