# Check that no UI Studio file was forgotten in the frontend repo

Run this inside the split **frontend** repo. Only check and report. Don't change, commit or push anything.

## What to do

1. Below are the 310 files that must exist in this repo for UI Studio to run and be tested. They are listed relative to the repo root.
2. Check each one, one by one, and don't skip any. Use `test -f <path>` or an equivalent.
3. If this repo's layout differs from the list (for example the code sits in a subfolder, or a folder or Java package was renamed), tell me the mapping first and apply it to every path.

## Report

- `Found: X of 310`
- The list of missing files, if there are any.
- For each config file in "Studio settings in config files": OK, or the settings that are missing.
- For each Helm values file: OK, or the settings that are missing (or "no chart here").

## Files (310)

```
.npmrc
dev.sh
e2e/fixtures/studio-run.webm
e2e/harness.spec.ts
e2e/mobile-layout.spec.ts
e2e/mswProxy.ts
e2e/previewBootstrapHandlers.ts
e2e/realsite-gate/anchor.ts
e2e/realsite-gate/bundle.test.ts
e2e/realsite-gate/bundle.ts
e2e/realsite-gate/classify.test.ts
e2e/realsite-gate/classify.ts
e2e/realsite-gate/collection.test.ts
e2e/realsite-gate/collection.ts
e2e/realsite-gate/common.ts
e2e/realsite-gate/driver.ts
e2e/realsite-gate/environment.test.ts
e2e/realsite-gate/environment.ts
e2e/realsite-gate/evaluate.test.ts
e2e/realsite-gate/evaluate.ts
e2e/realsite-gate/fixtures/practice.ai.yaml
e2e/realsite-gate/fixtures/practice.pagetext.txt
e2e/realsite-gate/freeze.ts
e2e/realsite-gate/gate-cli.test.ts
e2e/realsite-gate/gate-cli.ts
e2e/realsite-gate/gate-table.json
e2e/realsite-gate/gate-table.test.ts
e2e/realsite-gate/leakscan.test.ts
e2e/realsite-gate/leakscan.ts
e2e/realsite-gate/lifecycle.test.ts
e2e/realsite-gate/lifecycle.ts
e2e/realsite-gate/page-text-sources.json
e2e/realsite-gate/public-label-preflight.test.ts
e2e/realsite-gate/public-label-preflight.ts
e2e/realsite-gate/recorder.test.ts
e2e/realsite-gate/recorder.ts
e2e/realsite-gate/registration.test.ts
e2e/realsite-gate/report.test.ts
e2e/realsite-gate/report.ts
e2e/realsite-gate/scan-identity.ts
e2e/realsite-gate/scanrun.test.ts
e2e/realsite-gate/scanrun.ts
e2e/realsite-gate/smoke-flows.json
e2e/realsite-gate/smoke-flows.test.ts
e2e/realsite-gate/specsupport.ts
e2e/realsite-gate/stack.test.ts
e2e/realsite-gate/stack/core-declaration.d.mts
e2e/realsite-gate/stack/core-declaration.mjs
e2e/realsite-gate/stack/dist-check.d.mts
e2e/realsite-gate/stack/dist-check.mjs
e2e/realsite-gate/stack/gate-stack.sh
e2e/realsite-gate/stack/gen-config.mjs
e2e/realsite-gate/stack/local-core.mjs
e2e/realsite-gate/stack/mint-tokens.mjs
e2e/realsite-gate/stack/ports.d.mts
e2e/realsite-gate/stack/ports.mjs
e2e/realsite-gate/status.test.ts
e2e/realsite-gate/status.ts
e2e/realsite-gate/testkit.ts
e2e/realsite-gate/ui-text.ts
e2e/start-servers.mjs
e2e/studio-authoring-real-backend.spec.ts
e2e/studio-guided.spec.ts
e2e/studio-realsite-edit-relearn-real-backend.spec.ts
e2e/studio-realsite-gate-real-backend.spec.ts
e2e/studio-realsite-smoke-real-backend.spec.ts
e2e/studio-variables.spec.ts
e2e/tsconfig.json
e2e/ui-test-create-first-click.spec.ts
package.json
playwright.config.ts
public/config.js
src/App.routes.test.tsx
src/App.tsx
src/ChecksModule.tsx
src/bootstrap.tsx
src/components/checks/wizard/CheckTypeSelector.tsx
src/components/checks/wizard/ReviewStep.tsx
src/components/checks/wizard/UiTestCreateForm.test.tsx
src/components/checks/wizard/UiTestCreateForm.tsx
src/components/checks/wizard/configs/index.ts
src/components/home/entryPoints.test.tsx
src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx
src/components/layout/ChecksLayout/ChecksLayout.keyboard.test.tsx
src/components/layout/ChecksLayout/ChecksLayout.tsx
src/components/layout/LayoutProvider/LayoutProvider.test.tsx
src/components/layout/LayoutProvider/LayoutProvider.tsx
src/components/providers/realStudioStartup.test.ts
src/components/scheduling/ScheduleDialog.test.tsx
src/components/scheduling/ScheduleDialog.tsx
src/components/scheduling/ScheduleOverview.tsx
src/components/scheduling/UiTestScheduleDialog.tsx
src/components/studio/OnboardingCoach.test.tsx
src/components/studio/OnboardingCoach.tsx
src/components/studio/SecretInput.test.tsx
src/components/studio/SecretInput.tsx
src/components/studio/StudioUnavailable.test.tsx
src/components/studio/StudioUnavailable.tsx
src/components/studio/code/StepCodeView.test.tsx
src/components/studio/code/StepCodeView.tsx
src/components/studio/code/index.ts
src/components/studio/code/stepCodeCopy.ts
src/components/studio/code/stepCodes.test.ts
src/components/studio/code/stepCodes.ts
src/components/studio/evidence/BrowserConsoleLogs.tsx
src/components/studio/evidence/GuidedSeekControls.tsx
src/components/studio/evidence/VideoEvidencePanel.tsx
src/components/studio/evidence/VideoFailureOverlay.tsx
src/components/studio/evidence/consoleLines.test.ts
src/components/studio/evidence/consoleLines.ts
src/components/studio/evidence/evidenceExpiry.test.tsx
src/components/studio/evidence/evidencePanel.test.tsx
src/components/studio/evidence/failureProof.test.tsx
src/components/studio/evidence/formatEvidenceInstant.ts
src/components/studio/evidence/guidedEvidence.test.tsx
src/components/studio/evidence/guidedSeekTargets.ts
src/components/studio/evidence/index.ts
src/components/studio/evidence/passedWithPageErrors.test.tsx
src/components/studio/evidence/pinnedVideoEvidenceFacts.ts
src/components/studio/evidence/seekEligibility.ts
src/components/studio/evidence/stepSeek.test.tsx
src/components/studio/evidence/studioVideoUrl.test.tsx
src/components/studio/evidence/studioVideoUrl.ts
src/components/studio/evidence/useFailureStop.ts
src/components/studio/evidence/useVideoSeek.ts
src/components/studio/evidence/videoEvidenceNarratives.ts
src/components/studio/guided/GuidedClarification.tsx
src/components/studio/guided/GuidedCompletion.tsx
src/components/studio/guided/GuidedLearningLog.test.tsx
src/components/studio/guided/GuidedLearningLog.tsx
src/components/studio/guided/GuidedRunStatus.tsx
src/components/studio/guided/LastLearningAttemptNote.test.tsx
src/components/studio/guided/LastLearningAttemptNote.tsx
src/components/studio/guided/LoginRequiredNotice.tsx
src/components/studio/guided/ReadinessChip.tsx
src/components/studio/guided/clarification.test.tsx
src/components/studio/guided/guided.test.tsx
src/components/studio/guided/guidedNarratives.ts
src/components/studio/guided/guidedStoppedStep.test.ts
src/components/studio/guided/guidedStoppedStep.ts
src/components/studio/guided/index.ts
src/components/studio/guided/loginRequired.test.tsx
src/components/studio/guided/planStepTexts.ts
src/components/studio/guided/useGuidedSession.test.ts
src/components/studio/guided/useGuidedSession.ts
src/components/studio/guided/useLatestLearningAttempts.test.tsx
src/components/studio/guided/useLatestLearningAttempts.ts
src/components/studio/list/studioListSx.ts
src/components/studio/references/ReferencePicker.tsx
src/components/studio/references/index.ts
src/components/studio/references/referencePicker.test.tsx
src/components/studio/references/referenceTokens.test.ts
src/components/studio/references/referenceTokens.ts
src/components/studio/run/ExecutionProgressView.tsx
src/components/studio/run/FailedStepSummary.tsx
src/components/studio/run/RunControl.tsx
src/components/studio/run/executeRefusals.ts
src/components/studio/run/executionErrorNarratives.ts
src/components/studio/run/executionStatus.ts
src/components/studio/run/index.ts
src/components/studio/run/pinnedExecutionErrorFacts.ts
src/components/studio/run/progress.test.tsx
src/components/studio/run/recordedVerification.test.tsx
src/components/studio/run/refusals.test.tsx
src/components/studio/run/replayFailure.test.tsx
src/components/studio/run/runActivation.test.tsx
src/components/studio/run/runEnablement.ts
src/components/studio/run/runGate.test.tsx
src/components/studio/run/useRunGate.ts
src/components/studio/run/watchFailure.test.tsx
src/components/studio/runs/RunDetailsDrawer.test.tsx
src/components/studio/runs/RunDetailsDrawer.tsx
src/components/studio/runs/RunRow.tsx
src/components/studio/runs/RunStatusChip.tsx
src/components/studio/runs/runLinks.ts
src/components/studio/runs/runPresentation.ts
src/components/studio/runs/runSnapshots.test.ts
src/components/studio/runs/runSnapshots.ts
src/components/studio/runs/useLiveRunsRefresh.ts
src/components/studio/runs/useStudioRuns.test.tsx
src/components/studio/runs/useStudioRuns.ts
src/components/studio/templates/index.ts
src/components/studio/templates/quickStartTemplates.test.ts
src/components/studio/templates/quickStartTemplates.ts
src/components/studio/tests/DeleteTestDialog.tsx
src/components/studio/tests/newTestRequest.test.ts
src/components/studio/tests/newTestRequest.ts
src/components/studio/tests/testErrors.ts
src/components/studio/tests/testListPresentation.ts
src/components/studio/tests/uiTestStatus.test.ts
src/components/studio/tests/uiTestStatus.ts
src/components/studio/uiTestPaths.test.ts
src/components/studio/uiTestPaths.ts
src/hooks/useUiTestAvailability.test.tsx
src/hooks/useUiTestAvailability.ts
src/hooks/useUiTestSchedule.ts
src/index.tsx
src/main.tsx
src/pages/AllChecksPage/AllChecksPage.test.tsx
src/pages/AllChecksPage/AllChecksPage.tsx
src/pages/AllChecksPage/UiTestCatalogNotices.test.tsx
src/pages/AllChecksPage/UiTestCatalogNotices.tsx
src/pages/AllChecksPage/UiTestCatalogRow.tsx
src/pages/AllChecksPage/catalogRows.test.ts
src/pages/AllChecksPage/catalogRows.ts
src/pages/AllChecksPage/useUiTestCatalog.test.tsx
src/pages/AllChecksPage/useUiTestCatalog.ts
src/pages/CheckDetailsPage/CheckDetailsPage.tsx
src/pages/ChecksStudioPage/ChecksStudioPage.tsx
src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx
src/pages/ChecksStudioPage/pageAutorun.test.tsx
src/pages/ChecksStudioPage/pageCodeTab.test.tsx
src/pages/ChecksStudioPage/pageEvidence.test.tsx
src/pages/ChecksStudioPage/pageFraming.test.tsx
src/pages/ChecksStudioPage/pageGuidedRun.test.tsx
src/pages/ChecksStudioPage/pageIncrementalRecording.test.tsx
src/pages/ChecksStudioPage/pageLoadById.test.tsx
src/pages/ChecksStudioPage/pageProofReplay.test.tsx
src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx
src/pages/ChecksStudioPage/pageRunGate.test.tsx
src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx
src/pages/ChecksStudioPage/pageStepTimeout.test.tsx
src/pages/ChecksStudioPage/saveErrorMessage.test.ts
src/pages/ChecksStudioPage/saveErrorMessage.ts
src/pages/ChecksStudioPage/secretDeclaration.test.ts
src/pages/ChecksStudioPage/secretDeclaration.ts
src/pages/ChecksStudioPage/studioRunTransport.node.test.tsx
src/pages/CreateCheckPage/CreateCheckPage.tsx
src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx
src/pages/DashboardPage/DashboardPage.tsx
src/pages/ReportsPage/ReportsPage.tsx
src/pages/SchedulesPage/SchedulesPage.tsx
src/pages/UiTestDetailsPage/UiTestDetailHeader.tsx
src/pages/UiTestDetailsPage/UiTestDetailsPage.test.tsx
src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx
src/pages/UiTestDetailsPage/UiTestLatestRunCard.test.tsx
src/pages/UiTestDetailsPage/UiTestLatestRunCard.tsx
src/pages/UiTestDetailsPage/UiTestOverviewCard.tsx
src/pages/UiTestDetailsPage/UiTestRecentRunsCard.test.tsx
src/pages/UiTestDetailsPage/UiTestRecentRunsCard.tsx
src/pages/UiTestDetailsPage/index.ts
src/pages/UiTestDetailsPage/useUiTestDetail.ts
src/services/api/apiClient.test.ts
src/services/api/apiClient.ts
src/services/api/mappers/scheduleMapper.ts
src/services/api/schedulesApi.ts
src/services/api/secretsApi.ts
src/services/api/studioApi.ts
src/services/api/studioAuthoringTransport.test.ts
src/services/api/studioAuthoringTransport.ts
src/services/api/studioExecutionTransport.ts
src/services/api/studioGuidedApi.test.ts
src/services/api/studioGuidedApi.ts
src/services/api/studioPollTransport.ts
src/services/api/studioSseStreaming.node.test.ts
src/services/api/studioSseTransport.ts
src/services/api/studioTransport.node.test.ts
src/services/api/studioTransportWiring.ts
src/services/mocks/studio/authoringHandlers.test.ts
src/services/mocks/studio/authoringHandlers.ts
src/services/mocks/studio/authoringState.ts
src/services/mocks/studio/capabilityHandlers.ts
src/services/mocks/studio/confirmedRevisionEscalation.test.ts
src/services/mocks/studio/demoFixtures.ts
src/services/mocks/studio/executionFixtureMatrix.test.ts
src/services/mocks/studio/executionFixtures.ts
src/services/mocks/studio/executionScenarioMatrix.test.ts
src/services/mocks/studio/executionScenarios.ts
src/services/mocks/studio/fixtures.ts
src/services/mocks/studio/guidedFixtures.ts
src/services/mocks/studio/guidedHandlers.test.ts
src/services/mocks/studio/guidedHandlers.ts
src/services/mocks/studio/handlers.ts
src/services/mocks/studio/mockPublicationReplay.test.ts
src/services/mocks/studio/readinessFixtures.ts
src/services/mocks/studio/schedulesHandlers.ts
src/services/mocks/studio/secretsHandlers.ts
src/services/mocks/studio/server.ts
src/services/mocks/studio/studioContract.test.ts
src/services/mocks/studio/studioEscalation.test.ts
src/services/mocks/studio/studioHandlers.test.ts
src/services/mocks/studio/studioVideoHandler.test.ts
src/store/slices/studioSlice.ts
src/test/mswPreviewProxy.node.test.ts
src/test/pageBootstrapShape.test.tsx
src/test/renderStudioAt.tsx
src/test/setup.ts
src/test/studioStreamServer.ts
src/types/checks/checkTypes.ts
src/types/studio/studioAuthoringValidation.ts
src/types/studio/studioContextContract.test.ts
src/types/studio/studioGuidedTypes.ts
src/types/studio/studioTypes.ts
src/utils/config/studioCapabilities.ts
src/utils/constants/appConfig.ts
src/utils/navigation/navigationSetup.test.ts
src/utils/navigation/navigationSetup.ts
src/utils/retireLegacyStudioWorker.ts
src/utils/studio/logTime.test.ts
src/utils/studio/logTime.ts
src/utils/time/formatDuration.test.ts
src/utils/time/formatDuration.ts
src/utils/time/formatRelativeTime.test.ts
src/utils/time/formatRelativeTime.ts
src/utils/time/index.ts
src/utils/time/parseInstant.ts
src/vite-env.d.ts
vite.config.ts
vitest.config.ts
webpack.config.js
```

## Studio settings in config files

Open each config file below and check that its Studio settings are there. Everything else in the file belongs to this repo and may differ, so ignore it. Deployment and pipeline files (Dockerfile, Helm templates, CI) are not checked here. Helm values have their own section below.

- **`package.json`**
  - devDependencies: `@playwright/test` 1.63.0, `msw` 2.15.0, `ajv` 8.20.0, `yaml` 2.9.0.
  - script `test:e2e`: `playwright test`.
- **`.npmrc`** (only if this repo uses pnpm): `node-linker=hoisted`.
- **`vite.config.ts`**
  - `/api/v1` proxies to `VITE_API_URL` (default `http://localhost:8080`).
  - That proxy has the `configure` hook that adds `put_session=<VITE_DEV_SESSION_COOKIE>` to the forwarded cookie.
- **`vitest.config.ts`**
  - `exclude` contains `e2e/**`.
  - `testTimeout` and `hookTimeout` are `30_000`.
  - `*.node.test.ts(x)` files run in the `forks` pool with `--experimental-eventsource`.
- **`playwright.config.ts`**
  - projects `msw` and `real-backend`, chosen by `CHECKS_E2E_REAL_BACKEND`.
  - `webServer` runs `node e2e/start-servers.mjs`.
- **`public/config.js`**: defines `window.__CHECKS_CONFIG__` with `apiBaseUrl` and `debugMode`.
- **`dev.sh`**: starts Vite with `VITE_API_URL` and `VITE_DEV_SESSION_COOKIE=local-dev-session`.

## Studio settings in Helm values

If this repo has no Helm values files, say "no chart here" and skip this section. Otherwise open `values.yaml` and each environment file (`values-dev.yaml`, `values-uat.yaml`, `values-prod.yaml`, or this repo's equivalents) and check the settings below. Secret and ConfigMap names end in the environment (`-dev`, `-uat`, `-prod`), and each one must match what was provisioned for that environment. Templates are not checked.

- **`values.yaml`**: `frontend.runtimeConfig` with `enabled: true`, `apiBaseUrl`, `debugMode` and `mountPath: /usr/share/nginx/html/config.js`.
- **Each environment**: `frontend.runtimeConfig.apiBaseUrl` points at that environment's API with `/api/v1`. In the monorepo these are `https://checks-api.dev.citi.com/api/v1`, `https://checks-api.uat.citi.com/api/v1` and `https://checks-api.citi.com/api/v1`.
