import React from 'react';
import { Box, Typography, Stack, Switch, FormControlLabel } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';

interface WizardHeaderProps {
  editId?: string;
  checkName: string;
  saveHint: 'idle' | 'saving' | 'saved';
  autosaveEnabled: boolean;
  onAutosaveChange: (enabled: boolean) => void;
}

const WizardHeader: React.FC<WizardHeaderProps> = ({
  editId,
  checkName,
  saveHint,
  autosaveEnabled,
  onAutosaveChange,
}) => {
  return (
    <Box sx={{ mb: 4 }}>
      {/* Row 1: Title + Autosave */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography
          variant="h4"
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          {editId ? (
            <>
              <EditIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              Edit Check{checkName ? `: ${checkName}` : ''}
            </>
          ) : (
            <>
              <AddIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              Create Check
            </>
          )}
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1}>
          {/* Save hint */}
          <Typography
            variant="caption"
            sx={{
              color:
                saveHint === 'saving'
                  ? 'text.secondary'
                  : saveHint === 'saved'
                    ? 'success.main'
                    : 'transparent',
              transition: 'color 0.2s ease',
              minWidth: 80,
              textAlign: 'right',
            }}
          >
            {saveHint === 'saving'
              ? 'Saving draft...'
              : saveHint === 'saved'
                ? 'Draft saved'
                : ''}
          </Typography>

          {/* Autosave toggle */}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autosaveEnabled}
                onChange={(e) => onAutosaveChange(e.target.checked)}
              />
            }
            label="Autosave"
            slotProps={{
              typography: { variant: 'body2' },
            }}
          />
        </Stack>
      </Stack>

      {/* Row 2: Subtitle */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Build comprehensive health checks for your applications and
        infrastructure.
      </Typography>
    </Box>
  );
};

export default WizardHeader;
