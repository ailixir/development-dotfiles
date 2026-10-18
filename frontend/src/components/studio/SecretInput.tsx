import React, { useEffect, useState } from 'react';
import { Alert, Box, TextField, MenuItem, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import secretsApi, { type StudioSecret } from '@/services/api/secretsApi';
import {
  SECRETS_NEED_SAVED_TEST,
  isReferenceName,
  secretFailureText,
} from '@/components/studio/references/referenceTokens';

/**
 * Picks a Studio secret by **name**. Secrets are scoped to one saved test and live only in Vault, so
 * the picker needs the test's id: without one it is disabled and sends nothing. The list comes from
 * the server every time and holds names only; nothing about a secret is kept in the browser.
 *
 * A new secret's value is sent to the server once, when it is created, and is cleared from the
 * dialog straight after, on success and on failure. What a test stores as `secretId` is the
 * secret's Vault NAME, which is also what a step writes as `<secret NAME>` (ruling D-8).
 *
 * The host decides whether secrets are offered at all, from the server capability
 * (`useStudioCapabilities`); this component never simulates a Vault.
 */

/** One value bound end to end: OBS-007 AC-12 (F-5), contract corrected by STUDIO-OBS-008 W1 §5. */
const MAX_VALUE_LENGTH = 4096;
const MAX_ORIGINS = 16;
const MAX_ORIGIN_LENGTH = 512;

/** One origin per line, or comma-separated. Blank entries are dropped. */
const parseAllowedOrigins = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/**
 * Only the three fields the contract's `StudioSecret` names survive the create answer. A response
 * that carried anything else (a value, by mistake) is not passed on to a caller or a render.
 */
const projectCreated = (created: StudioSecret): StudioSecret => ({
  name: created.name,
  version: created.version,
  allowedOrigins: [...created.allowedOrigins],
});

interface CreateSecretDialogProps {
  open: boolean;
  /** The persisted Studio test the secret is stored under. `null` keeps Create disabled. */
  testId: string | null;
  onClose: () => void;
  /** Called once per stored secret, with `{name, version, allowedOrigins}` only. */
  onCreated: (secret: StudioSecret) => void;
}

/**
 * "Create Secret": name, value (a password field) and allowed origins. The value lives in this
 * dialog's state only until the create call settles, then it is cleared whatever the answer.
 */
export const CreateSecretDialog: React.FC<CreateSecretDialogProps> = ({ open, testId, onClose, onCreated }) => {
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newOrigins, setNewOrigins] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const origins = parseAllowedOrigins(newOrigins);
  const nameInvalid = newName.length > 0 && !isReferenceName(newName);
  const valueValid = newValue.length > 0 && newValue.length <= MAX_VALUE_LENGTH;
  const originsValid =
    origins.length > 0 && origins.length <= MAX_ORIGINS && origins.every((origin) => origin.length <= MAX_ORIGIN_LENGTH);
  const canCreate = testId !== null && isReferenceName(newName) && valueValid && originsValid && !creating;

  const closeCreate = () => {
    setNewName('');
    setNewValue('');
    setNewOrigins('');
    setCreateError(null);
    onClose();
  };

  const handleCreate = async () => {
    if (testId === null || !canCreate) return;
    setCreating(true);
    try {
      const created = await secretsApi.createSecret(testId, { name: newName, value: newValue, allowedOrigins: origins });
      setNewValue('');
      onCreated(projectCreated(created));
      closeCreate();
    } catch (failure: unknown) {
      setNewValue('');
      setCreateError(secretFailureText(failure, 'Could not create the secret'));
    } finally {
      setCreating(false);
    }
  };

  return (
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
  );
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
  disabledHint = SECRETS_NEED_SAVED_TEST,
  value,
  onChange,
}) => {
  const [secrets, setSecrets] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSecrets([]);
    setLoadError(null);
    if (testId === null) return undefined;
    let active = true;
    secretsApi
      .listSecrets(testId)
      .then((res) => {
        if (active) setSecrets((res.data ?? []).map((secret) => secret.name).filter(isReferenceName));
      })
      .catch((failure: unknown) => {
        if (active) setLoadError(secretFailureText(failure, 'Could not load secrets'));
      });
    return () => {
      active = false;
    };
  }, [testId]);

  const disabled = testId === null;
  const selected = value?.id ?? '';
  // The chosen name stays visible while the list loads, so the select never shows a blank for it.
  const options = selected !== '' && !secrets.includes(selected) ? [selected, ...secrets] : secrets;

  return (
    <Box>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={selected}
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
        {options.map((name) => (
          <MenuItem key={name} value={name}>{name}</MenuItem>
        ))}
        <MenuItem value="__create__">+ Create new secret…</MenuItem>
      </TextField>

      <CreateSecretDialog
        open={open}
        testId={testId}
        onClose={() => setOpen(false)}
        onCreated={(created) => {
          setSecrets((prev) => (prev.includes(created.name) ? prev : [...prev, created.name].sort()));
          onChange({ id: created.name });
        }}
      />
    </Box>
  );
};

export default SecretInput;
