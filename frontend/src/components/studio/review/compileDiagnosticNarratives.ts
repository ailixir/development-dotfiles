import type { CompileDiagnostic } from '@/types/studio/studioTypes';

/**
 * Author-facing wording for the translator's own refusals (VAL-009).
 *
 * When the model declines a step it says why in one of two closed reasons
 * (`output-contract.md`, rule 5): `UNSUPPORTED_CAPABILITY` (the step asks for something a browser
 * test cannot do) and `AMBIGUOUS_INTENT` (the step could mean more than one thing). Both end the
 * compile `NEEDS_REVISION` with the model's per-step `message` as the diagnostic's message. That
 * message is the model's prose, so it is only ever interpolated into plain text — React renders it
 * as a text node, never as markup.
 *
 * Validator codes (`UNKNOWN_TARGET`, `UNSUPPORTED_ACTION`, …) are not in this map and keep their
 * server message as-is.
 */
/** `detail` is `": <model message>."` (one terminator), or `"."` when the model gave no message. */
type RefusalWording = (step: number, detail: string) => string;

export const REFUSAL_NARRATIVES: Readonly<Record<string, RefusalWording>> = {
  UNSUPPORTED_CAPABILITY: (step, detail) =>
    `Step ${step} can't be done in a browser test${detail} Rewrite or remove it.`,
  AMBIGUOUS_INTENT: (step, detail) =>
    `Step ${step} is ambiguous${detail} Say exactly which element or value you mean.`,
};

export function isRefusalCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(REFUSAL_NARRATIVES, code);
}

/**
 * The refusal sentence for a diagnostic, or null when it is not a model refusal or belongs to no
 * single step. The model's message keeps its own `?`/`!`; otherwise it gets exactly one full stop,
 * so the sentence never reads ".." or "?.". A truncation marker (`…[truncated]`) is kept intact.
 */
export function refusalNarrative(diagnostic: Pick<CompileDiagnostic, 'code' | 'stepIndex' | 'message'>): string | null {
  const wording = REFUSAL_NARRATIVES[diagnostic.code];
  if (!wording || diagnostic.stepIndex === null) {
    return null;
  }
  const message = (diagnostic.message ?? '').trim().replace(/\.+$/, '');
  const detail = message === '' ? '.' : /[?!]$/.test(message) ? `: ${message}` : `: ${message}.`;
  return wording(diagnostic.stepIndex + 1, detail);
}
