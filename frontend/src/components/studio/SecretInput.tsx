import React, { useEffect, useState } from 'react';
import { Alert, Box, TextField, MenuItem, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import secretsApi from '@/services/api/secretsApi';

/**
 * Picks a Studio secret by **name**. Secrets are scoped to one saved test and live only in Vault, so
 * the picker needs the test's id: without one it is disabled and sends nothing. The list comes from
 * the server every time and holds names only; nothing about a secret is kept in the browser.
 *
 * A new secret's value is sent to the server once, when it is created, and is cleared from this
 * component straight after, on success and on failure. What a test stores as `secretId` is the
 * secret's NAME, which is also what a step writes as `<secret NAME>`.
 */

/** The server's name rule (spec D3): the `<secret NAME>` token grammar, and never `.` or `..`. */
const SECRET_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_VALUE_LENGTH = 8192;
const MAX_ORIGINS = 16;
const MAX_ORIGIN_LENGTH = 512;

const isValidSecretName = (name: string): boolean =>
  SECRET_NAME.test(name) && name !== '.' && name !== '..';

/** One origin per line, or comma-separated. Blank entries are dropped. */
const parseAllowedOrigins = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

const describeFailure = (failure: unknown, fallback: string): string => {
  const code = (failure as { message?: string } | null)?.message ?? '';
  if (code === 'VAULT_NOT_CONFIGURED') return 'Vault is not connected for this environment.';
  if (code === 'SECRET_ALREADY_EXISTS') return 'A secret with this name already exists for this test.';
  if (code === 'VAULT_UNAVAILABLE') return 'Vault is temporarily unavailable. Try again.';
  if (code.startsWith('INVALID_SECRET_')) return 'The secret was rejected: check the name, value and origins.';
  return fallback;
};

interface SecretInputProps {
  label: string;
  /** The persisted Studio test the secrets belong to. `null` (an unsaved test) disables the picker. */
  testId: string | null;
  /** Helper text while `testId` is `null`. */
  disabledHint?: string;
  value?: { id: string } | null;
  onChange: (ref: { id: string } | null) => void;
}

const SecretInput: React.FC<SecretInputProps> = ({
  label,
  testId,
  disabledHint = 'Save the test before adding secrets',
  value,
  onChange,
}) => {
  const [secrets, setSecrets] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newOrigins, setNewOrigins] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setSecrets([]);
    setLoadError(null);
    if (testId === null) return undefined;
    let active = true;
    secretsApi
      .listSecrets(testId)
      .then((res) => {
        if (active) setSecrets((res.data ?? []).map((secret) => secret.name));
      })
      .catch((failure: unknown) => {
        if (active) setLoadError(describeFailure(failure, 'Could not load secrets'));
      });
    return () => {
      active = false;
    };
  }, [testId]);

  const origins = parseAllowedOrigins(newOrigins);
  const nameInvalid = newName.length > 0 && !isValidSecretName(newName);
  const valueValid = newValue.length > 0 && newValue.length <= MAX_VALUE_LENGTH;
  const originsValid =
    origins.length > 0 && origins.length <= MAX_ORIGINS && origins.every((origin) => origin.length <= MAX_ORIGIN_LENGTH);
  const canCreate = testId !== null && isValidSecretName(newName) && valueValid && originsValid && !creating;

  const closeCreate = () => {
    setOpen(false);
    setNewName('');
    setNewValue('');
    setNewOrigins('');
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (testId === null || !canCreate) return;
    setCreating(true);
    try {
      const created = await secretsApi.createSecret(testId, { name: newName, value: newValue, allowedOrigins: origins });
      setSecrets((prev) => (prev.includes(created.name) ? prev : [...prev, created.name].sort()));
      onChange({ id: created.name });
      closeCreate();
    } catch (failure: unknown) {
      setNewValue('');
      setCreateError(describeFailure(failure, 'Could not create the secret'));
    } finally {
      setCreating(false);
    }
  };

  const disabled = testId === null;

  return (
    <Box>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value?.id ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__create__') {
            setOpen(true);
            return;
          }
          onChange(val ? { id: val } : null);
        }}
        SelectProps={{ displayEmpty: true }}
        error={!disabled && loadError !== null}
        helperText={disabled ? disabledHint : loadError ?? undefined}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {secrets.map((name) => (
          <MenuItem key={name} value={name}>{name}</MenuItem>
        ))}
        <MenuItem value="__create__">+ Create new secret…</MenuItem>
      </TextField>

      <Dialog open={open} onClose={closeCreate} maxWidth="sm" fullWidth>
        <DialogTitle>Create Secret</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {createError && <Alert severity="error">{createError}</Alert>}
            <TextField
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              error={nameInvalid}
              helperText={
                nameInvalid
                  ? 'Use 1-64 letters, digits, _ . or - (not "." or "..").'
                  : 'Steps refer to it as <secret NAME>.'
              }
              fullWidth
            />
            <TextField
              label="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
              autoComplete="new-password"
              inputProps={{ maxLength: MAX_VALUE_LENGTH }}
              helperText="Stored in Vault only. It is never shown again."
              fullWidth
            />
            <TextField
              label="Allowed origins"
              value={newOrigins}
              onChange={(e) => setNewOrigins(e.target.value)}
              multiline
              minRows={2}
              placeholder="https://login.app.example"
              helperText="One per line, or comma-separated. The secret is filled only on these origins."
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreate}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!canCreate}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecretInput;
