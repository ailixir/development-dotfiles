/**
 * The Quick Start templates offered in the Studio editor.
 *
 * A template is a first draft, not a demo. Its job is to get the persona in the BRD (an L2
 * support engineer replacing a 45-minute wiki walkthrough, who does not write code) to a
 * *runnable* checklist without learning the grammar first. Everything below is therefore
 * constrained by what the mechanism can actually do, not by what reads nicely:
 *
 * 1. **Every line starts with a familiar action verb** (`Go to`, `Click`, `Type`, `Select`,
 *    `Press`, `Check that`) that maps to an operation in the runner's allowlist. `Scroll` and
 *    `Upload` have no runner operation, so no template uses them.
 * 2. **Every control is named in quotes, with its kind said out loud** ("the *Sign On* button",
 *    "the *User ID* field"). That is the single highest-leverage thing a template can teach: the
 *    compiler turns a named control into `getByRole` / `getByLabel`, and turns an unnamed one
 *    ("log in") into a guess. The validator will happily accept a confidently wrong locator.
 * 3. **Every template ends with an assertion**, because without one a test passes as long as the
 *    browser loaded something. The closing lines map to the only five assertions the runner
 *    permits: `toHaveURL`, `toHaveTitle`, `toBeVisible`, `toContainText`, `toHaveValue`.
 * 4. **No credential is ever inlined.** A password is `<secret NAME>` where `NAME` is a reference
 *    the template also declares, so the reference resolves on the first compile instead of being
 *    rejected as undeclared. This is the defect the previous "Login flow" template shipped: it
 *    referenced `<secret sec_abc123>`, which no draft declares and no vault row matches.
 * 5. **One page, one tab, no frames.** V1 runs a single page; nothing here opens a pop-up, a new
 *    tab or an embedded frame (see `UNSUPPORTED_WORKFLOW_LIMITS`).
 *
 * The canonical phrasing is the worked example in `backend/src/main/resources/studio/
 * syntax-reference.md`, the same document the compile prompt carries. Templates deliberately
 * echo it, because a checklist written in the shape the prompt was shown is the one the model
 * translates most predictably.
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

/** Templates exposed by the production alpha; Vault-dependent examples remain test fixtures. */
export const PRODUCTION_ALPHA_TEMPLATES: readonly QuickStartTemplate[] =
  QUICK_START_TEMPLATES.filter(
    (template) => template.variables.every((variable) => variable.type !== 'secret'),
  );

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
