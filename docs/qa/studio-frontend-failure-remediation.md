# Studio frontend failure remediation — story 10.27

2026-09-16. Dex implementation with the bounded Aria contract decision in ADR-002 §29. Independent QA and backend integration remain with the coordinator. Existing Studio/storage changes were preserved. No commit, push or deployment.

## Confirmed source

The original four `confirmedRevisionEscalation.test.ts` tests are unchanged and now pass. OpenAPI declares `confirmedRevisionArtifact` and `confirmedRevisionArtifactHash`, qualified by exactly `confirmedRevisionId`. Both fields are null in list summaries and when unavailable. The backend independently joins the confirmed revision; no candidate substitution is permitted.

The Code view renders only the confirmed pair. The actual Studio page supplies the compile-review response to the Code view, so edits and confirmation refresh source/state coherently. A standalone CodeTab detail reader also handles selection changes. Missing confirmed data produces an explicit unavailable state. Stale source is labeled previously confirmed and does not enable Run. MSW confirmation advances the pair together; later source/configuration changes retain it independently of the current candidate. Mock fixture hashes are synthetic fixture values, not evidence of live canonicalization.

Four new confirmed-source tests cover distinct candidate/draft/confirmed source, missing-confirmed negative control, list/detail projection, and confirmation followed by an edit. Neither original expected-red assertion was deleted, skipped or weakened.

## Other failures

The initial full lint result was 191 errors/334 warnings. Removed unused imports/declarations and dead handlers, retained used tuple setters, corrected redundant regex/string escapes and JSX text entities, replaced a test-local CommonJS require with the already awaited module import, and documented existing intentionally ignored optional persistence/enrichment errors. Rules were not disabled. Only import ranges were formatted in touched files; no global code formatter ran.

Full-suite execution exposed malformed successful bootstrap responses populating sources/features arrays with undefined. Both thunks now reject malformed shapes through their existing rejected-action behavior. New tests cover malformed payloads and preserve a previously disabled feature flag after a malformed refresh; this does not change the existing fallback policy.

The remaining layout accessibility failure showed the skip link was absent. Added a focus-visible skip link and made the main landmark its focus target. The existing test now also verifies focus transfer. Updated the navigation callback dependency while touching this component.

## Final verification

All commands ran from frontend/ on the existing epic checkout:

- `npm test -- --run --maxWorkers=4 --minWorkers=1`: **565/565 passed, 42/42 suites**, 80.58 seconds. Full run; no filters or exclusions. `/tmp/studio-remaining-frontend-full-tests.log`.
- `npm run lint`: **exit 0, zero errors**, 332 existing warnings remain. `/tmp/studio-remaining-frontend-lint.log`.
- `npm run type-check`: **PASS**. `/tmp/studio-remaining-typecheck.log`.
- `npm run build`: **PASS**, webpack asset-size warning remains for existing large shared chunks (3.88 MiB, 540 KiB, 3.83 MiB). `/tmp/studio-remaining-frontend-build.log`.
- `git diff --check`: **PASS**.

Tests still emit existing act/environment/API warning output; there are no failed tests or reported unhandled-error verdicts in the final run. These results do not establish live Vertex quality, deployment readiness or backend correctness; those gates are separate.

## Files

Contract: `docs/specs/studio/openapi.yaml`, `docs/architecture/ADR-002-internal-contract-surface.md`.
New tests: `frontend/src/components/studio/confirmedSource.test.tsx`, `frontend/src/store/slices/featuresSlice.test.ts`.
The prior untracked inference implementation is retained, with `inferenceHandlers.ts` extended for confirmed-pair semantics.

Tracked frontend diff inventory below includes the preserved coordinator runtime flag/ESLint setup changes as part of the shared snapshot:

- `frontend/.eslintrc.json`
- `frontend/src/App.tsx`
- `frontend/src/ChecksModule.tsx`
- `frontend/src/components/checks/wizard/ReviewStep.tsx`
- `frontend/src/components/checks/wizard/configs/HttpConfig.tsx`
- `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx`
- `frontend/src/components/home/KPIBar.tsx`
- `frontend/src/components/home/TriageDrawer.tsx`
- `frontend/src/components/home/UpcomingSchedules.tsx`
- `frontend/src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx`
- `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`
- `frontend/src/components/providers/MswGate.test.tsx`
- `frontend/src/components/reports/RecipientsEditor.tsx`
- `frontend/src/components/reports/RuleBuilder.tsx`
- `frontend/src/components/reports/ScheduleEditor.tsx`
- `frontend/src/components/shared/States/ErrorState.tsx`
- `frontend/src/components/studio/CodeTab.tsx`
- `frontend/src/components/studio/SecretInput.tsx`
- `frontend/src/components/studio/review/CompileReviewPanel.tsx`
- `frontend/src/components/studio/review/diagnostics.test.tsx`
- `frontend/src/index.tsx`
- `frontend/src/main-simple.tsx`
- `frontend/src/main.tsx`
- `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`
- `frontend/src/pages/CheckDetailsPage/CheckDetailsPage.tsx`
- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `frontend/src/pages/ChecksStudioPage/studioRunTransport.node.test.tsx`
- `frontend/src/pages/ChecksTemplatesPage/ChecksTemplatesPage.tsx`
- `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`
- `frontend/src/pages/Reports/ReportBuilder.tsx`
- `frontend/src/pages/Reports/ReportDetailsPage.tsx`
- `frontend/src/pages/Reports/ReportsHome.tsx`
- `frontend/src/pages/ReportsPage/ReportsPage.tsx`
- `frontend/src/pages/SchedulesPage/SchedulesPage.tsx`
- `frontend/src/pages/SplunkPrototypePage/SplunkPrototypeConfig.tsx`
- `frontend/src/pages/SplunkPrototypePage/SplunkPrototypePage.test.tsx`
- `frontend/src/pages/StudioRunsPage/StudioRunsPage.tsx`
- `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`
- `frontend/src/services/api/checksApi.test.ts`
- `frontend/src/services/api/responseAdapter.ts`
- `frontend/src/services/api/studioSseStreaming.node.test.ts`
- `frontend/src/services/mocks/studio/fixtures.ts`
- `frontend/src/services/mocks/studio/handlers.ts`
- `frontend/src/store/slices/checksSlice.test.ts`
- `frontend/src/store/slices/csiSlice.ts`
- `frontend/src/store/slices/dashboardSlice.ts`
- `frontend/src/store/slices/featuresSlice.ts`
- `frontend/src/store/slices/reportsSlice.ts`
- `frontend/src/store/slices/sourcesSlice.test.ts`
- `frontend/src/store/slices/sourcesSlice.ts`
- `frontend/src/types/studio/studioTypes.ts`
- `frontend/src/utils/commsBridge.ts`
- `frontend/src/utils/constants/appConfig.ts`
- `frontend/src/utils/studio/ir/parseSteps.ts`
