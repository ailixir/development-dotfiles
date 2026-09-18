import React, { useEffect, useState } from 'react';
import { Box, TextField, MenuItem, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment } from '@mui/material';
import secretsApi, { type SecretMetadata } from '@/services/api/secretsApi';

type Scope = SecretMetadata['scope'];

interface SecretMeta { id: string; label: string; scope: Scope; last4?: string; createdAt: string }

/**
 * Picks a secret by **reference**. The list comes from the secrets API every time; nothing about a
 * secret is kept in the browser (Studio v1: the `checks:secrets` localStorage copy is gone). A new
 * secret's value is sent to the server once, when it is created, and is cleared from this
 * component straight after. What a test stores is the id the server returned.
 */

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    secretsApi
      .listSecrets()
      .then((res) => {
        if (active) setSecrets(res.data ?? []);
      })
      .catch((failure: unknown) => {
        if (active) setError((failure as { message?: string })?.message || 'Could not load secrets');
      });
    return () => {
      active = false;
    };
  }, []);

  const closeCreate = () => {
    setOpen(false);
    setNewLabel('');
    setNewScope('project');
    setNewValue('');
  };

  const handleCreate = async () => {
    try {
      const created = await secretsApi.createSecret(newLabel, newScope, newValue);
      const meta: SecretMeta = { id: created.id, label: created.label, scope: created.scope, last4: created.last4, createdAt: created.createdAt };
      setSecrets((prev) => [...prev.filter((s) => s.id !== meta.id), meta]);
      setError(null);
      onChange({ id: created.id });
      closeCreate();
    } catch (failure: unknown) {
      setError((failure as { message?: string })?.message || 'Could not create the secret');
    }
  };

  return (
    <Box>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value?.id ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__create__') {
            setOpen(true);
            return;
          }
          onChange(val ? { id: val } : null);
        }}
        SelectProps={{ displayEmpty: true }}
        error={error !== null}
        helperText={error ?? undefined}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {secrets.map((s) => (
          <MenuItem key={s.id} value={s.id}>{s.label} {s.last4 ? `(••••${s.last4})` : ''} • {s.scope}</MenuItem>
        ))}
        <MenuItem value="__create__">+ Create new secret…</MenuItem>
      </TextField>

      <Dialog open={open} onClose={closeCreate} maxWidth="sm" fullWidth>
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
          <Button onClick={closeCreate}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newLabel || !newValue}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecretInput;


