---
name: obs009-push-20261023
description: 2026-10-23 commit+push of the OBS-009..011 closure wave (c767efbe7..64136dc47); what stayed unstaged and how the push hook was satisfied
metadata:
  type: project
---

Pushed 9 commits (7b360fcb1..64136dc47) to origin/brunobuger/ui-studio (remote repo is ailixir/development-dotfiles). Evidence rule = R4 policy ([[r4-evidence-commit-policy]]); OBS-011 evidence (15376 files, ~375 MB) committed as text record.

Left unstaged on purpose: `.aiox-core/core/permissions/dispatch-governance.js` (L1) and `.claude/settings.json` (drops Write deny rules). Stray `backend/.claude`, `studio-runner/.claude`, `contracts/v3/.claude`, `studio-runner/short.webm` also left.

**How to apply:** push hook needs `AIOX_ACTIVE_AGENT=devops` env prefix. studio-runner dist rebuild: Node 24.20.0 via fnm path + `pnpm --config.package-manager-strict=false run build`; output was byte-identical to existing dist (only mtime changed). gitleaks is installed; use `gitleaks git --staged`; hits were digests/UUIDs/fixtures.
