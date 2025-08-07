import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormLabel,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Chip,
  Autocomplete,
  Switch,
  Slider,
  Alert,
  AlertTitle,
  Divider,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Preview as PreviewIcon,
  NavigateNext as NextIcon,
  NavigateBefore as BackIcon,
} from '@mui/icons-material';

const checkTypes = [
  { value: 'http', label: 'HTTP Check', description: 'Monitor HTTP/HTTPS endpoints' },
  { value: 'tcp', label: 'TCP Check', description: 'Monitor TCP port connectivity' },
  { value: 'splunk', label: 'Splunk Query', description: 'Execute Splunk search queries' },
  { value: 'grafana', label: 'Grafana Dashboard', description: 'Monitor Grafana metrics' },
  { value: 'itrs', label: 'ITRS Geneos', description: 'ITRS monitoring integration' },
  { value: 'appdynamics', label: 'AppDynamics', description: 'Application performance monitoring' },
];

const csiEntities = [
  'Banking Services',
  'Trading Platform',
  'Customer Portal',
  'Payment Systems',
  'Risk Management',
  'Compliance Tools',
];

const environments = ['Development', 'Staging', 'Production', 'UAT'];
const frequencies = ['1 minute', '5 minutes', '15 minutes', '30 minutes', '1 hour', '6 hours', '12 hours', '24 hours'];

const steps = ['Basic Information', 'Check Configuration', 'Scheduling & Alerts', 'Review & Create'];

const CreateCheckPage: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Basic Information
    name: '',
    description: '',
    checkType: '',
    csiEntity: '',
    environment: '',
    tags: [] as string[],
    
    // Check Configuration
    endpoint: '',
    method: 'GET',
    expectedStatus: 200,
    timeout: 30,
    retries: 3,
    validateSSL: true,
    followRedirects: true,
    
    // Scheduling & Alerts
    frequency: '5 minutes',
    enabled: true,
    alertOnFailure: true,
    alertThreshold: 3,
    notificationChannels: [] as string[],
  });

  const [tagInput, setTagInput] = useState('');

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleInputChange = (field: string) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Check Name"
                value={formData.name}
                onChange={handleInputChange('name')}
                placeholder="e.g., Trading API Health Check"
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                value={formData.description}
                onChange={handleInputChange('description')}
                placeholder="Describe what this check monitors and its business purpose"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Check Type</InputLabel>
                <Select
                  value={formData.checkType}
                  label="Check Type"
                  onChange={handleInputChange('checkType')}
                >
                  {checkTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      <Box>
                        <Typography variant="body1">{type.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {type.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Autocomplete
                options={csiEntities}
                value={formData.csiEntity}
                onChange={(_, newValue) => setFormData(prev => ({ ...prev, csiEntity: newValue || '' }))}
                renderInput={(params) => (
                  <TextField {...params} label="CSI Entity" required />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Environment</InputLabel>
                <Select
                  value={formData.environment}
                  label="Environment"
                  onChange={handleInputChange('environment')}
                >
                  {environments.map((env) => (
                    <MenuItem key={env} value={env}>
                      {env}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box>
                <TextField
                  fullWidth
                  label="Add Tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Type tag and press Add"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <Button size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>
                        Add
                      </Button>
                    ),
                  }}
                />
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {formData.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onDelete={() => handleRemoveTag(tag)}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            </Grid>
          </Grid>
        );

      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ mb: 2 }}>
                <AlertTitle>Check Type: {checkTypes.find(t => t.value === formData.checkType)?.label}</AlertTitle>
                Configuration options will vary based on the selected check type.
              </Alert>
            </Grid>

            {formData.checkType === 'http' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Endpoint URL"
                    value={formData.endpoint}
                    onChange={handleInputChange('endpoint')}
                    placeholder="https://api.example.com/health"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel component="legend">HTTP Method</FormLabel>
                    <RadioGroup
                      row
                      value={formData.method}
                      onChange={handleInputChange('method')}
                    >
                      <FormControlLabel value="GET" control={<Radio />} label="GET" />
                      <FormControlLabel value="POST" control={<Radio />} label="POST" />
                      <FormControlLabel value="PUT" control={<Radio />} label="PUT" />
                      <FormControlLabel value="HEAD" control={<Radio />} label="HEAD" />
                    </RadioGroup>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Expected Status Code"
                    value={formData.expectedStatus}
                    onChange={handleInputChange('expectedStatus')}
                    InputProps={{ inputProps: { min: 100, max: 599 } }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Timeout (seconds)</Typography>
                  <Slider
                    value={formData.timeout}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, timeout: value as number }))}
                    valueLabelDisplay="auto"
                    step={5}
                    marks
                    min={5}
                    max={120}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Retry Attempts"
                    value={formData.retries}
                    onChange={handleInputChange('retries')}
                    InputProps={{ inputProps: { min: 0, max: 10 } }}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.validateSSL}
                          onChange={handleInputChange('validateSSL')}
                          color="primary"
                        />
                      }
                      label="Validate SSL Certificate"
                    />
                  </Box>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.followRedirects}
                          onChange={handleInputChange('followRedirects')}
                          color="primary"
                        />
                      }
                      label="Follow HTTP Redirects"
                    />
                  </Box>
                </Grid>
              </>
            )}

            {!formData.checkType && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  Please select a check type in the previous step to configure specific options.
                </Alert>
              </Grid>
            )}
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Check Frequency</InputLabel>
                <Select
                  value={formData.frequency}
                  label="Check Frequency"
                  onChange={handleInputChange('frequency')}
                >
                  {frequencies.map((freq) => (
                    <MenuItem key={freq} value={freq}>
                      {freq}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={handleInputChange('enabled')}
                    color="primary"
                  />
                }
                label="Enable Check"
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>Alert Configuration</Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.alertOnFailure}
                    onChange={handleInputChange('alertOnFailure')}
                    color="primary"
                  />
                }
                label="Send alerts on check failure"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Alert After N Failures"
                value={formData.alertThreshold}
                onChange={handleInputChange('alertThreshold')}
                disabled={!formData.alertOnFailure}
                InputProps={{ inputProps: { min: 1, max: 10 } }}
              />
            </Grid>

            {formData.alertOnFailure && (
              <Grid item xs={12}>
                <Autocomplete
                  multiple
                  options={['Email', 'Slack', 'Teams', 'PagerDuty', 'Webhook']}
                  value={formData.notificationChannels}
                  onChange={(_, newValue) => setFormData(prev => ({ ...prev, notificationChannels: newValue }))}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Notification Channels" />
                  )}
                />
              </Grid>
            )}
          </Grid>
        );

      case 3:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="success" sx={{ mb: 3 }}>
                <AlertTitle>Ready to Create</AlertTitle>
                Review your check configuration below and click Create Check to proceed.
              </Alert>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Typography><strong>Name:</strong> {formData.name}</Typography>
                <Typography><strong>Type:</strong> {checkTypes.find(t => t.value === formData.checkType)?.label}</Typography>
                <Typography><strong>CSI Entity:</strong> {formData.csiEntity}</Typography>
                <Typography><strong>Environment:</strong> {formData.environment}</Typography>
                {formData.tags.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography component="span"><strong>Tags:</strong> </Typography>
                    {formData.tags.map(tag => (
                      <Chip key={tag} label={tag} size="small" sx={{ ml: 0.5 }} />
                    ))}
                  </Box>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Scheduling</Typography>
                <Typography><strong>Frequency:</strong> {formData.frequency}</Typography>
                <Typography><strong>Status:</strong> {formData.enabled ? 'Enabled' : 'Disabled'}</Typography>
                <Typography><strong>Alerts:</strong> {formData.alertOnFailure ? `After ${formData.alertThreshold} failures` : 'Disabled'}</Typography>
                {formData.notificationChannels.length > 0 && (
                  <Typography><strong>Channels:</strong> {formData.notificationChannels.join(', ')}</Typography>
                )}
              </Paper>
            </Grid>

            {formData.checkType === 'http' && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>HTTP Configuration</Typography>
                  <Typography><strong>Endpoint:</strong> {formData.endpoint}</Typography>
                  <Typography><strong>Method:</strong> {formData.method}</Typography>
                  <Typography><strong>Expected Status:</strong> {formData.expectedStatus}</Typography>
                  <Typography><strong>Timeout:</strong> {formData.timeout}s</Typography>
                  <Typography><strong>Retries:</strong> {formData.retries}</Typography>
                </Paper>
              </Grid>
            )}
          </Grid>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          Create New Check
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Build comprehensive health checks for your applications and infrastructure using our multi-step wizard.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mb: 4 }}>
            {renderStepContent(activeStep)}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Button
              color="inherit"
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<BackIcon />}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            
            <Box sx={{ flex: '1 1 auto' }} />
            
            {activeStep < steps.length - 1 ? (
              <Button 
                variant="contained" 
                onClick={handleNext}
                endIcon={<NextIcon />}
              >
                Next
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<PreviewIcon />}
                >
                  Preview
                </Button>
                <Button 
                  variant="contained" 
                  color="success"
                  startIcon={<SaveIcon />}
                >
                  Create Check
                </Button>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CreateCheckPage;