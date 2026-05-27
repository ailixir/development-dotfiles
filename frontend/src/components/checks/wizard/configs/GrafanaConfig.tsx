import React from 'react';
import {
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
} from '@mui/material';
import { InfoOutlined, ExpandMore } from '@mui/icons-material';

interface GrafanaConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const GrafanaConfig: React.FC<GrafanaConfigProps> = ({ formData, onChange }) => {
  return (
    <Grid container spacing={3}>
      {/* Dashboard ID/Name */}
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Dashboard ID/Name"
          value={formData.grafanaDashboard || ''}
          onChange={(e) => onChange('grafanaDashboard', e.target.value)}
          placeholder="trading-dashboard or d/abc123"
          required
        />
      </Grid>

      {/* Panel ID/Name */}
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Panel ID/Name"
          value={formData.grafanaPanel || ''}
          onChange={(e) => onChange('grafanaPanel', e.target.value)}
          placeholder="CPU Usage or panel-id-5"
          required
        />
      </Grid>

      {/* Metric Query */}
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Metric Query
              <Tooltip
                title="The PromQL or Grafana expression to evaluate, e.g. avg(cpu_usage_percent)"
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.metric || ''}
          onChange={(e) => onChange('metric', e.target.value)}
          placeholder="avg(cpu_usage_percent)"
          required
        />
      </Grid>

      {/* Advanced Settings */}
      <Grid item xs={12}>
        <Accordion defaultExpanded={false} variant="outlined">
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2" fontWeight={600}>
              Advanced Settings
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              {/* Threshold Operator */}
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Threshold Operator</InputLabel>
                  <Select
                    value={formData.thresholdOperator || '<'}
                    label="Threshold Operator"
                    onChange={(e) => onChange('thresholdOperator', e.target.value)}
                  >
                    <MenuItem value="<">Less than (&lt;)</MenuItem>
                    <MenuItem value="<=">Less or equal (&lt;=)</MenuItem>
                    <MenuItem value=">">Greater than (&gt;)</MenuItem>
                    <MenuItem value=">=">Greater or equal (&gt;=)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Threshold Value */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Threshold Value"
                  value={formData.threshold ?? 0}
                  onChange={(e) => onChange('threshold', Number(e.target.value))}
                  inputProps={{ step: 0.1 }}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    </Grid>
  );
};

export default GrafanaConfig;
