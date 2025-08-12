import React, { useEffect, useState } from 'react';
import { Box, TextField, MenuItem, Stack, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment } from '@mui/material';
import apiClient from '@/services/api/apiClient';

type Scope = 'project' | 'org' | 'user';

interface SecretMeta { id: string; label: string; scope: Scope; last4?: string; createdAt: string }

interface SecretInputProps {
  label: string;
  value?: { id: string } | null;
  onChange: (ref: { id: string } | null) => void;
}

const SecretInput: React.FC<SecretInputProps> = ({ label, value, onChange }) => {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newScope, setNewScope] = useState<Scope>('project');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    (async () => {
      const res = await apiClient.get('/secrets');
      setSecrets((res as any).data ?? []);
    })();
  }, []);

  const handleCreate = async () => {
    const res = (await apiClient.post('/secrets', { label: newLabel, scope: newScope, value: newValue })) as any;
    const created = res as SecretMeta & { value?: string };
    setSecrets((prev) => [...prev, { id: created.id, label: created.label, scope: created.scope, last4: created.last4, createdAt: created.createdAt }]);
    onChange({ id: created.id });
    setOpen(false);
    setNewLabel('');
    setNewScope('project');
    setNewValue('');
  };

  return (
    <Box>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value?.id ?? ''}
        onChange={(e) => onChange(e.target.value ? { id: e.target.value } : null)}
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {secrets.map((s) => (
          <MenuItem key={s.id} value={s.id}>{s.label} {s.last4 ? `(••••${s.last4})` : ''} • {s.scope}</MenuItem>
        ))}
        <MenuItem value="__create__" onClick={() => setOpen(true)}>+ Create new secret…</MenuItem>
      </TextField>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Secret</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} fullWidth />
            <TextField select label="Scope" value={newScope} onChange={(e) => setNewScope(e.target.value as Scope)} fullWidth>
              <MenuItem value="project">Project</MenuItem>
              <MenuItem value="org">Org</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </TextField>
            <TextField
              label="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
              fullWidth
              InputProps={{ endAdornment: <InputAdornment position="end">•••</InputAdornment> }}
              helperText="Shown only once. Will be masked afterwards."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newLabel || !newValue}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecretInput;


