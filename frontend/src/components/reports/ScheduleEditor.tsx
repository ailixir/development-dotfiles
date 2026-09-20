import { formatNextCronRun, parseCron } from '@/utils/cronNextRun';
import { AccessTime, CalendarMonth, CalendarToday, Code, Schedule } from '@mui/icons-material';
import { Alert, AlertTitle, alpha, Box, Chip, FormControl, FormControlLabel, FormLabel, Stack, Switch, TextField, Typography, useTheme } from '@mui/material';
import React, { useMemo } from 'react';

export interface ScheduleEditorProps {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron?: string;
  time?: string;
  timezone?: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  onChange: (next: Partial<ScheduleEditorProps>) => void;
}

const frequencyOptions = [
  { value: 'hourly', label: 'Hourly', icon: AccessTime },
  { value: 'daily', label: 'Daily', icon: Schedule },
  { value: 'weekly', label: 'Weekly', icon: CalendarToday },
  { value: 'monthly', label: 'Monthly', icon: CalendarMonth },
  { value: 'custom', label: 'Cron', icon: Code },
] as const;

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ enabled, frequency, cron = '', time = '18:00', daysOfWeek = [], daysOfMonth = [], onChange }) => {
  const theme = useTheme();
  const dow = Array.isArray(daysOfWeek) ? daysOfWeek : [];
  const dom = Array.isArray(daysOfMonth) ? daysOfMonth : [];

  const isCronValid = useMemo(() => {
    if (!cron.trim()) return false;
    return parseCron(cron) !== null;
  }, [cron]);

  const nextRunLabel = useMemo(() => {
    try {
      const now = new Date();
      const parseTime = (t?: string) => {
        if (!t) return { h: now.getHours(), m: now.getMinutes() };
        const [hh, mm] = t.split(':').map(n => parseInt(n || '0', 10));
        return { h: isNaN(hh) ? 0 : hh, m: isNaN(mm) ? 0 : mm };
      };
      if (!enabled) return 'Disabled';
      if (frequency === 'hourly') {
        const d = new Date(now.getTime());
        d.setHours(now.getHours() + 1, 0, 0, 0);
        return d.toLocaleString();
      }
      if (frequency === 'daily') {
        const { h, m } = parseTime(time);
        const d = new Date(now.getTime());
        d.setHours(h, m, 0, 0);
        if (d <= now) d.setDate(d.getDate() + 1);
        return d.toLocaleString();
      }
      if (frequency === 'weekly') {
        const { h, m } = parseTime(time);
        const selected = dow.length ? dow : [1];
        let best: Date | null = null;
        for (const day of selected) {
          const d = new Date(now.getTime());
          const jsDay = day === 7 ? 0 : day;
          const delta = (jsDay - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + delta);
          d.setHours(h, m, 0, 0);
          if (d <= now) d.setDate(d.getDate() + 7);
          if (!best || d < best) best = d;
        }
        return (best || now).toLocaleString();
      }
      if (frequency === 'monthly') {
        const { h, m } = parseTime(time);
        const selected = dom.length ? dom : [1];
        let best: Date | null = null;
        for (const day of selected) {
          const d = new Date(now.getFullYear(), now.getMonth(), day, h, m, 0, 0);
          if (isNaN(d.getTime())) continue;
          if (d <= now) d.setMonth(d.getMonth() + 1);
          if (!best || d < best) best = d;
        }
        return (best || now).toLocaleString();
      }
      if (frequency === 'custom') {
        return isCronValid ? formatNextCronRun(cron) : 'Invalid cron';
      }
      return '';
    } catch {
      return '';
    }
  }, [enabled, frequency, time, dow, dom, cron, isCronValid]);

  const handleFrequencyChange = (next: string) => {
    const patch: Partial<ScheduleEditorProps> = { frequency: next as any };
    if (next === 'weekly' && dow.length === 0) {
      patch.daysOfWeek = [1];
    }
    if (next === 'monthly' && dom.length === 0) {
      patch.daysOfMonth = [1];
    }
    onChange(patch);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Schedule</Typography>
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked })} size="small" />}
          label={<Typography variant="caption">{enabled ? 'Enabled' : 'Disabled'}</Typography>}
        />
      </Stack>

      {enabled && (
        <>
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Frequency</Typography>
            </FormLabel>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {frequencyOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = frequency === opt.value;
                return (
                  <Chip
                    key={opt.value}
                    icon={<Icon sx={{ fontSize: 16 }} />}
                    label={opt.label}
                    onClick={() => handleFrequencyChange(opt.value)}
                    color={isSelected ? 'primary' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    sx={{
                      px: 0.5,
                      fontWeight: isSelected ? 600 : 400,
                      transition: 'all 0.2s ease',
                    }}
                  />
                );
              })}
            </Stack>
          </FormControl>

          {frequency === 'custom' ? (
            <Box>
              <TextField fullWidth label="Cron expression" value={cron} onChange={(e) => onChange({ cron: e.target.value })} placeholder="0 0 18 * * *" error={cron !== '' && !isCronValid} helperText={cron && !isCronValid ? 'Invalid cron format' : 'Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)'} />
            </Box>
          ) : frequency !== 'hourly' ? (
            <TextField label="Time (HH:mm)" value={time} onChange={(e) => onChange({ time: e.target.value })} helperText="24h format" sx={{ maxWidth: 200 }} />
          ) : null}

          {frequency === 'weekly' && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">Select days of week</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {[{k:1,l:'Mon'},{k:2,l:'Tue'},{k:3,l:'Wed'},{k:4,l:'Thu'},{k:5,l:'Fri'},{k:6,l:'Sat'},{k:7,l:'Sun'}].map((d) => (
                  <Chip key={d.k} label={d.l} color={dow.includes(d.k) ? 'primary' : 'default'} variant={dow.includes(d.k) ? 'filled' : 'outlined'} onClick={() => {
                    const next = dow.includes(d.k) ? dow.filter(x => x !== d.k) : [...dow, d.k].sort((a,b)=>a-b);
                    onChange({ daysOfWeek: next.length > 0 ? next : [1] });
                  }} />
                ))}
              </Stack>
            </Stack>
          )}

          {frequency === 'monthly' && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">Select days of month</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
                {Array.from({ length: 31 }).map((_, idx) => {
                  const day = idx + 1;
                  const selected = dom.includes(day);
                  return (
                    <Chip key={day} label={day} size="small" color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => {
                      const next = selected ? dom.filter(x => x !== day) : [...dom, day].sort((a,b)=>a-b);
                      onChange({ daysOfMonth: next.length > 0 ? next : [1] });
                    }} />
                  );
                })}
              </Box>
            </Stack>
          )}

          <Alert
            severity="info"
            icon={<Schedule />}
            sx={{
              bgcolor: alpha(theme.palette.info.main, 0.06),
              border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
            }}
          >
            <AlertTitle sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Next scheduled run</AlertTitle>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {nextRunLabel || 'Not calculated'}
            </Typography>
          </Alert>
        </>
      )}
    </Stack>
  );
};

export default ScheduleEditor;
