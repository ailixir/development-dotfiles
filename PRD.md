# Product Requirements Document - Checks

## 1. Problem Statement

### 1.1. Current State Challenges
Operational health monitoring at Citibank is siloed and uncoordinated, leading to significant inefficiencies and risk.
* **Tool Fragmentation**: Teams use ITRS, Grafana, Splunk, and AppDynamics independently without a unified strategy.
* **No Single Source of Truth**: Health check definitions and their statuses are scattered across multiple platforms and team wikis.
* **Inconsistent Standards**: Each team defines application health ("what is healthy?") differently. This is exacerbated when a single **CSI** is shared by multiple applications with different monitoring standards.
* **Manual Coordination**: During incidents, engineers must manually correlate alerts from different systems, even for components under the same **CSI**.
* **Duplicate Monitoring**: Multiple teams often monitor the same application components—sometimes within the same **CSI**—in different ways, leading to wasted effort and conflicting signals.
* **Knowledge Silos**: Deep expertise in monitoring tools is trapped within specific teams, making it difficult to share best practices.

### 1.2. What We Are NOT Trying to Solve
This project's success depends on clarity of purpose. We are not replacing our powerful, best-in-class monitoring tools. We are NOT building:
* A replacement for ITRS, Grafana, Splunk, or AppDynamics.
* A new alerting engine to replace the native capabilities of those tools.
* Another metrics or log collection system.
* A new, all-encompassing dashboarding solution.

## 2. Solution Overview & Core Concepts

"Checks" serves as the central **orchestration and standardization layer** for operational health monitoring at Citibank. It sits above our existing monitoring ecosystem and uses the **CSI (Citi System Inventory)** as its primary organizing principle.

### 2.1. What "Checks" Does: Orchestration, Not Duplication
1.  **Define Once, Execute Anywhere**: "Checks" provides a central place to create a standardized health check definition. Every check is associated with a **CSI** to create a structured, searchable catalog.
2.  **Unified Health API**: We will provide a single, consistent API to query the health status of any application or, more broadly, any **CSI**, regardless of which underlying tool is performing the monitoring.
3.  **Cross-Tool Correlation & Visibility**: "Checks" provides a catalog of what is being monitored, where, and by which tool, all organized by **CSI**. This gives teams a single place to see the complete monitoring coverage for a business service.
4.  **Standardization Framework**: The platform enforces a consistent way to define and categorize checks under a common **CSI** framework.

### 2.2. What Existing Tools Continue to Do
Our existing tools will continue to perform their specialized functions, now driven by a more coordinated strategy.
* **ITRS**: Continues to be the engine for real-time infrastructure monitoring and complex event processing.
* **Grafana**: Remains the primary tool for metrics visualization and time-series analysis.
* **Splunk**: Continues to be the definitive platform for log aggregation, search, and analysis.
* **AppDynamics**: Remains the expert tool for Application Performance Monitoring (APM) and code-level diagnostics.

## 3. Goals & Objectives (Overall Project)

| Goal | Key Result / Objective | Metric / KPI |
| :--- | :--- | :--- |
| **Centralize & Standardize** | Establish "Checks" as the single, bank-wide standard for all operational health checks, retiring manual processes. | % of Tier 1 & 2 applications onboarded; # of manual check procedures officially retired. |
| **Automate & Improve Efficiency** | Reduce the manual effort for performing and verifying operational checks by 75% for onboarded applications. | Time saved per team (estimated); # of automated check executions per day. |
| **Enhance Reliability & Visibility** | Improve the consistency of monitoring and provide clear, real-time visibility into system health. | Reduction in P1/P2 incidents that could have been preemptively caught; User satisfaction score (NPS). |
| **Deliver Superior User Experience** | Enable non-developer users to create and schedule meaningful checks in under 5 minutes with minimal training. | Time-to-create-first-check; % of checks created via the UI vs. needing SRE assistance. |
| **Integrate Seamlessly** | Function as an orchestration layer that leverages data from key enterprise tools without duplicating their core functionality. | # of active integrations with key enterprise systems. |

## 4. Target Audience & Personas

* **Priya, L2 App Support:** Executes daily health checks, performs initial triage.
    > *"I waste 45 minutes every morning running through a wiki page with 30 manual steps. It's easy to miss something."*
* **David, SRE/DevOps Engineer:** Automates operational tasks, implements monitoring, performs deep-dive incident analysis.
    > *"Every team writes their own bash scripts. When I'm on-call for another team's app, I have no idea where their 'health check' script is."*
* **Maria, Operations Analyst:** Monitors overall stability and compiles health reports for management.
* **Robert, IT Director:** Needs high-level KPIs and assurance of operational stability.

## 5. Features & Scope (V2.2)

This section outlines the expanded feature set for the V2.2 vision of the "Checks" platform.

### 5.1. Core Check Capabilities
* **CSI Association:** All checks must be associated with a registered **CSI** and a corresponding application/component.
* **GUI-Based Check Builder:** An intuitive interface for building all check types with advanced form validation and real-time preview
* **Check Library:** A comprehensive library of supported check types, categorized as follows:
    * **Basic Checks:**
        * HTTP(S) API Endpoint - Full configuration with method selection, headers, body, and status code validation
        * TCP Port Check - Host/port connectivity with configurable timeout
    * **Integration-Driven Checks:**
        * Splunk Log Query - Complex SPL query execution with result threshold validation
        * Grafana Metric Threshold - Dashboard/panel metric monitoring with multiple operator support
        * ITRS Geneos Sampler Status - Real-time sampler state monitoring with expected value comparison
        * AppDynamics Health Rule Violation - Application health rule monitoring and APM integration
    * **UI Test Checks:**
        * No-Code UI Test - Plain English commands with video recording and Python code generation (see section 5.2)
* **Secure Parameterization:** Integration with the enterprise secrets vault with `<secret ID>` token support
* **Execution & Scheduling Engine:** On-demand and scheduled execution for all check types with cron expression support
* **Dashboards & Visualization:** CSI-centric dashboards with history views, real-time updates and KPI tracking
* **Reporting:** A flexible reporting tool to create and schedule email-based status reports with a "live-preview" editor, autosave and cross-CSI support

### 5.2. UI Testing Feature ("Checks Studio")

This flagship capability is designed to empower all users, regardless of technical skill, to create robust UI tests.

> #### **Core UX Philosophy: "From Checklist to Reality"**
> The entire experience should feel like writing a simple checklist of instructions and then watching a video of a robot perfectly executing that list. The goal is to build **trust** and **empowerment**. The user should feel confident that their plain English commands are being understood, and the video provides undeniable proof.

#### **Main Interface Layout**
A clean, three-panel screen separating user *instructions* from system *actions* and *proof*.

1.  **Left Panel: The Test Steps (Your Checklist)**
    * A simple, numbered text editor where each line is a distinct step (`1. Go to...`, `2. Click...`).
    * After a run, each line gets a status icon: **green checkmark (✓)** for pass or **red X (✗)** for fail.
    * Includes syntax highlighting, auto-completion, variable support (`<var NAME>`), and secret tokens (`<secret ID>`).

2.  **Middle Panel: The Control Tower (The "Go" Button & Logs)**
    * Contains the **Test Name**, a large **"Run Test"** button, and a **Live Log** area for real-time text updates during execution.
    * Includes test metadata, environment selection, schedule configuration, and Python code generation.

3.  **Right Panel: The Visual Proof (The Video)**
    * After a test run, a **video player** appears here, showing a full screen recording of the test.
    * The video timeline is synchronized with the test steps.
    * Includes step-synchronized timeline, screenshot capture, and download capabilities.

### 5.3. Additional Features

* **Bulk Operations:** Multi-select and bulk actions for check management
* **Advanced Filtering:** Global search context with CSI, environment, and tag filtering
* **Autosave:** Draft persistence for check creation and reports
* **Code Generation:** Python code generation from Checks Studio tests
* **Template Library:** Pre-built templates for common UI test scenarios
* **Keyboard Shortcuts:** Comprehensive keyboard navigation throughout the application
* **Accessibility:** Full ARIA support and screen reader compatibility

### 5.4. Out of Scope for V2.2

* **Automated Remediation:** The platform will report and alert but will not attempt to automatically fix failures (e.g., restart a service).
* **ML-Powered Anomaly Detection:** All checks are based on user-defined logic and thresholds.
* **Advanced Report Customization:** While basic reporting by **CSI** will be included, a full-featured, customizable report builder is out of scope.
* **Advanced Reporting:** While email-based reporting is included, **PDF/CSV exports** and a full-featured, customizable report builder are out of scope.

## 6. User Stories & UX Flows (V2.2)

### For Core Check Types
* **UC-01 (Creating a Check):** As **Priya**, I want to create a health check for my application's API and easily associate it with our official **CSI** so it's correctly categorized.
* **UC-02 (Scheduling):** As **David**, I want to schedule a critical check to run every 5 minutes, so that I can be automatically alerted of any issues.
* **UC-03 (Viewing Status):** As a user, I want to view a dashboard showing the health of all checks under my team's **CSI**.
* **UC-04 (Investigating):** As **David**, when a check fails, I want to view the error and click a link to the underlying system, so I can start my investigation immediately.
* **UC-05 (Advanced Splunk Check):** As **David (SRE)**, I want to create a check that runs a complex Splunk query correlating 'trade received' and 'trade settled' logs, so that I can verify our entire trade processing pipeline completes successfully without any dropped messages.
* **UC-06 (Grafana Check):** As an App Support analyst, I want to create a check that fails if the 5-minute average CPU usage in Grafana for our servers goes above 90%.

### For the UI Testing Feature
* **User Story:** As **Priya**, I want to create a UI test by writing simple English steps like "Go to citi.com" and "Click on 'Sign On'", so I can validate our application's login flow without writing any code.
* **UX Journey:**
    1.  **Write Instructions:** In the "Checks Studio," **Priya** writes her test steps:
        * `1. Go to "https://www.citi.com"`
        * `2. Click "Sign On"`
        * `3. Wait for the text "User ID" to appear`
        * `4. Check that the URL contains "login"`
    2.  **Execute:** She clicks the large **"Run Test"** button and watches the live log for progress.
    3.  **Review Proof:** The test finishes. The steps get green checkmarks, and a video recording appears.
    4.  **Investigate:** **Priya** clicks on "Step 3" in her list. The video instantly jumps to the exact moment the "User ID" text appeared on the page, providing undeniable, context-sensitive proof.

### For the Reports Feature

  * **User Story:** As **Maria (Operations Analyst)**, I want to create a daily status report containing specific, critical checks from multiple **CSIs**, so I can provide a focused End-of-Day summary to my IT Director without any manual effort.

  * **UX Philosophy:** The experience is driven by a "Live Preview is King" philosophy. The user will build their report on a single screen with an interactive preview of the final email, minimizing clicks and eliminating guesswork.

  * **UX Journey: Creating a Report**

    1.  **Entry Point:** Maria navigates to the "Reports" section and clicks **"+ Create Report"**. She lands on a two-panel editor screen (Controls on the left, Live Preview on the right).
    2.  **Name the Report:** She enters a name in the left panel, like `"Critical EOD Trade Flow Status"`. The `Subject:` line in the right-panel preview instantly updates.
    3.  **Add Content:** Using the powerful search box, Maria adds checks to her report.
          * She searches for `"Trade Settled Log"` and clicks `+` to add the check from `CSI: 12345`.
          * The Live Preview on the right immediately updates to show this check and its status.
          * She then searches for `"CSI 99887"` and adds the `"Market Data Feed"` check from that **CSI**.
          * The Live Preview updates again. She has now flexibly built a cross-CSI report.
    4.  **Schedule & Set Recipients:**
          * She uses the familiar **Scheduler Component** to set the schedule to `Daily` at `6:00 PM EST`.
          * She enters her director's email address in the "Recipients" field. The `To:` line in the preview updates.
    5.  **Save:** After a final look at the live preview, she clicks the single **"Save and Schedule Report"** button.

  * **MVP Email Output:** The resulting email is a clean, status-focused HTML message.

    ```
    Subject: Checks Report: Critical EOD Trade Flow Status

    ----------------------------------------------------

    Report for: Aug 1, 2025, 6:00 PM EST
    Overall Status: WARNING

    - Check: Trade Settled Log (CSI: 12345)
      Status: PASSING (for 16 hours)

    - Check: Market Data Feed (CSI: 99887)
      Status: FAILING (for 23 minutes)
      Error: Assertion failed: Expected status 200, received 503.
      [Investigate in Checks] -> (This is a deep link to the check's detail page)

    ----------------------------------------------------
    ```
    
## 7. Non-Functional Requirements
* **Security:** Must integrate with SSO. RBAC will control access based on user roles and application ownership. Secrets vault integration is mandatory.
* **Scalability:** The platform must be architected to handle a high volume of concurrent checks, including resource-intensive UI tests.
* **Availability:** The platform will target 99.95% uptime.
* **Usability:** The UI must remain intuitive despite the expanded feature set, with a strong focus on guided workflows.

## 8. Design & UX Principles

* **Clarity and Focus:** The interface will be clean and uncluttered, adhering to the professional aesthetic of the Citi Design System. It will use a strong visual hierarchy to guide the user.
* **Consistent and Predictable:** By strictly implementing the Citi Design System via an MUI theme, the UI will be consistent, predictable, and trustworthy.

## 9. Technical Considerations
* **Platform:** A web-based application built with React (TypeScript/Vite) and a Python (FastAPI) backend.
* **Security:** Must adhere to all relevant data security and privacy policies for internal tools.

## 10. Success Metrics
* **Adoption:** The number of unique **CSIs** with active checks on the platform.
* **Engagement:** Total number and types of checks executed per day (API, UI, etc.).
* **Value Confirmation:** Quantifiable reduction in time spent on manual checks and a decrease in Mean Time To Detect (MTTD) for issues caught by the platform.
* **User Satisfaction:** High NPS scores, particularly for the "Checks Studio" feature.

## 11. Assumptions & Dependencies
- **Email Delivery Service:** Access to an enterprise-grade SMTP relay.
* **Browser Automation Service:** The UI Testing feature requires a robust, scalable backend service for browser automation (e.g., an internal Selenium Grid or a cloud-based service).
* **Video Processing Service:** The UI Testing feature requires a backend service capable of screen recording, storing, and streaming video.
* **Expanded API/Client Access:** The advanced check types require network access and API clients/credentials for ITRS, Grafana, AppDynamics, and relevant enterprise databases.
* **Citi System Inventory (CSI) API:** An accessible, reliable, and performant API for the **CSI** system is mandatory. This service must provide a list of valid CSIs and their associated applications/components.
* Stable, documented APIs for all other integration targets (Splunk).
* The internal cloud platform team can provide the necessary infrastructure for these new, more intensive services.