import React, { useMemo, useState } from 'react';
import { Autocomplete, Chip, Stack, TextField, Typography, Button } from '@mui/material';
import reportsApi from '@/services/api/reportsApi';

interface RecipientsEditorProps {
  value: string[];
  onChange: (recipients: string[]) => void;
  reportId?: string | null;
}

const COMMON_RECIPIENTS = [
  'platform-team@citi.com',
  'ops@citi.com',
  'executives@citi.com',
  'sre@citi.com',
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RecipientsEditor: React.FC<RecipientsEditorProps> = ({ value, onChange, reportId }) => {
  const [input, setInput] = useState('');
  const suggestions = useMemo(() => COMMON_RECIPIENTS.filter((e) => !value.includes(e)), [value]);
  const [sending, setSending] = useState(false);

  const add = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !emailRegex.test(trimmed) || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (email: string) => onChange(value.filter((e) => e !== email));

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    }
    if (e.key === 'Backspace' && !input && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const sendTest = async () => {
    if (!reportId) return;
    try {
      setSending(true);
      await reportsApi.sendTest(reportId, value[0]);
    } finally { setSending(false); }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Recipients</Typography>
      <Autocomplete
        freeSolo
        options={suggestions}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        onChange={(_, v) => { if (typeof v === 'string') add(v); }}
        renderInput={(params) => (
          <TextField {...params} label="Add recipient" placeholder="name@citi.com" onKeyDown={onKeyDown} />
        )}
      />
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {value.map((e) => (
          <Chip key={e} label={e} onDelete={() => remove(e)} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" size="small" onClick={sendTest} disabled={!reportId || sending || value.length === 0}>Send test</Button>
      </Stack>
    </Stack>
  );
};

export default RecipientsEditor;

