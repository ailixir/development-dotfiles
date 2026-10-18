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
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Imperative focus on change
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
