import { useState } from 'react';
import { Alert, Box, Button, Collapse, Divider, Stack, Typography } from '@mui/material';
import type {
  ArtifactStep,
  CompileStepDiagnostics,
  SourceArtifact,
} from '@/types/studio/studioTypes';
import { DiagnosticDetail, UNCLAMPED_TEXT_SX } from './DiagnosticsView';
import {
  artifactDivergence,
  artifactStepAt,
  readOperation,
  summaryLine,
} from './artifactSummary';

/**
 * One row per line the author wrote (story 10.10, AC-6, AC-16a).
 *
 * Each row carries the original English line, the action/target/assertion summary, the executable
 * source one expansion away, and the reasons the validator gave for that line.
 *
 * **Both slots are filled from the artifact, and from nothing else** (story 10.11c AC-28; ADR-002
 * §21). Architecture §4.7 requires a summary *"derived from validated operations"* — from the
 * artifact the server canonicalized, not from the English. Deriving it from `steps` would present
 * *the client's* reading of the sentence as *the validator's* reading of the artifact, so the
 * human control point would become the place where two different interpretations are quietly
 * reconciled. `@/utils/studio/ir/parseSteps` and `@/utils/studio/codegen/pythonGenerator` are not
 * imported by this story's modules, and a test asserts it.
 *
 * **When there is no artifact the slots stay unavailable and say so.** A draft with no candidate
 * has nothing validated to show, and a list entry never carries one — the list projection nulls it
 * deliberately (ADR-002 §21.2). Nothing is reconstructed from the author's sentence in its place.
 *
 * **The artifact and the steps can disagree, by design** (ADR-002 §21.7). The artifact belongs to
 * the candidate revision; `steps` is what the draft says now. Where they differ the surface states
 * it — see `artifactDivergence` — rather than reconciling them, because a reader about to confirm
 * an exact revision is entitled to know that the sentence above the summary is not the sentence
 * the summary came from.
 *
 * The join is **positional**, which is what the contract declares: *"One entry per original
 * source step, index aligned … The entry count equals the length of `steps` on the same
 * `TestDto`."* A document that does not line up is surfaced as a defect rather than padded,
 * truncated or re-aligned here.
 */

export const SUMMARY_UNAVAILABLE =
  'What the machine decided this line means is not shown: this draft has no translated candidate, so there is nothing the validator accepted to describe. Nothing is guessed from your sentence in its place.';

export const SOURCE_UNAVAILABLE =
  'The runnable code for this line is not shown, for the same reason. It is not re-created here from your sentence.';

export interface StepReviewListProps {
  steps: string[];
  stepDiagnostics: CompileStepDiagnostics[] | null;
  /**
   * The candidate revision's validated artifact, or null when the draft has no candidate. Read
   * from `TestDto.currentCandidateArtifact` and never from anywhere else.
   */
  artifact?: SourceArtifact | null;
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

export function StepReviewList({ steps, stepDiagnostics, artifact }: StepReviewListProps) {
  const defect = stepDiagnostics ? alignmentDefect(steps, stepDiagnostics) : null;
  const entries = defect ? null : stepDiagnostics;
  const divergence = artifactDivergence(artifact, steps);

  return (
    <Box component="section" aria-label="Your steps, and what happened to each" data-testid="step-review-list">
      {defect && (
        <Alert severity="error" data-testid="alignment-defect" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {defect}
          </Typography>
        </Alert>
      )}
      {divergence && (
        <Alert severity="info" data-testid="artifact-divergence" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            {divergence}
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
            artifactStep={artifactStepAt(artifact, index)}
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
  artifactStep: ArtifactStep | null;
}

function StepReviewRow({ index, line, entry, artifactStep }: StepReviewRowProps) {
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
          {summaryText(artifactStep)}
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
            <Typography
              variant="caption"
              color="text.secondary"
              component="pre"
              sx={{ ...UNCLAMPED_TEXT_SX, m: 0, fontFamily: 'monospace' }}
            >
              {artifactStep ? artifactStep.code : SOURCE_UNAVAILABLE}
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

/**
 * The summary slot's text, from the artifact entry alone.
 *
 * Three outcomes and no fourth: no artifact entry, an entry this page cannot describe, or the
 * summary. The middle one names what it could not read instead of falling back to the sentence —
 * the executable source is one expansion away either way, so the reader is never left with
 * nothing, and is never given a guess.
 */
function summaryText(artifactStep: ArtifactStep | null): string {
  if (!artifactStep) {
    return SUMMARY_UNAVAILABLE;
  }
  const operation = readOperation(artifactStep.code);
  return operation.recognized
    ? summaryLine(operation)
    : `This page cannot put the translated step into words: ${operation.reason}. The runnable code for it is below.`;
}

export default StepReviewList;
