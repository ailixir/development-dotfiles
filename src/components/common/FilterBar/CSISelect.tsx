import React from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import {
  Domain,
} from '@mui/icons-material';
import { CSI } from '../../../types/csi/csiTypes';
import { getCSIById } from '../../../data/mockCSIData';

interface CSISelectProps {
  csis: CSI[];
  selectedCSI: string | null;
  onCSIChange: (csiId: string | null) => void;
  loading?: boolean;
}

const CSISelect: React.FC<CSISelectProps> = ({
  csis,
  selectedCSI,
  onCSIChange,
  loading = false
}) => {
  const selectedCSIData = selectedCSI ? getCSIById(selectedCSI) : null;

  const handleCSIChange = (_event: any, newValue: CSI | null) => {
    onCSIChange(newValue?.id || null);
  };

  return (
    <Autocomplete
      options={csis}
      getOptionLabel={(option) => `${option.id} - ${option.name}`}
      value={selectedCSIData}
      onChange={handleCSIChange}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select CSI System"
          placeholder="Search by CSI ID or name..."
          required
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <Domain sx={{ color: 'text.secondary', mr: 1 }} />
            ),
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {option.id} - {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.businessUnit}
              </Typography>
            </Box>
          </Box>
        </li>
      )}
      noOptionsText="No CSI systems found"
      isOptionEqualToValue={(option, value) => option.id === value.id}
    />
  );
};

export default CSISelect;