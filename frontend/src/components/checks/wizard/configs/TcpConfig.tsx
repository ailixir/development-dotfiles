import React, { useState, useEffect } from 'react';
import {
  Grid,
  TextField,
  Typography,
  Slider,
  Button,
  Tooltip,
  Stack,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import { InfoOutlined, PlayArrow } from '@mui/icons-material';

interface TcpConfigProps {
  formData: any;
  onChange: (field: string, value: any) => void;
}

const TcpConfig: React.FC<TcpConfigProps> = ({ formData, onChange }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    latency?: number;
    error?: string;
  } | null>(null);

  // Clear test result when host or port changes
  useEffect(() => {
    setTestResult(null);
  }, [formData.host, formData.port]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/v1/checks/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TCP',
          host: formData.host,
          port: Number(formData.port),
          timeoutMs: (formData.timeout ?? 5) * 1000,
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
          error: data.error || data.output || data.message || `Connection failed (${response.status})`,
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

  return (
    <Grid container spacing={3}>
      {/* Host/IP Address */}
      <Grid item xs={12} md={8}>
        <TextField
          fullWidth
          label="Host/IP Address"
          value={formData.host || ''}
          onChange={(e) => onChange('host', e.target.value)}
          placeholder="127.0.0.1 or hostname.internal.citi.com"
          required
        />
      </Grid>

      {/* Port */}
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              Port
              <Tooltip
                title="The TCP port number to test connectivity on. Common: 80 (HTTP), 443 (HTTPS), 5432 (PostgreSQL), 6379 (Redis)"
                arrow
              >
                <InfoOutlined fontSize="small" color="action" />
              </Tooltip>
            </Box>
          }
          value={formData.port ?? 80}
          onChange={(e) => onChange('port', Number(e.target.value))}
          InputProps={{ inputProps: { min: 1, max: 65535 } }}
          required
        />
      </Grid>

      {/* Connection Timeout */}
      <Grid item xs={12} md={6}>
        <Typography gutterBottom>Connection Timeout (seconds)</Typography>
        <Slider
          value={formData.timeout ?? 10}
          onChange={(_, value) => onChange('timeout', value as number)}
          valueLabelDisplay="auto"
          step={1}
          marks
          min={1}
          max={30}
        />
      </Grid>

      {/* Test Connection */}
      <Grid item xs={12}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="outlined"
            startIcon={testing ? <CircularProgress size={16} /> : <PlayArrow />}
            onClick={handleTestConnection}
            disabled={testing || !formData.host || !formData.port}
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
    </Grid>
  );
};

export default TcpConfig;
