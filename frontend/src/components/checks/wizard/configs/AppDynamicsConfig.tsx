import React from 'react';
import {
  Grid,
  TextField,
  Tooltip,
  Box,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';

interface AppDynamicsConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const AppDynamicsConfig: React.FC<AppDynamicsConfigProps> = ({ formData, onChange }) => {
  return (
    <Grid container spacing={3}>
      {/* Application Name */}
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Application Name"
          value={formData.appDynamicsApp || ''}
          onChange={(e) => onChange('appDynamicsApp', e.target.value)}
          placeholder="Trading-Platform-Prod"
          required
        />
      </Grid>

      {/* Health Rule Name */}
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Health Rule Name
              <Tooltip
                title="The AppDynamics health rule to monitor. Must match the exact rule name configured in the controller."
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.healthRule || ''}
          onChange={(e) => onChange('healthRule', e.target.value)}
          placeholder="Database Connection Pool"
          required
        />
      </Grid>
    </Grid>
  );
};

export default AppDynamicsConfig;
