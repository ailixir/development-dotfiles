---
name: obs009-fmerge-prerulings
description: 2026-10-18 OBS-009 pre-F-merge rulings — profile-safety fixture gets terminate oracle, lost-control-body test updated (A12), connector path filter + API ingress NetPol, chart connector.port name mismatch, executor shedding carried to 011
metadata:
  type: project
---

Rulings in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/pre-rulings.md` (2026-10-18):
- F-R2-1: fixture changes, not D5-1. `ProfileSafetyFixture` gains `productionTeardown:'terminate'` mode (0 context.close, first PID probe DEAD); amends the 2026-10-14 strict-qa fixture ruling for failed launches only.
- lost-control-body: test expects RUN_ERROR/errorMessage CANCELLED (A12); no backend RUN_ERROR+revoked mapping (invented cause, cross-clock). Residual disclosed by @po.
- D1 F3 static Playwright import accepted (dynamic-import ban is a security boundary).
- Connector port: path-scope filter (HIGHEST_PRECEDENCE, local-port match) + API ingress NetworkPolicy (rule1 all other ports open, rule2 guided-tls from runner+worker; coordinator runs on worker). Trust store = dedicated issuer only.
- Chart renders `tls-connector.port`, backend reads `connector.port` → F-merge blocker, D3 name wins.
- Teardown executor shed visibility + queued-id dedupe → 011; post-window alert → GA backlog.
- B-R2-1: GuidedBrowser terminate/orderlyClosed required at F-merge.
- ADR-002 §29.2 item 7 amendment paragraph + §13 ADJ-1 row inserted (append-only).

**Why:** pre-F-merge closure of W2 lane findings.
**How to apply:** if asked about 009 F-merge or the 010/011 carries, start from this file; verify the chart/backend name fix landed before ruling on guided deployment issues. Related: [[obs009-w15-d5-d10-rulings]], [[obs009-w15-part2-rulings]].
