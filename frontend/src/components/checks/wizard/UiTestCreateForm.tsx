import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import { newTestRequest } from '@/components/studio/tests/newTestRequest';
import { createErrorMessage } from '@/components/studio/tests/testErrors';
import { STUDIO_TEST_ENVIRONMENTS, TEST_NAME_MAX_LENGTH } from '@/components/studio/tests/testListPresentation';

export type UiTestFormField = 'name' | 'description' | 'csiId' | 'environment';

export interface UiTestFormValues {
  name: string;
  description: string;
  csiId: string;
  environment: string;
}

export interface UiTestCreateFormProps {
  values: UiTestFormValues;
  onChange: (field: UiTestFormField, value: string) => void;
  /** Called with the new test's id once the draft exists. The host removes its stored draft and navigates. */
  onCreated: (testId: string) => void;
}

/**
 * Create Check's UI Test branch (spec §6): one form instead of the four-step wizard. "Create and open
 * Studio" is the only submit; it creates an empty draft and hands the new id to the host. A refusal shows
 * inline (DC-24) and leaves the entered fields and the route as they are.
 */
const UiTestCreateForm: React.FC<UiTestCreateFormProps> = ({ values, onChange, onCreated }) => {
  const { data: registeredCsis, loading: csiLoading, error: csiError } = useAppSelector((state) => state.csi);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The system field only turns red once the user has used it.
  const [csiTouched, setCsiTouched] = useState(false);
  // Likewise the name field turns red for an empty name only after it has been left.
  const [nameTouched, setNameTouched] = useState(false);

  const selectedCsiIsRegistered = csiLoading === 'succeeded'
    && !csiError
    && registeredCsis.some((csi) => csi.id === values.csiId);

  const nameMissing = !values.name.trim();
  const nameTooLong = values.name.length > TEST_NAME_MAX_LENGTH;
  const systemMissing = !selectedCsiIsRegistered;
  const canSubmit = !nameMissing && !nameTooLong && !systemMissing && !creating;

  // Names every reason the button is disabled, from the same conditions as canSubmit. Absent while creating.
  const missingItems: string[] = [];
  if (nameMissing) missingItems.push('Enter a name to continue.');
  if (nameTooLong) missingItems.push(`Shorten the name to ${TEST_NAME_MAX_LENGTH} characters or fewer.`);
  if (systemMissing) missingItems.push('Choose a system to continue.');
  const disabledReason = creating ? '' : missingItems.join(' ');

  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    let createdId: string;
    try {
      createdId = (await studioApi.createTest(newTestRequest(values))).id;
    } catch (failure) {
      setError(createErrorMessage(failure));
      setCreating(false);
      return;
    }
    onCreated(createdId);
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Basic Information</Typography>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Name"
          fullWidth
          required
          value={values.name}
          onChange={(event) => onChange('name', event.target.value)}
          onBlur={() => setNameTouched(true)}
          error={nameTooLong || (nameTouched && nameMissing)}
          inputProps={{ 'data-testid': 'ui-test-create-name' }}
          helperText={`${values.name.length}/${TEST_NAME_MAX_LENGTH}`}
          FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
        />
        <FormControl fullWidth required error={csiTouched && csiLoading === 'succeeded' && !selectedCsiIsRegistered}>
          <InputLabel id="ui-test-create-system-label">System (CSI)</InputLabel>
          <Select
            labelId="ui-test-create-system-label"
            label="System (CSI)"
            value={selectedCsiIsRegistered ? values.csiId : ''}
            disabled={csiLoading === 'loading' || registeredCsis.length === 0}
            onChange={(event) => onChange('csiId', String(event.target.value))}
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
          <InputLabel id="ui-test-create-environment-label">Environment</InputLabel>
          <Select
            labelId="ui-test-create-environment-label"
            label="Environment"
            value={values.environment}
            onChange={(event) => onChange('environment', String(event.target.value))}
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
          value={values.description}
          onChange={(event) => onChange('description', event.target.value)}
        />
        <Typography variant="caption" color="text.secondary">
          You can add steps and variables in the Studio editor after creating the test.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
          {disabledReason && (
            <Typography variant="caption" color="text.secondary" data-testid="ui-test-create-reason">
              {disabledReason}
            </Typography>
          )}
          <Button variant="contained" disabled={!canSubmit} onClick={() => { void submit(); }}>
            {creating ? 'Creating…' : 'Create and open Studio'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
};

export default UiTestCreateForm;
