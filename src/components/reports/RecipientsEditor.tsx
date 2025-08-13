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
  const [input, setInput] = useState<string>('');
  const suggestions = useMemo(() => COMMON_RECIPIENTS.filter((e) => !value?.includes(e)), [value]);
  const [sending, setSending] = useState(false);

  const add = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !emailRegex.test(trimmed) || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (email: string) => onChange((value || []).filter((e) => e !== email));

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // Prevent global shortcuts from firing while typing in recipients
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    }
    if (e.key === 'Backspace' && !input && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const onKeyUp: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // Block bubbling to avoid app-level hotkeys (like '/')
    e.stopPropagation();
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
        options={suggestions || []}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        onChange={(_, v) => { if (typeof v === 'string') add(v); }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add recipient"
            placeholder="name@citi.com"
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onKeyPress={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            helperText={!input || emailRegex.test(input) ? 'Enter to add, comma to separate' : 'Invalid email format'}
            error={Boolean(input) && !emailRegex.test(input)}
            inputProps={{ ...params.inputProps, 'aria-label': 'Add recipient email' }}
          />
        )}
      />
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
        {value.map((e) => (
          <Chip key={e} label={e} onDelete={() => remove(e)} aria-label={`recipient ${e}`} />
        ))}
      </Stack>
      {/* Send test button removed from this component; actions moved to builder toolbar */}
    </Stack>
  );
};

export default RecipientsEditor;

