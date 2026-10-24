import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, Button, Fade } from '@mui/material';
import {
  CAPABILITIES_UNKNOWN,
  vaultSecretsEnabled,
  type StudioCapabilitiesState,
} from '@/utils/config/studioCapabilities';

interface OnboardingCoachProps {
  step: number;
  onNext: () => void;
  onDismiss: () => void;
  /**
   * The host's `useStudioCapabilities(testId)` answer. Secrets are described only when it is a ready
   * `vaultSecrets: true` answer (STUDIO-OBS-008 AC-5, GA C-7). Absent means unknown, so secrets are
   * not mentioned.
   */
  capabilities?: StudioCapabilitiesState;
  /**
   * Scroll the coach into view when it mounts. Off by default: the coach mounts on every page load, and
   * scrolling a phone-sized page to it before the author did anything left the editor opened 342 to 593 px
   * down (STUDIO-UNIFY-001.5, m3). Set it only when the author asked for the guide ("Show guide").
   */
  revealOnMount?: boolean;
}

const messagesFor = (secretsAvailable: boolean) => [
  {
    title: 'Write your steps',
    body: 'Start by describing your flow in simple lines. Use actions like "Go to", "Click", "Type".',
  },
  {
    title: 'Save your checklist',
    body: secretsAvailable
      ? 'Save keeps your steps, environment, variables, and secure secret references together.'
      : 'Save keeps your steps, environment, and variables together.',
  },
  {
    title: 'Run and watch',
    body: 'Run uses your saved steps. Follow progress, proof, and logs while it runs.',
  },
];

const OnboardingCoach: React.FC<OnboardingCoachProps> = ({
  step,
  onNext,
  onDismiss,
  capabilities = CAPABILITIES_UNKNOWN,
  revealOnMount = false,
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  /** The step already revealed (or, without `revealOnMount`, the step the coach opened on). */
  const revealedStep = useRef<number | null>(revealOnMount ? null : step);
  useEffect(() => {
    // A step change the author made scrolls the coach into view; the first paint does not.
    if (revealedStep.current === step) return;
    revealedStep.current = step;
    anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step]);
  const messages = messagesFor(vaultSecretsEnabled(capabilities));
  const msg = messages[step] || messages[0];
  return (
    <Fade in timeout={400}>
      <Paper elevation={0} variant="outlined" sx={{ p: 2, borderStyle: 'dashed', bgcolor: 'background.paper' }}>
        <Box ref={anchorRef}>
          <Typography variant="subtitle1" fontWeight={700}>{msg.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{msg.body}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <Button variant="contained" size="small" onClick={onNext}>Next</Button>
            <Button size="small" onClick={onDismiss}>Dismiss</Button>
          </Box>
        </Box>
      </Paper>
    </Fade>
  );
};

export default OnboardingCoach;
