### Implementation plan (static MVP first, no Admin page, environment as tags)

#### Scope of this iteration
- Remove standalone Environment control; model environment via tags (e.g., env:production, env:staging).
- Build static, navigable UI skeletons with realistic placeholders; no data fetching or MSW.
- Exclude Admin; keep only the core persona flows.
- Keep URLs simple now; deep-linking and functional wiring come later.

### 0) Navigation and routes
- Update app navigation (static):
  - Dashboard → `/checks`
  - CSIs
    - Directory → `/checks/csis`
    - Overview → `/checks/csis/:csiId`
  - Checks
    - Catalog → `/checks/all`
    - Create (Builder) → `/checks/create`
    - Templates → `/checks/templates`
  - Studio
    - Scenarios → `/checks/studio`
    - Runs → `/checks/studio/runs`
  - Reports
    - Builder → `/checks/reports`
    - Scheduled → `/checks/reports/scheduled`
    - Analytics → `/checks/reports/analytics`
  - Activity → `/checks/activity`
  - Schedules → `/checks/schedules`
- Remove Admin from menu for MVP.
- Acceptance: All routes exist, pages render static placeholders, sidebar highlights current page.

### 1) Global Scope Bar (static)
- Controls (top of all pages, under app header):
  - CSI selector (searchable; recent list). “All CSIs” as default.
  - Tags selector (multi-select with suggestions). Show AND/OR toggle.
  - Save/Share scope buttons (non-functional).
  - No Environment control; include environment suggestions within tags (env:production, env:staging, env:uat, env:dev).
- Copy: short helper text “Scope applies across pages.”
- Acceptance: Visual-only state (chips update locally), no API, no URL syncing.

### 2) Dashboard (static)
- Sections:
  - Health hero (uptime %, trend sparkline).
  - Status distribution (Passing/Warning/Failing/Pending).
  - Coverage & gaps (checks by type).
  - Critical events feed (clicks route to Check Details skeleton).
  - Upcoming executions (static list).
  - Watchlist (static cards).
- Acceptance: Looks real with placeholders; links route correctly; no backend.

### 3) CSIs (static)
- Directory:
  - Grid of CSI cards with health badges, BU, criticality, tags; left facets placeholder (BU, criticality, status, tags).
- CSI Overview:
  - Header with owner, BU, criticality, tags; “Open in scope” ghost button (non-functional).
  - Tabs: Health, Checks, Applications, Reports, Studio (all with static counts and lists).
- Acceptance: Both screens render; tab switches work locally.

### 4) Checks (static)
- Catalog:
  - Left FiltersRail (Status, Type, Tags summary as skeleton).
  - Right table (Name, Type, Status, CSI, Last Run, Next Run, Tags, Owner, Actions).
  - Bulk action bar (non-functional).
- Create (Builder):
  - Step 1: Type or Template selection (cards).
  - Step 2: Basics (name, CSI autofill text, tags; environment suggestions appear as tags).
  - Step 3: Type-specific essentials with “Advanced” accordions.
  - Step 4: Schedule & Alerts (visual toggles only).
  - Step 5: Review (human-readable summary).
- Templates:
  - Gallery of templates with descriptions (HTTP, TCP, Splunk, Grafana, ITRS, AppDynamics, UI Test).
- Acceptance: Wizard advances visually; templates prefill UI fields locally; no validation/network.

### 5) Check Details (static)
- Header: Status pill, name, type, CSI, tags (including env:*), owner; quick actions (Execute, Pause/Resume, Edit, Delete, Add to Report) all non-functional.
- Tabs:
  - Overview: last result summary, quick reasons (“Why failing?”), link chips to external tools (non-functional).
  - History: executions table skeleton; timeline chart placeholder.
  - Configuration: read-only card with sample config; change history placeholder.
  - Schedule: current schedule card; “Edit Schedule” opens the existing dialog as visual-only.
  - Links & Evidence: Splunk/Grafana/ITRS/AppDynamics link placeholders; for UI tests, last video placeholder tile.
- Acceptance: Tabs switch; schedule dialog opens/closes; links route or noop as planned.

### 6) Studio (static)
- Scenarios list: cards with status, last run, tag chips (env:* included).
- Three-panel editor:
  - Left: steps editor (plain English lines) with validation badges (visual only).
  - Middle: Control Tower (Run/Stop disabled states, log area with placeholder lines).
  - Right: Visual proof pane with video placeholder and step markers; clicking steps changes a mock timestamp label.
- Runs: list page for past runs (static).
- Acceptance: Interactions update only local state; no execution.

### 7) Reports (static)
- Builder:
  - Left: Name, Schedule (visual), Recipients, Template picker.
  - Add content: static search field; “Add check” buttons add rows locally; reorder via drag handle visuals.
  - Right: Live Preview (static HTML blocks update as inputs change).
  - Keep the copy at Reports header: “Scope-aware reporting. Selections reflect your current CSI/tag scope.”
- Scheduled: table of reports with next run, last sent.
- Analytics: cards and a table with placeholder metrics.
- Acceptance: Preview updates from left controls (local state); no network.

### 8) Activity (static)
- Stream of items (executions, edits, comments) as list with facet skeleton up top.
- Acceptance: Filters are visual-only; items link to static Check Details.

### 9) Schedules (static)
- Calendar/timeline view placeholder showing upcoming items with mock grouping.
- Acceptance: Navigates months/weeks visually; items open Check Details skeleton.

### 10) Tag taxonomy updates (static)
- Extend tag guidance (no code yet) to include:
  - env:production, env:staging, env:uat, env:development
  - Keep existing tag families (application, team, lob, priority, type, component, platform, etc.)
- Copy updates:
  - Tag inputs show examples including env:*.
  - Wizard “Basics” hints: “Use env:* tags to identify environment.”

### 11) Cleanup and deprecations (static pass)
- Hide/remove page-level `FilterBar` from pages now using the global Scope Bar.
- Keep existing routes working by redirecting to new ones where needed (visual-only).
- Update sidebar registration to reflect new menu without Admin.

### 12) Theming and accessibility polish
- Unify headings, spacing, and chip styles.
- Ensure keyboard focus order and ARIA labels for tabs, accordions, and toggle groups.
- Color contrast check on hero/status components.

### 13) QA checklist (static)
- All routes load without errors; sidebar reflects current page.
- Scope Bar present on every page; removing environment does not break any copy.
- Every page shows meaningful placeholders and CTA stubs.
- All internal links navigate; external links are no-ops or labeled “Coming soon.”
- No network calls; no MSW; no console errors.

### 14) Handover to functional prototype (next phase, not in this iteration)
- URL-driven scope (CSI/tags/tagMode/time range).
- Server-driven filtering; replace static lists with store + API.
- Execute/Run flows with toasts and progress.
- Deep links to Splunk/Grafana/ITRS/AppDynamics with time context.
- Role-aware actions; audit logging.

### Prioritization (by impact → effort)
- High impact, low effort: Navigation, Scope Bar, Dashboard hero, Checks Catalog shell, Check Details tabs.
- Medium: Create Check wizard shell, Studio 3-panel shell, Reports Builder shell.
- Lower: CSIs directory/overview, Activity, Schedules shells.
- Drop for MVP: Admin.

### Deliverables of this iteration
- Updated static sidebar and routes.
- Global Scope Bar (without environment; with env:* tags guidance).
- Static skeletons for all pages listed above.
- No data fetching; all visuals render from local constants; interactions update local state only.