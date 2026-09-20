import SecretInput from '@/components/studio/SecretInput';
import { Delete } from '@mui/icons-material';
import {
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

interface UiTestConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
  availableTests: Array<{ id: string; name: string }>;
  onValidateVariables: () => void;
}

const UiTestConfig: React.FC<UiTestConfigProps> = ({
  formData,
  onChange,
  availableTests,
  onValidateVariables,
}) => {
  const [newVarName, setNewVarName] = useState('');
  const uiVariables: Record<string, any> = formData.uiVariables || {};

  const handleVariableKindChange = (name: string, kind: string) => {
    const updated = {
      ...uiVariables,
      [name]: { ...(uiVariables[name] || {}), kind },
    };
    onChange('uiVariables', updated);
  };

  const handleVariableValueChange = (name: string, value: any) => {
    const updated = {
      ...uiVariables,
      [name]: { ...(uiVariables[name] || {}), value },
    };
    onChange('uiVariables', updated);
  };

  const handleSecretChange = (name: string, ref: { id: string } | null) => {
    const updated = {
      ...uiVariables,
      [name]: { ...(uiVariables[name] || {}), secretId: ref?.id },
    };
    onChange('uiVariables', updated);
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
            value={formData.uiTestId || ''}
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
              {Object.entries(uiVariables).map(([name, v]: [string, any]) => (
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
                        <MenuItem value="secret">Secret</MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {v?.kind === 'secret' ? (
                      <SecretInput
                        label="Select secret"
                        value={v?.secretId ? { id: v.secretId } : null}
                        onChange={(ref) => handleSecretChange(name, ref)}
                      />
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
                      Use in Studio steps as &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;
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
            disabled={!formData.uiTestId}
          >
            Validate variables
          </Button>
        </Stack>
      </Grid>
    </Grid>
  );
};

export default UiTestConfig;
