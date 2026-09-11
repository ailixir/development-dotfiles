import { useState } from 'react';
import { Alert, Box, Button, Collapse, Divider, Stack, Typography } from '@mui/material';
import type { CompileStepDiagnostics } from '@/types/studio/studioTypes';
import { DiagnosticDetail, UNCLAMPED_TEXT_SX } from './DiagnosticsView';

/**
 * One row per line the author wrote (story 10.10, AC-6, AC-16a).
 *
 * Each row carries the original English line, a slot for the action/target/assertion summary, a
 * slot for the executable source one expansion away, and the reasons the validator gave for that
 * line.
 *
 * **Both slots are unavailable, and they say so rather than being filled in.** Architecture §4.7
 * requires a summary *"derived from validated operations"* — from the artifact the server
 * canonicalized, not from the English. Deriving it here would present *the client's* reading of
 * the sentence as *the validator's* reading of the artifact, so the human control point would
 * become the place where two different interpretations are quietly reconciled. The server returns
 * neither the artifact nor its hash on any declared response (AC-15), so the honest render is an
 * empty slot with the blocker named. `@/utils/studio/ir/parseSteps` and
 * `@/utils/studio/codegen/pythonGenerator` are not imported by this story's modules, and a test
 * asserts it.
 *
 * The join is **positional**, which is what the contract declares: *"One entry per original
 * source step, index aligned … The entry count equals the length of `steps` on the same
 * `TestDto`."* A document that does not line up is surfaced as a defect rather than padded,
 * truncated or re-aligned here.
 */

export const SUMMARY_UNAVAILABLE =
  'What the machine decided this line means is not shown: the API does not return the translated actions on any response this page can read (story 10.10, AC-15). Nothing is guessed from your sentence in its place.';

export const SOURCE_UNAVAILABLE =
  'The runnable code for this line is not shown, for the same reason. It is not re-created here from your sentence.';

export interface StepReviewListProps {
  steps: string[];
  stepDiagnostics: CompileStepDiagnostics[] | null;
}

function alignmentDefect(steps: string[], entries: CompileStepDiagnostics[]): string | null {
  if (entries.length !== steps.length) {
    return `The reasons we received do not line up with your steps: ${entries.length} entries for ${steps.length} lines. Nothing below has been shifted or padded to hide it.`;
  }
  const misplaced = entries.findIndex((entry, index) => entry.stepIndex !== index);
  if (misplaced !== -1) {
    return `The reasons we received are out of order at position ${misplaced}. Nothing below has been re-ordered to hide it.`;
  }
  return null;
}

export function StepReviewList({ steps, stepDiagnostics }: StepReviewListProps) {
  const defect = stepDiagnostics ? alignmentDefect(steps, stepDiagnostics) : null;
  const entries = defect ? null : stepDiagnostics;

  return (
    <Box component="section" aria-label="Your steps, and what happened to each" data-testid="step-review-list">
      {defect && (
        <Alert severity="error" data-testid="alignment-defect" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {defect}
          </Typography>
        </Alert>
      )}
      <Stack divider={<Divider flexItem />} spacing={1.5}>
        {steps.map((line, index) => (
          <StepReviewRow
            key={index}
            index={index}
            line={line}
            entry={entries ? entries[index] : undefined}
          />
        ))}
      </Stack>
    </Box>
  );
}

interface StepReviewRowProps {
  index: number;
  line: string;
  entry: CompileStepDiagnostics | undefined;
}

function StepReviewRow({ index, line, entry }: StepReviewRowProps) {
  const [expanded, setExpanded] = useState(false);
  const diagnosticsId = `step-${index}-diagnostics`;
  const hasDiagnostics = !!entry && (entry.diagnostics.length > 0 || entry.truncated);

  return (
    <Box
      component="article"
      aria-label={`Step ${index + 1}`}
      data-testid={`step-review-row-${index}`}
      aria-describedby={hasDiagnostics ? diagnosticsId : undefined}
    >
      <Typography variant="body2" sx={{ ...UNCLAMPED_TEXT_SX, fontWeight: 600 }}>
        {index + 1}. {line}
      </Typography>

      <Box data-testid={`step-summary-${index}`} sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={UNCLAMPED_TEXT_SX}>
          {SUMMARY_UNAVAILABLE}
        </Typography>
      </Box>

      <Box sx={{ mt: 0.5 }}>
        <Button
          size="small"
          variant="text"
          aria-expanded={expanded}
          aria-controls={`step-source-${index}`}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? `Hide the code for step ${index + 1}` : `Show the code for step ${index + 1}`}
        </Button>
        <Collapse in={expanded} unmountOnExit={false}>
          <Box id={`step-source-${index}`} data-testid={`step-source-${index}`} sx={{ pl: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={UNCLAMPED_TEXT_SX}>
              {SOURCE_UNAVAILABLE}
            </Typography>
          </Box>
        </Collapse>
      </Box>

      {entry && (
        <Box id={diagnosticsId} data-testid={`step-diagnostics-${index}`} sx={{ mt: 1, pl: 1 }}>
          {entry.diagnostics.map((diagnostic, position) => (
            <DiagnosticDetail key={`${index}-${position}`} diagnostic={diagnostic} />
          ))}
          {entry.truncated && (
            <Typography variant="body2" color="warning.main" data-testid={`step-truncated-${index}`}>
              There were more problems with this line than we are showing. This is not the same as
              there being no more problems.
            </Typography>
          )}
          {!entry.truncated && entry.diagnostics.length === 0 && entry.ok && (
            <Typography variant="caption" color="text.secondary">
              The translator raised nothing against this line. That is not a statement about
              whether the line matches what you had in mind.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export default StepReviewList;
