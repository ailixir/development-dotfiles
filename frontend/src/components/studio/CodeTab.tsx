import React from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, IconButton, Tooltip, Switch, FormControlLabel } from '@mui/material';
import { AutoAwesome, ContentCopy, Refresh } from '@mui/icons-material';

interface CodeTabProps {
  code: string;
  autoSync: boolean;
  onToggleAutoSync: (value: boolean) => void;
  onRegen?: () => void;
  onGenerateAi?: () => void;
  aiEnabled?: boolean;
  aiLoading?: boolean;
  aiModel?: string;
  aiProvider?: string;
  aiError?: string | null;
  languageLabel?: string;
}

const CodeTab: React.FC<CodeTabProps> = ({ code, autoSync, onToggleAutoSync, onRegen, onGenerateAi, aiEnabled, aiLoading, aiModel, aiProvider, aiError, languageLabel = 'Generated Python (Playwright)' }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{languageLabel}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={autoSync} onChange={(e) => onToggleAutoSync(e.target.checked)} />}
            label={<Typography variant="caption">Auto-sync</Typography>}
          />
          <Tooltip title="Regenerate from Steps">
            <span>
              <IconButton size="small" onClick={onRegen} disabled={autoSync === false}>
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Copy code">
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={aiLoading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome />}
          onClick={onGenerateAi}
          disabled={!aiEnabled || aiLoading || !onGenerateAi}
        >
          {aiLoading ? 'Generating…' : 'Generate with Gemini Flash'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {aiEnabled ? `${aiProvider || 'Vertex AI'} · ${aiModel}` : 'Gemini is not configured on this server'}
        </Typography>
      </Stack>
      {aiError && <Alert severity="error" sx={{ mb: 1 }}>{aiError}</Alert>}
      <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.900', color: 'grey.100', fontFamily: 'monospace', fontSize: '0.8rem', overflow: 'auto', maxHeight: 360 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }}>{code}</pre>
      </Paper>
      {!autoSync && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Manual mode: edits in the code editor are not supported in this prototype. Toggle Auto-sync to regenerate.
        </Typography>
      )}
    </Box>
  );
};

export default CodeTab;
