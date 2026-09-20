import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import type { CompileDiagnostic, CompileDiagnostics } from '@/types/studio/studioTypes';

/**
 * The parts of the diagnostics document that belong to no single step (story 10.10, AC-6..AC-8).
 *
 * The per-step reasons render inside {@link StepReviewList} beside the line they belong to; what
 * is here is the artifact-level region, the document-level truncation flag, and the repair facts.
 *
 * **Truncation is rendered at every level the document carries it.** ADR-002 §16.5: *"a client
 * that renders this document without rendering those flags turns a bounded report into a false
 * one — which is a requirement on 10.10, not decoration."* A reader who is shown three problems
 * and fixes three problems, when a fourth was shed to fit a byte cap, has been misled by a
 * surface that looked finished.
 */

/** Rendered so a clamped string keeps its marker: no CSS ellipsis, no second clamp here. */
export const UNCLAMPED_TEXT_SX = {
  whiteSpace: 'pre-wrap' as const,
  overflowWrap: 'anywhere' as const,
  textOverflow: 'clip' as const,
  overflow: 'visible' as const,
};

export function DiagnosticDetail({ diagnostic }: { diagnostic: CompileDiagnostic }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
        {diagnostic.message}
      </Typography>
      {diagnostic.excerpt !== null && diagnostic.excerpt !== '' && (
        <Typography
          variant="caption"
          component="pre"
          sx={{ ...UNCLAMPED_TEXT_SX, m: 0, mt: 0.5, fontFamily: 'monospace' }}
        >
          {diagnostic.excerpt}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Reason given by the translator: {diagnostic.code}
        {diagnostic.node ? ` (${diagnostic.node})` : ''}
      </Typography>
    </Box>
  );
}

export interface DiagnosticsSummaryProps {
  diagnostics: CompileDiagnostics;
}

export function DiagnosticsSummary({ diagnostics }: DiagnosticsSummaryProps) {
  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      <Box
        component="section"
        aria-label="How many times the translation was attempted"
        data-testid="repair-attempts"
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" label={`Attempts: ${diagnostics.attempts}`} />
          <Typography variant="body2">
            {diagnostics.attempts === 1
              ? 'The translator tried once. Nothing was re-attempted after it.'
              : `The translator tried ${diagnostics.attempts} times, re-working its own output between tries.`}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {diagnostics.exhausted
            ? 'It has now tried as many times as it is allowed and the result is still not runnable. Asking again will reach the same place — the way forward is editing the steps named below.'
            : 'It has not used up the tries it is allowed. What is listed below is the last try only, not a history.'}
        </Typography>
      </Box>

      {diagnostics.truncated && (
        <Alert severity="warning" data-testid="document-truncation">
          <Typography variant="body2" sx={UNCLAMPED_TEXT_SX}>
            This list is incomplete. Whole steps&apos; reasons were left out to keep the report
            within its size limit
            {diagnostics.truncationReason ? ` (${diagnostics.truncationReason})` : ''}. Steps shown
            below with no reason may still have had one.
          </Typography>
        </Alert>
      )}

      {diagnostics.artifact.length > 0 && (
        <Box
          component="section"
          aria-label="Problems that belong to the test as a whole"
          data-testid="artifact-diagnostics"
        >
          <Typography variant="subtitle2" gutterBottom>
            Problems with the test as a whole
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            These belong to no single line of yours.
          </Typography>
          {diagnostics.artifact.map((diagnostic, index) => (
            <DiagnosticDetail key={`artifact-${index}`} diagnostic={diagnostic} />
          ))}
        </Box>
      )}
    </Stack>
  );
}

export default DiagnosticsSummary;
