import React, { useMemo, useState } from 'react';
import { Alert, Box, FormControl, FormLabel, Radio, RadioGroup, Stack, TextField, Typography, FormControlLabel, Chip, Switch } from '@mui/material';

interface ScheduleEditorProps {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron?: string;
  time?: string; // HH:mm (local)
  timezone?: string;
  daysOfWeek?: number[]; // 1-7 (Mon-Sun)
  daysOfMonth?: number[]; // 1-31
  onChange: (next: Partial<ScheduleEditorProps>) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ enabled, frequency, cron, time, timezone, daysOfWeek = [], daysOfMonth = [], onChange }) => {
  const [cronText, setCronText] = useState(cron || '');
  const [timeText, setTimeText] = useState(time || '18:00');
  const [tzText, setTzText] = useState(timezone || 'EST');
  const [dow, setDow] = useState<number[]>(Array.isArray(daysOfWeek) ? daysOfWeek : []);
  const [dom, setDom] = useState<number[]>(Array.isArray(daysOfMonth) ? daysOfMonth : []);

  const isCronValid = useMemo(() => {
    if (!cronText.trim()) return false;
    const parts = cronText.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }, [cronText]);

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
        const { h, m } = parseTime(timeText);
        const d = new Date(now.getTime());
        d.setHours(h, m, 0, 0);
        if (d <= now) d.setDate(d.getDate() + 1);
        return d.toLocaleString();
      }
      if (frequency === 'weekly') {
        const { h, m } = parseTime(timeText);
        const selected = dow.length ? dow : [1];
        let best: Date | null = null;
        for (const day of selected) {
          const d = new Date(now.getTime());
          // day: 1=Mon .. 7=Sun
          const jsDay = day === 7 ? 0 : day; // JS: 0=Sun..6=Sat
          const delta = (jsDay - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + delta);
          d.setHours(h, m, 0, 0);
          if (d <= now) d.setDate(d.getDate() + 7);
          if (!best || d < best) best = d;
        }
        return (best || now).toLocaleString();
      }
      if (frequency === 'monthly') {
        const { h, m } = parseTime(timeText);
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
        return isCronValid ? 'Custom cron' : 'Invalid cron';
      }
      return '';
    } catch {
      return '';
    }
  }, [enabled, frequency, timeText, dow, dom, isCronValid]);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Schedule</Typography>
      <Alert severity={enabled ? 'success' : 'warning'} sx={{ py: 0 }}>
        {enabled ? 'Scheduling enabled' : 'Scheduling disabled'}
      </Alert>
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />} label={enabled ? 'Enabled' : 'Disabled'} />
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

      {frequency === 'custom' ? (
        <Box>
          <TextField fullWidth label="Cron expression" value={cronText} onChange={(e) => { setCronText(e.target.value); onChange({ cron: e.target.value }); }} placeholder="0 0 18 * * *" error={cronText !== '' && !isCronValid} helperText={cronText && !isCronValid ? 'Invalid cron format' : 'Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)'} />
          <Alert severity="info" sx={{ mt: 1 }}>Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)</Alert>
        </Box>
      ) : frequency !== 'hourly' ? (
        <TextField label="Time (HH:mm)" value={timeText} onChange={(e) => { setTimeText(e.target.value); onChange({ time: e.target.value }); }} helperText="24h format" />
      ) : null}

      {/* Weekly day-of-week selection */}
      {frequency === 'weekly' && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">Select days of week</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {[{k:1,l:'Mon'},{k:2,l:'Tue'},{k:3,l:'Wed'},{k:4,l:'Thu'},{k:5,l:'Fri'},{k:6,l:'Sat'},{k:7,l:'Sun'}].map((d) => (
              <Chip key={d.k} label={d.l} color={dow.includes(d.k) ? 'primary' : 'default'} variant={dow.includes(d.k) ? 'filled' : 'outlined'} onClick={() => {
                const next = dow.includes(d.k) ? dow.filter(x => x !== d.k) : [...dow, d.k].sort((a,b)=>a-b);
                setDow(next);
                onChange({ daysOfWeek: next });
              }} />
            ))}
          </Stack>
        </Stack>
      )}

      {/* Monthly day-of-month selection */}
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
                  setDom(next);
                  onChange({ daysOfMonth: next });
                }} />
              );
            })}
          </Box>
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">Next run:</Typography>
        <Chip label={nextRunLabel || '—'} size="small" />
      </Stack>
    </Stack>
  );
};

export default ScheduleEditor;

