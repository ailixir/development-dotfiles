import React, { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Fade,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  ManageSearch,
  NavigateBefore,
  NavigateNext,
  OpenInNew,
  PlayArrow,
  RestartAlt,
  Save,
} from '@mui/icons-material';
import SplunkPrototypeConfig from './SplunkPrototypeConfig';
import ResultTable from './ResultTable';
import { describeCondition, deriveFacts, evaluate, isConfigValid, runAndEvaluate, runQuery } from './evaluatePreview';
import {
  DEFAULT_FORM,
  ENVIRONMENTS,
  PROTOTYPE_CSIS,
  type Evaluation,
  type QueryResult,
  type SplunkCapability,
  type SplunkPrototypeForm,
} from './types';

const STEPS = ['Basic information', 'Configuration', 'Review'];

const SplunkPrototypePage: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<SplunkPrototypeForm>(DEFAULT_FORM);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [lastRunQuery, setLastRunQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [created, setCreated] = useState<{ form: SplunkPrototypeForm; evaluation: Evaluation } | null>(
    null,
  );

  // Re-evaluated on every edit so the table marks breaches without re-running the query.
  const evaluation = useMemo(() => (result ? evaluate(form, result) : null), [form, result]);

  const selectedCsi = PROTOTYPE_CSIS.find((csi) => csi.id === form.csiId) ?? null;
  const csiLabel = selectedCsi ? `${selectedCsi.id} — ${selectedCsi.name}` : form.csiId;
  const step0Valid = Boolean(form.name.trim() && form.csiId);
  const step1Valid = isConfigValid(form);

  const onPatch = (patch: Partial<SplunkPrototypeForm>) => {
    if (patch.capability && patch.capability !== form.capability) {
      setResult(null);
      setLastRunQuery('');
    }
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const runCurrentQuery = () => {
    const capability: SplunkCapability = form.capability === 'METRICS' ? 'METRICS' : 'LOGS';
    setRunning(true);
    window.setTimeout(() => {
      setResult(runQuery(form.query, capability));
      setLastRunQuery(form.query);
      setRunning(false);
    }, 450);
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setResult(null);
    setLastRunQuery('');
    setCreated(null);
    setActiveStep(0);
  };

  if (created) {
    return (
      <Box>
        <PrototypeHeader />
        <ResultView
          form={created.form}
          evaluation={created.evaluation}
          csiLabel={csiLabel}
          onReset={handleReset}
        />
      </Box>
    );
  }

  return (
    <Box>
      <PrototypeHeader />

      <Card>
        <CardContent>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Fade in key={activeStep} timeout={200}>
            <Box sx={{ mb: 3 }}>
              {activeStep === 0 && (
                <BasicStep form={form} onPatch={onPatch} selectedCsi={selectedCsi} />
              )}
              {activeStep === 1 && (
                <SplunkPrototypeConfig
                  form={form}
                  onPatch={onPatch}
                  result={result}
                  evaluation={evaluation}
                  running={running}
                  queryDirty={Boolean(result) && form.query !== lastRunQuery}
                  onRun={runCurrentQuery}
                />
              )}
              {activeStep === 2 && (
                <ReviewView form={form} evaluation={evaluation} csiLabel={csiLabel} />
              )}
              {activeStep === 0 && !step0Valid && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Name and CSI are required.
                </Alert>
              )}
              {activeStep === 1 && form.capability && !step1Valid && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {form.capability === 'METRICS'
                    ? 'Run the query and add at least one threshold.'
                    : 'An SPL query is required.'}
                </Alert>
              )}
            </Box>
          </Fade>

          <Box sx={{ display: 'flex', pt: 1 }}>
            <Button
              color="inherit"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((step) => step - 1)}
              startIcon={<NavigateBefore />}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            <Box sx={{ flex: '1 1 auto' }} />
            {activeStep < STEPS.length - 1 ? (
              <Button
                variant="contained"
                onClick={() => setActiveStep((step) => step + 1)}
                endIcon={<NavigateNext />}
                disabled={(activeStep === 0 && !step0Valid) || (activeStep === 1 && !step1Valid)}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                color="success"
                startIcon={<Save />}
                onClick={() => setCreated({ form, evaluation: evaluation ?? runAndEvaluate(form) })}
                disabled={!step0Valid || !step1Valid}
              >
                Create check (offline)
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

const PrototypeHeader: React.FC = () => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
      Splunk check prototype
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      One Splunk type, one SPL query, two modes. Nothing is sent to the backend.
    </Typography>
    <Alert severity="info">
      <AlertTitle>Offline prototype</AlertTitle>
      Run the query, then build the pass condition from the table it returns. Index, time window and
      grouping are read from the SPL — never asked twice.
    </Alert>
  </Box>
);

const BasicStep: React.FC<{
  form: SplunkPrototypeForm;
  onPatch: (patch: Partial<SplunkPrototypeForm>) => void;
  selectedCsi: { id: string; name: string } | null;
}> = ({ form, onPatch, selectedCsi }) => {
  const theme = useTheme();
  const color = theme.palette.success.main;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        What are you monitoring?
      </Typography>
      <Typography variant="overline" color="text.secondary">
        Integrations
      </Typography>
      <Divider sx={{ mb: 2 }} />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card
            sx={{
              borderLeft: `2px solid ${color}`,
              backgroundColor: alpha(color, 0.04),
              boxShadow: theme.shadows[3],
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ width: 48, height: 48, bgcolor: color, color: '#fff', mx: 'auto', mb: 2 }}>
                <ManageSearch />
              </Avatar>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Splunk
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Run an SPL query against logs or metrics
              </Typography>
              <Chip label="Selected" size="small" color="success" sx={{ mt: 1.5 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Basic information
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            required
            label="Check name"
            value={form.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="e.g., Trade CPU health"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Description"
            value={form.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="What this check proves for the CSI"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Autocomplete
            fullWidth
            options={PROTOTYPE_CSIS}
            getOptionLabel={(option) => `${option.id} — ${option.name}`}
            value={selectedCsi}
            onChange={(_, value) => onPatch({ csiId: value?.id || '' })}
            renderInput={(params) => <TextField {...params} label="CSI entity" required />}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth required>
            <InputLabel>Environment</InputLabel>
            <Select
              value={form.environment}
              label="Environment"
              onChange={(e) => onPatch({ environment: e.target.value })}
            >
              {ENVIRONMENTS.map((env) => (
                <MenuItem key={env} value={env}>
                  {env}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </Box>
  );
};

const ReviewView: React.FC<{
  form: SplunkPrototypeForm;
  evaluation: Evaluation | null;
  csiLabel: string;
}> = ({ form, evaluation, csiLabel }) => {
  const theme = useTheme();
  const isMetrics = form.capability === 'METRICS';
  const color = isMetrics ? theme.palette.info.main : theme.palette.success.main;
  const rowCount = evaluation?.result.rows.length ?? 0;
  const condition = useMemo(() => describeCondition(form, rowCount), [form, rowCount]);
  const facts = deriveFacts(form.query);

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{ p: 3, borderTop: `4px solid ${color}`, bgcolor: alpha(color, 0.03) }}
      >
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar sx={{ bgcolor: color }}>
            <ManageSearch />
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {form.name || 'Untitled check'}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" label="Splunk" />
              <Chip
                size="small"
                color={isMetrics ? 'info' : 'success'}
                label={isMetrics ? 'Metrics' : 'Logs'}
              />
              <Chip size="small" variant="outlined" label={form.environment} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {csiLabel}
            </Typography>
            {form.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {form.description}
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          SPL query
        </Typography>
        <Paper
          variant="outlined"
          sx={{ p: 1.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}
        >
          {form.query || '—'}
        </Paper>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2.5, mb: 0.5 }}>
          Pass condition
        </Typography>
        <Typography variant="body1">{condition}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {[
            facts.index ? `index ${facts.index}` : null,
            facts.window ? `last ${facts.window}` : null,
            facts.byField ? `grouped by ${facts.byField}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'No index or window found in the query.'}
        </Typography>
      </Paper>
    </Stack>
  );
};

const ResultView: React.FC<{
  form: SplunkPrototypeForm;
  evaluation: Evaluation;
  csiLabel: string;
  onReset: () => void;
}> = ({ form, evaluation, csiLabel, onReset }) => (
  <Stack spacing={2}>
    <Alert severity="success">
      Check created locally. This is the investigation view after a run — still offline.
    </Alert>
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {form.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {csiLabel} · {form.environment}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip label="Splunk" />
          <Chip
            color={evaluation.kind === 'METRICS' ? 'info' : 'success'}
            label={evaluation.kind === 'METRICS' ? 'Metrics' : 'Logs'}
          />
          <Chip
            color={evaluation.passed ? 'success' : 'error'}
            label={evaluation.passed ? 'PASS' : 'FAIL'}
          />
        </Stack>
      </Stack>

      <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {evaluation.condition}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {evaluation.kind === 'LOGS'
          ? `${evaluation.actualCount} rows returned.`
          : evaluation.failingLabels.length > 0 && evaluation.rowScope === 'every'
            ? `Breaching: ${evaluation.failingLabels.join(', ')}.`
            : `${evaluation.verdicts.filter((v) => v.satisfied).length} of ${evaluation.verdicts.length} rows satisfy the condition.`}
      </Typography>

      <ResultTable
        result={evaluation.result}
        rules={form.rules}
        verdicts={evaluation.kind === 'METRICS' ? evaluation.verdicts : []}
        rowScope={form.rowScope}
      />

      <Paper
        variant="outlined"
        sx={{ p: 1.5, mt: 2, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}
      >
        {evaluation.result.query}
      </Paper>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
        <Tooltip title="Prototype — this would open the Splunk search from the DC deep link.">
          <span>
            <Button startIcon={<OpenInNew />} disabled>
              Open in Splunk
            </Button>
          </span>
        </Tooltip>
        <Button startIcon={<PlayArrow />} disabled>
          Run again
        </Button>
        <Button startIcon={<RestartAlt />} onClick={onReset}>
          Create another
        </Button>
        <Button component={RouterLink} to="/checks/create">
          Back to create check
        </Button>
      </Stack>
    </Paper>
  </Stack>
);

export default SplunkPrototypePage;
