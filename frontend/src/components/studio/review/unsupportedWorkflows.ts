/**
 * The standing statement of what V1 does not do, rendered at review time (story 10.10, AC-17).
 *
 * Architecture §2: *"Unsupported workflows must be explained before confirmation where detectable
 * and fail explicitly otherwise"*, with the V1 exclusions named there. Two obligations, and the
 * second is the honest one: this statement is a **standing** limit list, not detection. The only
 * per-step detection this surface has is what the validator already rejected and returned as
 * diagnostics, and nothing here may read as a clearance the validator did not give.
 */
export const UNSUPPORTED_WORKFLOW_LIMITS: readonly string[] = [
  'One page at a time. A step that moves into a pop-up window, an embedded frame or a second browser tab is outside what this version does.',
  'One run at a time for a test. Nothing here runs two browsers side by side.',
  'Sign-on has to be the single-page form the pilot applications use. Multi-factor sign-on is not assumed to work.',
  'Nothing below has been tried against your application. These limits are stated up front because this page cannot look at your steps and tell you which of them you have hit.',
];

export const UNSUPPORTED_WORKFLOW_HEADING = 'What this version does not do';
