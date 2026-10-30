/**
 * The Quick Start templates offered in the Studio editor.
 *
 * A template is a first draft, not a demo. Its job is to get the persona in the BRD (an L2
 * support engineer replacing a 45-minute wiki walkthrough, who does not write code) to a
 * *runnable* checklist without learning the grammar first. The six cover the PRD personas' most
 * common moments, in the order of a working day: L2 support's morning sign-on, key screens and
 * overnight batch; the SRE's release check and on-call record lookup; the operations analyst's
 * filtered report. Everything below is therefore constrained by what the mechanism can actually
 * do, not by what reads nicely:
 *
 * 1. **Every line starts with a familiar action verb** (`Go to`, `Click`, `Type`, `Select`,
 *    `Press`, `Check that`) that maps to an operation in the runner's allowlist. `Scroll` and
 *    `Upload` have no runner operation, so no template uses them.
 * 2. **Every control is named in quotes, with its kind said out loud** ("the *Sign On* button",
 *    "the *User ID* field"). That is the single highest-leverage thing a template can teach: a
 *    named control is found by its role or label on the live page, and an unnamed one ("log in")
 *    is a guess.
 * 3. **Every template ends with an assertion**, because without one a test passes as long as the
 *    browser loaded something. The closing lines map to the only five assertions the runner
 *    permits: `toHaveURL`, `toHaveTitle`, `toBeVisible`, `toContainText`, `toHaveValue`.
 * 4. **No credential is ever inlined.** A password is `<secret NAME>` where `NAME` is a reference
 *    the template also declares, so the reference resolves on the first Run instead of being
 *    rejected as undeclared. This is the defect the previous "Login flow" template shipped: it
 *    referenced `<secret sec_abc123>`, which no draft declares and no vault row matches. NAME is
 *    also the secret's Vault name, its `secretId` (ruling D-8), so the author stores a secret under
 *    that name before the first Run. Such a template is offered only while the server capability
 *    says Vault is configured (see {@link availableQuickStartTemplates}).
 * 5. **One page, one tab, no frames.** V1 runs a single page; nothing here opens a pop-up, a new
 *    tab or an embedded frame.
 * 6. **No negation, no unnamed target, and a `<var>` only as a typed value.** "is not visible" and
 *    "Click the button" are the observed-authoring benchmark's refused cases (C09, C12); a typed
 *    `<var>` is the case it covers (C03), a `<var>` in a click target or an assertion is not.
 */

/** A reference a template needs. Secret rows carry no value; the author points them at a vault entry. */
export interface TemplateVariable {
  readonly name: string;
  readonly type: 'plain' | 'secret';
  /** Starting value for a plain variable. Empty means "the author must supply this". */
  readonly value?: string;
}

export interface QuickStartTemplate {
  readonly id: string;
  readonly title: string;
  /** The pain point this template answers, in the author's words. Shown under the title. */
  readonly purpose: string;
  readonly steps: readonly string[];
  readonly variables: readonly TemplateVariable[];
}

export const QUICK_START_TEMPLATES: readonly QuickStartTemplate[] = [
  {
    id: 'daily-sign-on',
    title: 'Daily sign-on check',
    purpose:
      'The morning walkthrough: can a real user still sign in? Proves the credential path end to end and leaves video of it.',
    steps: [
      'Go to "https://put.internal.citi.com/login"',
      'Type "<var USERNAME>" in the "User ID" field',
      'Type "<secret PASSWORD>" in the "Password" field',
      'Click the "Sign On" button',
      'Check that the URL contains "/dashboard"',
      'Check that "Welcome" is visible on the page',
    ],
    variables: [
      { name: 'USERNAME', type: 'plain', value: '' },
      { name: 'PASSWORD', type: 'secret' },
    ],
  },
  {
    id: 'key-screens-open',
    title: 'Key screens open from the menu',
    purpose:
      'The wiki walkthrough as a checklist: open each screen your team checks every morning and confirm it shows its own heading. Add three lines per screen.',
    steps: [
      'Go to "https://put.internal.citi.com/home"',
      'Click the "Accounts" link',
      'Check that the URL contains "/accounts"',
      'Check that the "Accounts" heading is visible',
      'Click the "Payments" link',
      'Check that the URL contains "/payments"',
      'Check that the "Payments" heading is visible',
    ],
    variables: [],
  },
  {
    id: 'overnight-batch-finished',
    title: 'Overnight batch finished',
    purpose:
      'Before the business day starts: did the job\'s latest run finish? Reads the job monitor so nobody has to open it.',
    steps: [
      'Go to "https://put.internal.citi.com/jobs"',
      'Type "<var JOB_NAME>" in the "Job name" field',
      'Click the "Search" button',
      'Check that "Results" is visible on the page',
      'Check that the "Last run status" column contains "Completed"',
    ],
    variables: [{ name: 'JOB_NAME', type: 'plain', value: '' }],
  },
  {
    id: 'page-reachable-after-release',
    title: 'Page still reachable after a release',
    purpose:
      'No credentials needed, so it is the fastest first check. Catches the blank page, the 500 and the silent redirect to a login screen.',
    steps: [
      'Go to "https://put.internal.citi.com/status"',
      'Check that the URL contains "/status"',
      'Check that the page title is "Platform Status"',
      'Check that "All systems operational" is visible on the page',
    ],
    variables: [],
  },
  {
    id: 'find-a-known-record',
    title: 'Find a known record',
    purpose:
      'The first move in triage: search for a reference that always exists, such as a test account, and open it. Proves search and the details screen answer, not just the home page.',
    steps: [
      'Go to "https://put.internal.citi.com/search"',
      'Type "<var RECORD_ID>" in the "Search" field',
      'Press Enter in the "Search" field',
      'Click the "View details" button',
      'Check that the URL contains "/details"',
      'Check that "Record details" is visible on the page',
    ],
    variables: [{ name: 'RECORD_ID', type: 'plain', value: '' }],
  },
  {
    id: 'filter-a-report',
    title: 'Filter a report and read the result',
    purpose:
      'Proves the application still works, not just that it loads: pick a filter, submit it, and read the number that comes back.',
    steps: [
      'Go to "https://put.internal.citi.com/reports"',
      'Select "Last 24 hours" in the "Time range" dropdown',
      'Type "<var CSI_ID>" in the "CSI" field',
      'Click the "Apply filters" button',
      'Check that "Results" is visible on the page',
      'Check that the "Total checks" summary contains "0 failed"',
    ],
    variables: [{ name: 'CSI_ID', type: 'plain', value: '' }],
  },
];

/**
 * The templates to offer for one test (STUDIO-OBS-008 AC-5, GA C-7). A template that declares a
 * secret is offered only when the server capability says a Vault provider is configured:
 * pass `vaultSecretsEnabled(useStudioCapabilities(testId))`, never a build-time switch. Any other
 * capability state (no saved test, loading, refused, `vaultSecrets: false`) is `false`, so no
 * template asks for a secret the author cannot create.
 */
export function availableQuickStartTemplates(secretsAvailable: boolean): readonly QuickStartTemplate[] {
  return secretsAvailable
    ? QUICK_START_TEMPLATES
    : QUICK_START_TEMPLATES.filter((template) =>
        template.variables.every((variable) => variable.type !== 'secret'),
      );
}

/** Step prefixes the runner has an operation for. Guarded by tests. */
export const TEMPLATE_STEP_PREFIXES: readonly string[] = [
  'Go to',
  'Navigate to',
  'Click',
  'Type',
  'Select',
  'Press',
  'Hover',
  'Check that',
  'Wait for',
];

const VARIABLE_TOKEN = /<var\s+([A-Za-z0-9_.-]{1,64})>/gu;
const SECRET_TOKEN = /<secret\s+([A-Za-z0-9_.-]{1,64})>/gu;

/** The reference names a template's steps mention, in the runner's own token form. */
export function referencedNames(template: QuickStartTemplate): {
  variables: string[];
  secrets: string[];
} {
  const text = template.steps.join('\n');
  const read = (pattern: RegExp): string[] => {
    const scanner = new RegExp(pattern.source, pattern.flags);
    const found = new Set<string>();
    let match = scanner.exec(text);
    while (match !== null) {
      if (match[1] !== undefined) found.add(match[1]);
      match = scanner.exec(text);
    }
    return [...found];
  };
  return { variables: read(VARIABLE_TOKEN), secrets: read(SECRET_TOKEN) };
}
