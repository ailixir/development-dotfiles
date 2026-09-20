import {
  Add,
  Close,
  ManageSearch,
  OpenInNew,
  PlayArrow,
  ShowChart,
  TableRows,
} from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import React from 'react';
import { applyExample, columnRange, deriveFacts, seedRule, seedThreshold } from './evaluatePreview';
import ResultTable from './ResultTable';
import {
  OPERATORS,
  QUERY_EXAMPLES,
  type CompareOperator,
  type Evaluation,
  type MetricRule,
  type QueryResult,
  type SplunkCapability,
  type SplunkPrototypeForm,
} from './types';

const CAPABILITY_HINT: Record<SplunkCapability, string> = {
  LOGS: 'The rows the query returns are events. The check compares how many came back.',
  METRICS: 'The rows the query returns are measurements. Thresholds are built from its columns.',
};

interface SplunkPrototypeConfigProps {
  form: SplunkPrototypeForm;
  onPatch: (patch: Partial<SplunkPrototypeForm>) => void;
  result: QueryResult | null;
  evaluation: Evaluation | null;
  running: boolean;
  queryDirty: boolean;
  onRun: () => void;
}

const SplunkPrototypeConfig: React.FC<SplunkPrototypeConfigProps> = ({
  form,
  onPatch,
  result,
  evaluation,
  running,
  queryDirty,
  onRun,
}) => {
  const capability = form.capability;

  const addRule = (column: string) => {
    if (!result) return;
    onPatch({ rules: [...form.rules, seedRule(result, column, form.rules)] });
  };

  const updateRule = (id: string, patch: Partial<MetricRule>) => {
    onPatch({
      rules: form.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  };

  const removeRule = (id: string) => {
    onPatch({ rules: form.rules.filter((rule) => rule.id !== id) });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          Splunk configuration
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The SPL query is the check. Run it once, then build the condition from what it returns.
        </Typography>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Mode
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={capability || null}
          onChange={(_, value: SplunkCapability | null) =>
            value && onPatch({ capability: value, rules: [] })
          }
        >
          <ToggleButton value="LOGS" sx={{ px: 2.5, gap: 1 }}>
            <ManageSearch fontSize="small" />
            Logs
          </ToggleButton>
          <ToggleButton value="METRICS" sx={{ px: 2.5, gap: 1 }}>
            <ShowChart fontSize="small" />
            Metrics
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {capability ? CAPABILITY_HINT[capability] : 'Pick how this query should be evaluated.'}
        </Typography>
      </Box>

      {capability && (
        <>
          <Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                SPL query
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {QUERY_EXAMPLES[capability].map((example) => (
                  <Chip
                    key={example.label}
                    size="small"
                    variant="outlined"
                    label={example.label}
                    onClick={() => onPatch(applyExample(capability, example))}
                  />
                ))}
              </Stack>
            </Stack>
            <TextField
              fullWidth
              required
              multiline
              minRows={4}
              label="SPL query"
              value={form.query}
              onChange={(e) => onPatch({ query: e.target.value })}
              placeholder={
                capability === 'METRICS'
                  ? '| mstats avg(cpu_pct) WHERE index=em_metrics env=prod span=1m BY host earliest=-15m'
                  : 'search index=app ERROR OR exception earliest=-15m'
              }
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
            />
            <FactStrip query={form.query} result={queryDirty ? null : result} />
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={onRun}
              disabled={running || !form.query.trim()}
            >
              {result ? 'Run again' : 'Run query'}
            </Button>
            {queryDirty && result && (
              <Typography variant="caption" color="warning.main">
                Query changed — run again to refresh the columns below.
              </Typography>
            )}
            {!result && (
              <Typography variant="caption" color="text.secondary">
                Offline mock — the table is derived from the query text.
              </Typography>
            )}
          </Stack>

          {!result ? (
            <EmptyState capability={capability} />
          ) : (
            <>
              {capability === 'LOGS' ? (
                <LogsCondition form={form} onPatch={onPatch} />
              ) : (
                <MetricsConditions
                  form={form}
                  result={result}
                  evaluation={evaluation}
                  onPatch={onPatch}
                  onAddRule={addRule}
                  onUpdateRule={updateRule}
                  onRemoveRule={removeRule}
                />
              )}
              {evaluation && <VerdictBar evaluation={evaluation} />}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {capability === 'LOGS' ? 'Events returned' : 'Rows returned'}
                </Typography>
                <ResultTable
                  result={result}
                  rules={form.rules}
                  verdicts={evaluation?.kind === 'METRICS' ? evaluation.verdicts : []}
                  rowScope={form.rowScope}
                  onAddRule={capability === 'METRICS' ? addRule : undefined}
                />
                <Tooltip title="Prototype — this would open the Splunk search from the DC deep link.">
                  <span>
                    <Button size="small" startIcon={<OpenInNew />} disabled sx={{ mt: 1 }}>
                      Open in Splunk
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </>
          )}
        </>
      )}
    </Stack>
  );
};

const FactStrip: React.FC<{ query: string; result: QueryResult | null }> = ({ query, result }) => {
  const facts = deriveFacts(query);
  const items: string[] = [];
  if (facts.index) items.push(`index ${facts.index}`);
  if (facts.window) items.push(`last ${facts.window}`);
  if (facts.byField) items.push(`grouped by ${facts.byField}`);
  if (result) {
    items.push(`${result.rows.length} rows`);
    if (result.capability === 'METRICS') items.push(`${result.numericColumns.length} metrics`);
  }
  if (items.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Read from the query:
      </Typography>
      {items.map((item) => (
        <Typography
          key={item}
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace' }}
        >
          {item}
        </Typography>
      ))}
    </Stack>
  );
};

const EmptyState: React.FC<{ capability: SplunkCapability }> = ({ capability }) => (
  <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
    <TableRows sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
    <Typography variant="body2" color="text.secondary">
      {capability === 'METRICS'
        ? 'Run the query to see its columns. Thresholds are built from the table it returns.'
        : 'Run the query to see the events it returns, then set the expected count.'}
    </Typography>
  </Paper>
);

export const VerdictBar: React.FC<{ evaluation: Evaluation }> = ({ evaluation }) => {
  const theme = useTheme();
  const noCondition = evaluation.kind === 'METRICS' && evaluation.issue === 'NO_RULES';
  const color = noCondition
    ? theme.palette.text.disabled
    : evaluation.passed
      ? theme.palette.success.main
      : theme.palette.error.main;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderLeft: `4px solid ${color}`, bgcolor: alpha(color, 0.04) }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {!noCondition && (
          <Chip
            size="small"
            label={evaluation.passed ? 'PASS' : 'FAIL'}
            color={evaluation.passed ? 'success' : 'error'}
          />
        )}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {evaluation.condition}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {explainOutcome(evaluation)}
      </Typography>
      {evaluation.kind === 'METRICS' && evaluation.staleColumns.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {evaluation.staleColumns.join(', ')} is no longer returned by this query.
        </Alert>
      )}
    </Paper>
  );
};

function explainOutcome(evaluation: Evaluation): string {
  if (evaluation.kind === 'LOGS') {
    return `${evaluation.actualCount} rows returned.`;
  }
  switch (evaluation.issue) {
    case 'NO_NUMERIC_COLUMNS':
      return 'This query returns no numeric columns — Logs mode may be the right fit.';
    case 'NO_ROWS':
      return 'The query returned 0 rows, so there is nothing to compare.';
    case 'NO_RULES':
      return 'Pick a metric below to threshold on.';
    default:
      break;
  }
  if (evaluation.rowScope === 'any' && evaluation.verdicts.length > 1) {
    const satisfying = evaluation.verdicts.filter((v) => v.satisfied).map((v) => v.label);
    return satisfying.length === 0
      ? 'No row satisfies the condition.'
      : `Satisfied by: ${satisfying.join(', ')}.`;
  }
  if (evaluation.failingLabels.length === 0) {
    return `All ${evaluation.verdicts.length} rows satisfy the condition.`;
  }
  return `Breaching: ${evaluation.failingLabels.join(', ')}.`;
}

const LogsCondition: React.FC<{
  form: SplunkPrototypeForm;
  onPatch: (patch: Partial<SplunkPrototypeForm>) => void;
}> = ({ form, onPatch }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
      Pass condition
    </Typography>
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="body2">PASS if</Typography>
      <Chip size="small" label="row count" sx={{ fontFamily: 'monospace' }} />
      <Select
        size="small"
        value={form.countOperator}
        onChange={(e) => onPatch({ countOperator: e.target.value as CompareOperator })}
        inputProps={{ 'aria-label': 'Count operator' }}
      >
        {OPERATORS.map((op) => (
          <MenuItem key={op} value={op}>
            {op}
          </MenuItem>
        ))}
      </Select>
      <TextField
        size="small"
        type="number"
        value={form.expectedCount}
        onChange={(e) => onPatch({ expectedCount: Number(e.target.value) })}
        inputProps={{ min: 0, 'aria-label': 'Expected count' }}
        sx={{ width: 100 }}
      />
    </Stack>
  </Paper>
);

const ColumnHint: React.FC<{ result: QueryResult; column: string }> = ({ result, column }) => {
  const range = columnRange(result, column);
  if (!range) {
    return (
      <Typography variant="caption" color="warning.main">
        not in this result
      </Typography>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
      observed {range.min} – {range.max}
    </Typography>
  );
};

const MetricsConditions: React.FC<{
  form: SplunkPrototypeForm;
  result: QueryResult;
  evaluation: Evaluation | null;
  onPatch: (patch: Partial<SplunkPrototypeForm>) => void;
  onAddRule: (column: string) => void;
  onUpdateRule: (id: string, patch: Partial<MetricRule>) => void;
  onRemoveRule: (id: string) => void;
}> = ({ form, result, onPatch, onAddRule, onUpdateRule, onRemoveRule }) => {
  const multiRow = result.rows.length > 1;
  const noNumeric = result.numericColumns.length === 0;

  if (noNumeric) {
    return (
      <Alert
        severity="warning"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => onPatch({ capability: 'LOGS', rules: [] })}
          >
            Switch to Logs
          </Button>
        }
      >
        This query returns no numeric columns to threshold on.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Pass condition
        </Typography>
        {multiRow && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={form.rowScope}
            onChange={(_, value) => value && onPatch({ rowScope: value })}
          >
            <ToggleButton value="every" sx={{ px: 1.5, textTransform: 'none' }}>
              every row
            </ToggleButton>
            <ToggleButton value="any" sx={{ px: 1.5, textTransform: 'none' }}>
              any row
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {form.rules.length > 0 && (
        <Stack spacing={1}>
          {form.rules.map((rule, index) => (
            <Stack
              key={rule.id}
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              {index === 0 ? (
                <Typography variant="body2" sx={{ minWidth: 44 }}>
                  PASS if
                </Typography>
              ) : (
                <Tooltip describeChild title="Click to switch between and / or">
                  <Button
                    size="small"
                    onClick={() => onPatch({ match: form.match === 'all' ? 'any' : 'all' })}
                    sx={{ minWidth: 44, textTransform: 'none' }}
                  >
                    {form.match === 'all' ? 'and' : 'or'}
                  </Button>
                </Tooltip>
              )}
              <Autocomplete
                freeSolo
                openOnFocus
                disableClearable
                forcePopupIcon
                size="small"
                options={result.numericColumns}
                value={rule.column}
                onChange={(_, value) =>
                  // Picking a known metric re-seeds the number, which only means something next to it.
                  onUpdateRule(rule.id, {
                    column: String(value),
                    value: seedThreshold(result, String(value)),
                  })
                }
                onInputChange={(_, value, reason) =>
                  reason === 'input' && onUpdateRule(rule.id, { column: value })
                }
                sx={{ minWidth: 200 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputProps={{
                      ...params.inputProps,
                      'aria-label': `Metric for condition ${index + 1}`,
                      style: { fontFamily: 'monospace', fontSize: 13 },
                    }}
                  />
                )}
              />
              <Select
                size="small"
                value={rule.operator}
                onChange={(e) => onUpdateRule(rule.id, { operator: e.target.value as CompareOperator })}
                inputProps={{ 'aria-label': `Operator for condition ${index + 1}` }}
              >
                {OPERATORS.map((op) => (
                  <MenuItem key={op} value={op}>
                    {op}
                  </MenuItem>
                ))}
              </Select>
              <TextField
                size="small"
                type="number"
                value={rule.value}
                onChange={(e) => onUpdateRule(rule.id, { value: Number(e.target.value) })}
                inputProps={{ step: 0.1, 'aria-label': `Threshold for ${rule.column}` }}
                sx={{ width: 110 }}
              />
              <ColumnHint result={result} column={rule.column} />
              <IconButton
                size="small"
                aria-label={`Remove threshold on ${rule.column}`}
                onClick={() => onRemoveRule(rule.id)}
              >
                <Close fontSize="inherit" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mt: form.rules.length > 0 ? 2 : 0 }}
      >
        <Typography variant="body2" color="text.secondary">
          {form.rules.length === 0 ? 'Threshold a metric:' : 'Add another:'}
        </Typography>
        {result.numericColumns.map((column) => (
          <Chip
            key={column}
            icon={<Add fontSize="small" />}
            label={column}
            variant="outlined"
            color="primary"
            onClick={() => onAddRule(column)}
            sx={{ fontFamily: 'monospace' }}
          />
        ))}
      </Stack>
    </Paper>
  );
};

export default SplunkPrototypeConfig;
