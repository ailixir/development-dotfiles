import React from 'react';
import {
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Box,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';

interface ItrsConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const ItrsConfig: React.FC<ItrsConfigProps> = ({ formData, onChange }) => {
  return (
    <Grid container spacing={3}>
      {/* ITRS Sampler Path */}
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              ITRS Sampler Path
              <Tooltip
                title="Full path to the ITRS Geneos sampler in the format: Gateway > ManagedEntity > Sampler > Dataview"
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.itrsSampler || ''}
          onChange={(e) => onChange('itrsSampler', e.target.value)}
          placeholder="Gateway > ManagedEntity > Sampler > Dataview"
          required
        />
      </Grid>

      {/* Expected Status */}
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Expected Status</InputLabel>
          <Select
            value={formData.itrsExpectedStatus || 'OK'}
            label="Expected Status"
            onChange={(e) => onChange('itrsExpectedStatus', e.target.value)}
          >
            <MenuItem value="OK">OK</MenuItem>
            <MenuItem value="WARNING">WARNING</MenuItem>
            <MenuItem value="CRITICAL">CRITICAL</MenuItem>
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );
};

export default ItrsConfig;
