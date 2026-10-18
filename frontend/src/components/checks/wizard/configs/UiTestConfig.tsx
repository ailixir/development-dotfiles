import SecretInput from '@/components/studio/SecretInput';
import { secretsUnavailableText } from '@/components/studio/references';
import { useStudioCapabilities, vaultSecretsEnabled } from '@/utils/config/studioCapabilities';
import { Delete } from '@mui/icons-material';
import {
  Alert,
  Button,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import React, { useState } from 'react';

/** One check-level parameter row. A `secret` row carries the secret's Vault name, never a value. */
interface UiVariable {
  kind?: string;
  value?: unknown;
  secretId?: string;
}

/** The wizard's form state, as far as this step reads it. The page owns the rest. */
interface UiTestFormData {
  uiTestId?: unknown;
  uiVariables?: unknown;
  [field: string]: unknown;
}

interface UiTestConfigProps {
  formData: UiTestFormData;
  onChange: (field: string, value: unknown) => void;
  availableTests: Array<{ id: string; name: string }>;
  onValidateVariables: () => void;
}

const asVariables = (value: unknown): Record<string, UiVariable> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, UiVariable>)
    : {};

/** Shown in a secret row while secrets are unavailable and no Studio test is selected yet. */
const NO_STUDIO_TEST_HINT = 'Select a Studio test first';

const UiTestConfig: React.FC<UiTestConfigProps> = ({
  formData,
  onChange,
  availableTests,
  onValidateVariables,
}) => {
  const [newVarName, setNewVarName] = useState('');
  const uiVariables = asVariables(formData.uiVariables);
  const uiTestId = typeof formData.uiTestId === 'string' && formData.uiTestId !== '' ? formData.uiTestId : null;
  // The server's per-test capability (STUDIO-OBS-008 P1): secrets are offered only on a ready
  // `vaultSecrets: true` answer for the selected Studio test. Anything else is unavailable.
  const capabilities = useStudioCapabilities(uiTestId);
  const secretsOn = vaultSecretsEnabled(capabilities);
  const secretsNotice = secretsUnavailableText(capabilities, NO_STUDIO_TEST_HINT);

  const handleVariableKindChange = (name: string, kind: string) => {
    const updated = {
      ...uiVariables,
      [name]: { ...(uiVariables[name] || {}), kind },
    };
    onChange('uiVariables', updated);
  };

  const handleVariableValueChange = (name: string, value: string) => {
    const updated = {
      ...uiVariables,
      [name]: { ...(uiVariables[name] || {}), value },
    };
    onChange('uiVariables', updated);
  };

  /** Writes the picked Vault name (D-8). Clearing the choice removes `secretId`; it is never null or empty. */
  const handleSecretChange = (name: string, ref: { id: string } | null) => {
    const row: UiVariable = { ...(uiVariables[name] || {}) };
    delete row.secretId;
    if (ref) row.secretId = ref.id;
    onChange('uiVariables', { ...uiVariables, [name]: row });
  };

  const handleDeleteVariable = (name: string) => {
    const updated = { ...uiVariables };
    delete updated[name];
    onChange('uiVariables', updated);
  };

  const handleAddVariable = () => {
    if (!newVarName.trim()) return;
    const varKey = newVarName.trim().toUpperCase();
    const updated = {
      ...uiVariables,
      [varKey]: { kind: 'plain', value: '' },
    };
    onChange('uiVariables', updated);
    setNewVarName('');
  };

  return (
    <Grid container spacing={3}>
      {/* Studio Test Selection */}
      <Grid item xs={12} md={8}>
        <FormControl fullWidth required>
          <InputLabel>Studio Test</InputLabel>
          <Select
            value={uiTestId ?? ''}
            label="Studio Test"
            onChange={(e) => onChange('uiTestId', e.target.value)}
          >
            {availableTests.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* Variables Table */}
      <Grid item xs={12}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Variables (Parameters)
        </Typography>
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 220 }}>Name</TableCell>
                <TableCell sx={{ width: 160 }}>Type</TableCell>
                <TableCell>Value / Secret</TableCell>
                <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(uiVariables).map(([name, v]) => (
                <TableRow key={name} hover>
                  <TableCell>
                    <TextField size="small" fullWidth label="Name" value={name} disabled />
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={v?.kind || 'plain'}
                        onChange={(e) => handleVariableKindChange(name, e.target.value)}
                      >
                        <MenuItem value="plain">Plain</MenuItem>
                        <MenuItem value="number">Number</MenuItem>
                        <MenuItem value="boolean">Boolean</MenuItem>
                        {(secretsOn || v?.kind === 'secret') && (
                          <MenuItem value="secret" disabled={!secretsOn}>Secret</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {v?.kind === 'secret' ? (
                      secretsOn ? (
                        <SecretInput
                          label="Select secret"
                          testId={uiTestId}
                          disabledHint={NO_STUDIO_TEST_HINT}
                          value={v?.secretId ? { id: v.secretId } : null}
                          onChange={(ref) => handleSecretChange(name, ref)}
                        />
                      ) : (
                        <Alert severity="info">{secretsNotice}</Alert>
                      )
                    ) : (
                      <TextField
                        size="small"
                        fullWidth
                        label="Value"
                        value={v?.value ?? ''}
                        onChange={(e) => handleVariableValueChange(name, e.target.value)}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleDeleteVariable(name)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}

              {/* Add variable row */}
              <TableRow>
                <TableCell colSpan={4}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      label="New variable name"
                      value={newVarName}
                      onChange={(e) => setNewVarName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddVariable();
                        }
                      }}
                      sx={{ maxWidth: 240 }}
                    />
                    <Button
                      size="small"
                      disabled={!newVarName.trim()}
                      onClick={handleAddVariable}
                    >
                      Add variable
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      {secretsOn
                        ? 'Use in Studio steps as <var NAME> or <secret SECRET_ID>'
                        : 'Use in Studio steps as <var NAME>'}
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>
      </Grid>

      {/* Validate Variables Button */}
      <Grid item xs={12}>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={onValidateVariables}
            disabled={uiTestId === null}
          >
            Validate variables
          </Button>
        </Stack>
      </Grid>
    </Grid>
  );
};

export default UiTestConfig;
