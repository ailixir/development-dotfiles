import {
  Add as AddIcon,
  ExpandMore,
  InfoOutlined,
  PlayArrow
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import React, { useEffect, useState } from 'react';

interface HttpConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const HttpConfig: React.FC<HttpConfigProps> = ({ formData, onChange }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    latency?: number;
    error?: string;
  } | null>(null);
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  // Clear test result when endpoint changes
  useEffect(() => {
    setTestResult(null);
  }, [formData.endpoint]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/v1/checks/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'HTTP',
          url: formData.endpoint,
          method: formData.method || 'GET',
          expectedStatusCode: formData.expectedStatus ?? 200,
          timeoutMs: (formData.timeout ?? 30) * 1000,
          verifyTls: formData.validateSSL ?? true,
          followRedirects: formData.followRedirects ?? true,
          headers: formData.headers || {},
        }),
      });
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (response.ok && data.status === 'SUCCESS') {
        setTestResult({
          status: 'success',
          latency: data.durationMs,
        });
      } else {
        setTestResult({
          status: 'error',
          error: data.error || data.output || data.message || `Request failed (${response.status})`,
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        error: err.message || 'Network error — backend may not be running',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleAddHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      const headers = { ...(formData.headers || {}), [headerKey.trim()]: headerValue.trim() };
      onChange('headers', headers);
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  const handleRemoveHeader = (key: string) => {
    const headers = { ...(formData.headers || {}) };
    delete headers[key];
    onChange('headers', headers);
  };

  return (
    <Grid container spacing={3}>
      {/* Endpoint URL */}
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Endpoint URL"
          value={formData.endpoint || ''}
          onChange={(e) => onChange('endpoint', e.target.value)}
          placeholder="https://api.internal.citi.com/health"
          required
        />
      </Grid>

      {/* HTTP Method */}
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <FormLabel component="legend">HTTP Method</FormLabel>
          <RadioGroup
            row
            value={formData.method || 'GET'}
            onChange={(e) => onChange('method', e.target.value)}
          >
            <FormControlLabel value="GET" control={<Radio />} label="GET" />
            <FormControlLabel value="POST" control={<Radio />} label="POST" />
            <FormControlLabel value="PUT" control={<Radio />} label="PUT" />
            <FormControlLabel value="HEAD" control={<Radio />} label="HEAD" />
          </RadioGroup>
        </FormControl>
      </Grid>

      {/* Expected Status Code */}
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Expected Status Code
              <Tooltip
                title="The HTTP status code that indicates a healthy response. Common: 200 (OK), 204 (No Content), 301 (Redirect)"
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.expectedStatus ?? 200}
          onChange={(e) => onChange('expectedStatus', Number(e.target.value))}
          InputProps={{ inputProps: { min: 100, max: 599 } }}
        />
      </Grid>

      {/* Timeout */}
      <Grid item xs={12} md={6}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <Typography gutterBottom sx={{ mb: 0 }}>Timeout (seconds)</Typography>
          <Tooltip
            title="Maximum time to wait for a response before marking the check as failed"
            arrow
          >
            <InfoOutlined fontSize="small" color="action" />
          </Tooltip>
        </Box>
        <Slider
          value={formData.timeout ?? 30}
          onChange={(_, value) => onChange('timeout', value as number)}
          valueLabelDisplay="auto"
          step={5}
          marks
          min={5}
          max={120}
        />
      </Grid>

      {/* Test Connection */}
      <Grid item xs={12}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="outlined"
            startIcon={testing ? <CircularProgress size={16} /> : <PlayArrow />}
            onClick={handleTestConnection}
            disabled={testing || !formData.endpoint}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        </Stack>
        {testResult && (
          <Alert
            severity={testResult.status === 'error' ? 'error' : 'success'}
            sx={{ mt: 1.5 }}
          >
            {testResult.status === 'error'
              ? testResult.error
              : `Connected — ${testResult.latency != null ? `${testResult.latency}ms` : 'OK'}`}
          </Alert>
        )}
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
              {/* HTTP Headers */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>HTTP Headers</Typography>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="Header Name"
                    value={headerKey}
                    onChange={(e) => setHeaderKey(e.target.value)}
                    placeholder="Content-Type"
                    size="small"
                  />
                  <TextField
                    label="Header Value"
                    value={headerValue}
                    onChange={(e) => setHeaderValue(e.target.value)}
                    placeholder="application/json"
                    size="small"
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleAddHeader}
                    disabled={!headerKey.trim() || !headerValue.trim()}
                  >
                    Add
                  </Button>
                </Box>
                <Stack spacing={1}>
                  {Object.entries(formData.headers || {}).map(([key, value]) => (
                    <Chip
                      key={key}
                      label={`${key}: ${value}`}
                      onDelete={() => handleRemoveHeader(key)}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Grid>

              {/* SSL Validation */}
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.validateSSL ?? true}
                      onChange={(e) => onChange('validateSSL', e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Validate SSL Certificate"
                />
              </Grid>

              {/* Follow Redirects */}
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.followRedirects ?? true}
                      onChange={(e) => onChange('followRedirects', e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Follow HTTP Redirects"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    </Grid>
  );
};

export default HttpConfig;
