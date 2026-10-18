# Project Checks — Executive Delivery Roadmap

**Report Date:** May 12, 2026 | **GA Target:** December 2026 | **Status:** ON TRACK

> **Note:** This is the external stakeholder delivery timeline. Dates include delivery margins — internal targets may precede these dates.

---

## Delivery Roadmap

| Month | Release | Theme | Key Deliverables | Check Types | Pilot CSIs | Status |
|---|---|---|---|---|---|---|
| **Mar** | — | Foundation | Database design (13 tables, partitioned for scale), schema migrations, local development environment, backend project scaffold | 0/7 | — | DONE |
| **Apr** | — | Walking Skeleton | Checks management (create, edit, delete), HTTP & TCP check executors, on-demand check execution, execution history, check templates, authentication stub | 2/7 | — | DONE |
| **May** | — | Platform & Wiring | Scheduling engine, Reports module, Dashboard, Studio test management, Secrets storage, Tags, Bulk operations, Data retention management, Frontend connected to real backend | 2/7 | — | IN PROGRESS |
| **Jun** | R1 | Production Readiness + DRIFT | DRIFT (CSI) integration, HTTP/TCP hardened for production, API contract published, secrets vault encryption, performance caching, non-ready check sources disabled via feature flags, mock layer fully retired | 2/7 | — | NEXT |
| **Jul** | R2 | Reports + Email Delivery | Automated report delivery on schedule, enterprise email (SMTP) integration, report execution audit trail. **Maria's use case complete** | 2/7 | — | Planned |
| **Aug** | R3 | Integrations + Pilot P1 | Splunk, Grafana, ITRS, AppDynamics connectors + DailyChecks legacy migration adapters, integration test suites, new check sources enabled. **3-5 Tier 1 CSIs onboarded** | 6/7 | 3-5 | Planned |
| **Sep** | R4 | Checks Studio | Browser automation via Playwright, plain-English test step interpreter, video recording + cloud storage, step-to-video synchronization, Python code generation, Studio UI fully connected. **Priya's use case complete** | 7/7 | 3-5 | Planned |
| **Oct** | R5 | Platform Features | Bulk actions (multi-select, batch delete/pause/resume), advanced search & filtering (by CSI, environment, type, status, tags), auto-save drafts, test template library, ~~keyboard shortcuts, accessibility compliance (WCAG 2.1 AA)~~ *(2026-10-17: Superseded by ADR-SC-006 (user decision 2026-10-17): accessibility limited to functional must-haves; no WCAG target)* | 7/7 | 3-5 | Planned |
| **Nov** | R6 | Hardening + Pilot P2 | Cluster-safe scheduling, distributed caching, role-based access control, enterprise single sign-on, observability (tracing + metrics), security audit, rate limiting, data retention automation. **10-15 CSIs onboarded** | 7/7 | 10-15 | Planned |
| **Dec** | R7 | **GA Release** | Load testing (100K checks/hr, 500 concurrent requests), end-to-end test suite, production deployment packages, staging validation, operations runbook, user documentation. **Go/No-Go. 20 CSIs onboarding plan** | 7/7 | 20 | Planned |

## Key Risks

| Risk | Impact | Mitigation | Needed By |
|---|---|---|---|
| Splunk/Grafana/ITRS/AppDynamics API credentials & network access | HIGH | Build against test stubs first; credential requests must start June | Aug |
| Legacy DailyChecks API compatibility | HIGH | Early API analysis in July; migration adapter includes validation tooling | Aug |
| Playwright container infrastructure | MEDIUM | Containerized for dev/staging; cloud allocation request in Aug | Sep |
| Enterprise email relay approval | MEDIUM | Test endpoint validates connectivity early; log-only fallback | Jul |
| Scope creep from pilot feedback | MEDIUM | Feature freeze after R5; new requests go to v2.3 backlog | Oct |

## Decisions Needed

| Decision | Recommended | Needed By |
|---|---|---|
| Pilot Phase 1 — which 3-5 CSIs? | Teams already on DailyChecks | Jul |
| Playwright hosting — container vs. cloud | Containerized, evaluate cloud at scale | Aug |
| Studio video retention — 7d / 30d / 90d | 30 days | Sep |
| Feature freeze cutoff — R4 or R5? | R5 (Oct) — includes platform features in GA | Jun |
