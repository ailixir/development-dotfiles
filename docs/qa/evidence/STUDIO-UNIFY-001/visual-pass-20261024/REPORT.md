# STUDIO-UNIFY-001 visual pass on the real stack (aiox-ux, 2026-10-23/24)

Stack: ./dev.sh --seed — backend :8080 (local,dev), studio-runner :8090 (real Chromium), Vertex gemini-3.8-flash, Vite :5181.
Screenshots: shots/ next to this file (copied from the session scratchpad). Scripts stayed in the session scratchpad.
Test created: "Example Domain heading", id ba7b4af6-827c-414e-90ab-6f92a65d77da, CSI 178672, Development.

Verdict: NOT READY (run path blocked). UNIFY navigation/structure works against the real backend.

## Blocker
B1. A new UI test can't start learning in any environment. GET /api/v1/studio/tests/{id}/capabilities →
guidedStart {available:false, code:RUNTIME_INCOMPATIBLE} for all 4 environments. Banner "Studio could not start
learning for this test, so nothing was started" + raw code; no start request. Cause (code read):
StudioCapabilitiesService.guidedStart() needs guided enabled + a studio_guided_policies row for CSI/env +
translation allow-list permit + trusted replay pin (pins.policy). dev.sh provisions none. Host reaches example.com.
Shots: 03-run1-final.png, 04-row-play.png.

## Major
M1. Run Test stays enabled (green) after the capabilities refusal, repeats a developer-style message and raw code each
press, no next step. Expected: Run disabled or a plain-language caption beside it saying what to do; raw code secondary.
Harness B pins button names → new text must be a caption, not a button label.
Likely files: components/studio/run/RunControl.tsx, components/studio/guided/GuidedCompletion.tsx (~L322/364). Shot 03-run1-final.png.

M2. /ui-tests/{missing-or-forbidden}/studio renders the whole editor: title "Checks Studio", "Saved" chip, coach,
step guidance, enabled "Add a test step", Templates; only one line + "Open Tests" button signals the problem.
Expected: the same clean "doesn't exist or you don't have access" state as the detail page, without the editor.
Likely file: pages/ChecksStudioPage/ChecksStudioPage.tsx ~L1320. Shot 06-missing-studio.png.

## Minor
m1. Blue "UI Tests" link above the editor title actually opens this test's detail page; breadcrumb last item (test name)
is not a link. Suggest All Checks › {test name → detail} › Studio. ChecksStudioPage.tsx ~L1176-1184.
m2. Mobile editor: ~260 px blank under Environment (Environment field keeps a 260 px flex basis that becomes height when
the row stacks). ChecksStudioPage.tsx ~L1333-1343. Shot 07m-studio.png.
m3. Mobile editor opens scrolled down 593 px (header, Save, Run off-screen); desktop opens at 9 px. Cause not found.
Shot 07m-studio-viewport.png.
m4. Mobile All Checks table 491 px wide on 390 px screen: Last Execution and row actions only via hidden sideways
scroll; pager arrow clipped. All rows. Shot 07m-allchecks.png.
m5. Create UI test form validation is silent: no CSI or whitespace-only name just keeps the button disabled, no inline
message. UiTestCreateForm.tsx. Shots 02-create-validation-noCSI.png, 02-whitespace-name.png.
m6. Missing-test detail page is bare: one centred sentence, no heading, no "Back to All Checks". Shot 06-missing-detail.png.
m7. Old names still visible: palette entry says "Studio", editor buttons say "Open Tests" though those pages are gone
(stories repointed without renaming per AC-09/DC-09).
m8. Console errors in normal use: each All Checks load logs `API Error … /studio/tests … canceled` as error ×3 (cancelled
requests); each editor load logs a React prop-type warning from RunControl.tsx.
m9. Mobile Create with ?type=UI_TEST: form ~1,600 px below the fold under the other type cards. Shot 07m-create.png.
m10. Standalone mobile has no navigation (no sidebar, no menu button). Predates UNIFY; federated host shell probably
provides nav (unverified).
m11. Navigation differs from CLAUDE.md: no Dashboard and no Create Check sidebar entry; the Dashboard UI-test quick
action (AC-09) lives in DashboardPage, which no route renders. navigationSetup.ts. Shot 01-home.png.

## Polish (not in fix scope)
p1 UI Test type label wraps; only UI test rows show CSI name. p2 "Not learned" chip same orange as health Warning.
p3 test name ×3 in editor; "Not learned yet" repeats header chip. p4 "Back to runs" wraps. p5 Splunk prototype banner on
Create. p6 type dropdown doesn't write ?type to URL. p7 CitiSansDisplay fonts 404 (HTML served). p8 mobile step fields ~120 px.

## Could not verify
Learning run, replay, live logs, video, Runs tab with runs, run drawer with evidence, All Checks status after a run
(B1); Dashboard entry (no route); server-side create validation error; federated mode.
