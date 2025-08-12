import React, { useMemo, useState } from 'react';
import { Alert, Box, FormControl, FormLabel, Radio, RadioGroup, Stack, TextField, Typography, FormControlLabel, Chip } from '@mui/material';

interface ScheduleEditorProps {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron?: string;
  time?: string;
  onChange: (next: Partial<ScheduleEditorProps>) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ enabled, frequency, cron, time, onChange }) => {
  const [cronText, setCronText] = useState(cron || '');
  const [timeText, setTimeText] = useState(time || '18:00');

  const isCronValid = useMemo(() => {
    if (!cronText.trim()) return false;
    const parts = cronText.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }, [cronText]);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Schedule</Typography>
      <FormControl component="fieldset">
        <FormLabel component="legend">Frequency</FormLabel>
        <RadioGroup row value={frequency} onChange={(e) => onChange({ frequency: e.target.value as any })}>
          <FormControlLabel value="hourly" control={<Radio />} label="Hourly" />
          <FormControlLabel value="daily" control={<Radio />} label="Daily" />
          <FormControlLabel value="weekly" control={<Radio />} label="Weekly" />
          <FormControlLabel value="monthly" control={<Radio />} label="Monthly" />
          <FormControlLabel value="custom" control={<Radio />} label="Custom" />
        </RadioGroup>
      </FormControl>

      {frequency !== 'custom' ? (
        <TextField label="Time (HH:mm)" value={timeText} onChange={(e) => { setTimeText(e.target.value); onChange({ time: e.target.value }); }} />
      ) : (
        <Box>
          <TextField fullWidth label="Cron expression" value={cronText} onChange={(e) => { setCronText(e.target.value); onChange({ cron: e.target.value }); }} placeholder="0 0 18 * * *" error={cronText !== '' && !isCronValid} />
          <Alert severity="info" sx={{ mt: 1 }}>Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)</Alert>
        </Box>
      )}

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">Next run:</Typography>
        <Chip label={frequency === 'hourly' ? 'In 1 hour' : frequency === 'daily' ? `Tomorrow at ${timeText}` : frequency === 'weekly' ? `Next week at ${timeText}` : frequency === 'monthly' ? `Next month at ${timeText}` : (isCronValid ? 'Custom cron' : 'Invalid cron')} size="small" />
      </Stack>
    </Stack>
  );
};

export default ScheduleEditor;

