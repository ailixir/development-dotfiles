import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';
import { defaultConfiguration, type TestDto, type TestRequest } from '@/types/studio/studioTypes';
import { STUDIO_TEST_ENVIRONMENTS, TEST_NAME_MAX_LENGTH } from './testListPresentation';
import { createErrorMessage } from './testErrors';

export interface CreateTestDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (test: TestDto) => void;
}

const EMPTY_FORM = { name: '', csiId: '', environment: 'Development', description: '' };

/**
 * Creates a draft with no steps; the author continues in the editor. The System (CSI) must be one
 * the CSI registry returned — a stale global context value is never sent silently.
 */
const CreateTestDialog: React.FC<CreateTestDialogProps> = ({ open, onClose, onCreated }) => {
  const searchContext = useAppSelector((state) => state.dashboard.searchContext);
  const { data: registeredCsis, loading: csiLoading, error: csiError } = useAppSelector((state) => state.csi);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The system field only turns red once the user has used it or tried to create.
  const [csiTouched, setCsiTouched] = useState(false);

  const suggestedCsiId = useMemo(() => {
    if (searchContext.csiId && registeredCsis.some((csi) => csi.id === searchContext.csiId)) {
      return searchContext.csiId;
    }
    return registeredCsis.length === 1 ? registeredCsis[0].id : '';
  }, [registeredCsis, searchContext.csiId]);

  const selectedCsiIsRegistered = csiLoading === 'succeeded'
    && !csiError
    && registeredCsis.some((csi) => csi.id === form.csiId);

  // Each opening starts clean, pre-selecting the suggested system.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCsiTouched(false);
    setForm((current) => ({ ...current, csiId: suggestedCsiId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening; the effect below follows later loads.
  }, [open]);

  useEffect(() => {
    if (!open || csiLoading !== 'succeeded') return;
    setForm((current) => {
      if (registeredCsis.some((csi) => csi.id === current.csiId)) return current;
      return { ...current, csiId: suggestedCsiId };
    });
  }, [open, csiLoading, registeredCsis, suggestedCsiId]);

  const close = () => { if (!creating) onClose(); };

  const submit = async () => {
    setCsiTouched(true);
    setCreating(true);
    setError(null);
    try {
      const payload: TestRequest = {
        name: form.name.trim(),
        csiId: form.csiId,
        description: form.description,
        environment: form.environment,
        steps: [],
        variables: [],
        configuration: defaultConfiguration(),
      };
      const created = await studioApi.createTest(payload);
      setForm(EMPTY_FORM);
      onCreated(created);
    } catch (failure) {
      console.error('Failed to create Studio test:', failure);
      setError(createErrorMessage(failure));
    } finally {
      setCreating(false);
    }
  };

  const nameLength = form.name.length;

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>New UI Test</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            fullWidth
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            inputProps={{ maxLength: TEST_NAME_MAX_LENGTH }}
            helperText={`${nameLength}/${TEST_NAME_MAX_LENGTH}`}
            FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
          />
          <FormControl fullWidth required error={csiTouched && csiLoading === 'succeeded' && !selectedCsiIsRegistered}>
            <InputLabel id="studio-test-system-label">System (CSI)</InputLabel>
            <Select
              labelId="studio-test-system-label"
              label="System (CSI)"
              value={selectedCsiIsRegistered ? form.csiId : ''}
              disabled={csiLoading === 'loading' || registeredCsis.length === 0}
              onChange={(event) => setForm((current) => ({ ...current, csiId: String(event.target.value) }))}
              onClose={() => setCsiTouched(true)}
              onBlur={() => setCsiTouched(true)}
            >
              {registeredCsis.map((csi) => (
                <MenuItem key={csi.id} value={csi.id}>{csi.id}: {csi.name}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {csiLoading === 'loading'
                ? 'Loading available systems…'
                : csiError
                  ? 'Systems could not be loaded. Please try again.'
                  : registeredCsis.length === 0
                    ? 'No systems are available for new tests.'
                    : !selectedCsiIsRegistered
                      ? 'Choose the system this test belongs to.'
                      : 'The test will be saved under this system.'}
            </FormHelperText>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="studio-test-environment-label">Environment</InputLabel>
            <Select
              labelId="studio-test-environment-label"
              label="Environment"
              value={form.environment}
              onChange={(event) => setForm((current) => ({ ...current, environment: String(event.target.value) }))}
            >
              {STUDIO_TEST_ENVIRONMENTS.map((environment) => (
                <MenuItem key={environment} value={environment}>{environment}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
          <Typography variant="caption" color="text.secondary">
            You can add steps and variables in the Studio editor after creating the test.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={creating} onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.name.trim() || !selectedCsiIsRegistered || creating}
          onClick={() => { void submit(); }}
        >
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateTestDialog;
