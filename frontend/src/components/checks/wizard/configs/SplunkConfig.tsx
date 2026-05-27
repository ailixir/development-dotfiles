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

interface SplunkConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const SplunkConfig: React.FC<SplunkConfigProps> = ({ formData, onChange }) => {
  return (
    <Grid container spacing={3}>
      {/* Splunk Query */}
      <Grid item xs={12}>
        <TextField
          fullWidth
          multiline
          rows={4}
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Splunk Query
              <Tooltip
                title="SPL query to execute. Use 'index=...' to scope. Results are counted and compared against the threshold."
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.splunkQuery || ''}
          onChange={(e) => onChange('splunkQuery', e.target.value)}
          placeholder='search index=trading earliest=-15m | stats count by status | where status="success"'
          required
        />
      </Grid>

      {/* Time Range */}
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Time Range
              <Tooltip
                title="The lookback window for the search. Shorter ranges are faster but may miss intermittent issues."
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          </InputLabel>
          <Select
            value={formData.timeRange || '15m'}
            label="Time Range"
            onChange={(e) => onChange('timeRange', e.target.value)}
          >
            <MenuItem value="5m">Last 5 minutes</MenuItem>
            <MenuItem value="15m">Last 15 minutes</MenuItem>
            <MenuItem value="1h">Last hour</MenuItem>
            <MenuItem value="24h">Last 24 hours</MenuItem>
          </Select>
        </FormControl>
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
              {/* Index */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Index (optional)"
                  value={formData.splunkIndex || ''}
                  onChange={(e) => onChange('splunkIndex', e.target.value)}
                  placeholder="trading, logs, metrics"
                />
              </Grid>

              {/* Count Operator */}
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Count Operator</InputLabel>
                  <Select
                    value={formData.countOperator || '>'}
                    label="Count Operator"
                    onChange={(e) => onChange('countOperator', e.target.value)}
                  >
                    <MenuItem value=">">&gt; (greater than)</MenuItem>
                    <MenuItem value=">=">&gt;= (greater or equal)</MenuItem>
                    <MenuItem value="<">&lt; (less than)</MenuItem>
                    <MenuItem value="<=">&lt;= (less or equal)</MenuItem>
                    <MenuItem value="==">=== (equal to)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Expected Count */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Expected Count"
                  value={formData.expectedCount ?? 0}
                  onChange={(e) => onChange('expectedCount', Number(e.target.value))}
                  InputProps={{ inputProps: { min: 0 } }}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    </Grid>
  );
};

export default SplunkConfig;
