import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Avatar,
  Stack,
  Button,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Edit,
  Http,
  Cable,
  ManageSearch,
  ShowChart,
  DesktopWindows,
  Speed,
  SmartDisplay,
} from '@mui/icons-material';
import { checkTypeCategories } from './CheckTypeSelector';
import { formatNextCronRun, parseCron } from '@/utils/cronNextRun';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  formData: any;
  schedule: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
    time?: string;
    cron?: string;
    timezone?: string;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
  };
  csiEntities: Array<{ id: string; name: string }> | null;
  availableUITests: Array<{ id: string; name: string }>;
  editId?: string;
  onEditStep: (step: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getTypeInfo = (typeValue: string) => {
  for (const cat of checkTypeCategories) {
    const found = cat.types.find((t: any) => t.value === typeValue);
    if (found) return found;
  }
  return null;
};

const frequencyLabels: Record<string, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom (cron)',
};

const dayOfWeekLabels: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single label-value row inside the Configuration card */
const ConfigRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <>
    <Grid item xs={5}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Grid>
    <Grid item xs={7}>
      <Typography variant="body2">{value}</Typography>
    </Grid>
  </>
);

// ---------------------------------------------------------------------------
// Configuration renderers (per type)
// ---------------------------------------------------------------------------

const HttpConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <ConfigRow label="Endpoint" value={formData.endpoint || '--'} />
    <ConfigRow label="Method" value={formData.method || 'GET'} />
    <ConfigRow label="Expected Status" value={formData.expectedStatus ?? 200} />
    <ConfigRow label="Timeout" value={`${formData.timeout ?? 30}s`} />
    <ConfigRow
      label="SSL Validation"
      value={formData.validateSSL !== false ? 'Enabled' : 'Disabled'}
    />
    <ConfigRow
      label="Follow Redirects"
      value={formData.followRedirects !== false ? 'Yes' : 'No'}
    />
    <ConfigRow
      label="Headers"
      value={
        formData.headers && Object.keys(formData.headers).length > 0
          ? `${Object.keys(formData.headers).length} header(s)`
          : 'None'
      }
    />
  </Grid>
);

const TcpConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <ConfigRow label="Host" value={formData.host || '--'} />
    <ConfigRow label="Port" value={formData.port ?? 80} />
    <ConfigRow label="Timeout" value={`${formData.timeout ?? 30}s`} />
  </Grid>
);

const SplunkConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <Grid item xs={12}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Query
      </Typography>
      <Paper
        variant="outlined"
        sx={{ p: 1.5, bgcolor: 'grey.50', fontFamily: 'monospace', fontSize: 13 }}
      >
        {formData.splunkQuery || '--'}
      </Paper>
    </Grid>
    <ConfigRow label="Index" value={formData.splunkIndex || 'Default'} />
    <ConfigRow label="Time Range" value={formData.timeRange || '15m'} />
    <ConfigRow
      label="Expected Count"
      value={`${formData.countOperator || '>'} ${formData.expectedCount ?? 0}`}
    />
  </Grid>
);

const GrafanaConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <ConfigRow label="Dashboard" value={formData.grafanaDashboard || '--'} />
    <ConfigRow label="Panel" value={formData.grafanaPanel || '--'} />
    <ConfigRow label="Metric" value={formData.metric || '--'} />
    <ConfigRow
      label="Threshold"
      value={`${formData.thresholdOperator || '>'} ${formData.threshold ?? 0}`}
    />
  </Grid>
);

const ItrsConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <ConfigRow label="Sampler Path" value={formData.itrsSampler || '--'} />
    <ConfigRow label="Expected Status" value={formData.itrsExpectedStatus || 'OK'} />
  </Grid>
);

const AppDynamicsConfigReview: React.FC<{ formData: any }> = ({ formData }) => (
  <Grid container spacing={1}>
    <ConfigRow label="Application" value={formData.appDynamicsApp || '--'} />
    <ConfigRow label="Health Rule" value={formData.healthRule || '--'} />
  </Grid>
);

const UiTestConfigReview: React.FC<{
  formData: any;
  availableUITests: Array<{ id: string; name: string }>;
}> = ({ formData, availableUITests }) => {
  const selectedTest = availableUITests.find(
    (t) => t.id === (formData as any).uiTestId,
  );
  const vars = (formData as any).uiVariables || {};
  const varCount = Object.keys(vars).length;

  return (
    <Grid container spacing={1}>
      <ConfigRow
        label="Studio Test"
        value={selectedTest?.name || (formData as any).uiTestId || 'Not selected'}
      />
      <ConfigRow label="Variables" value={varCount > 0 ? `${varCount} variable(s)` : 'None'} />
      {formData.timeout && (
        <ConfigRow label="Timeout override" value={`${formData.timeout}s`} />
      )}
    </Grid>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReviewStep: React.FC<ReviewStepProps> = ({
  formData,
  schedule,
  csiEntities,
  availableUITests,
  editId,
  onEditStep,
}) => {
  const theme = useTheme();
  const typeInfo = getTypeInfo(formData.checkType);
  const selectedCsi = csiEntities?.find((csi) => csi.id === formData.csiId);

  // Resolve a theme palette color string (e.g. "primary", "success") to actual hex
  const resolveColor = (colorKey: string): string => {
    const palette = theme.palette as any;
    return palette[colorKey]?.main || theme.palette.primary.main;
  };

  const typeColor = typeInfo?.color ? resolveColor(typeInfo.color) : theme.palette.primary.main;

  // Map check types to their review icons
  const typeIconMap: Record<string, React.ReactElement> = {
    HTTP: <Http />,
    TCP: <Cable />,
    SPLUNK: <ManageSearch />,
    GRAFANA: <ShowChart />,
    ITRS: <DesktopWindows />,
    APPDYNAMICS: <Speed />,
    UI_TEST: <SmartDisplay />,
  };

  // Render type-specific configuration
  const renderConfiguration = () => {
    switch (formData.checkType) {
      case 'HTTP':
        return <HttpConfigReview formData={formData} />;
      case 'TCP':
        return <TcpConfigReview formData={formData} />;
      case 'SPLUNK':
        return <SplunkConfigReview formData={formData} />;
      case 'GRAFANA':
        return <GrafanaConfigReview formData={formData} />;
      case 'ITRS':
        return <ItrsConfigReview formData={formData} />;
      case 'APPDYNAMICS':
        return <AppDynamicsConfigReview formData={formData} />;
      case 'UI_TEST':
        return (
          <UiTestConfigReview
            formData={formData}
            availableUITests={availableUITests}
          />
        );
      default:
        return (
          <Typography variant="body2" color="text.secondary">
            No configuration to display.
          </Typography>
        );
    }
  };

  // Compute next-run label (simplified)
  const nextRunLabel = (() => {
    if (!schedule.enabled) return 'Disabled';
    const now = new Date();
    if (schedule.frequency === 'hourly') {
      const d = new Date(now);
      d.setHours(d.getHours() + 1, 0, 0, 0);
      return d.toLocaleString();
    }
    if (schedule.frequency === 'daily' && schedule.time) {
      const [h, m] = schedule.time.split(':').map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d.toLocaleString();
    }
    if (schedule.frequency === 'custom' && schedule.cron) {
      return parseCron(schedule.cron) ? formatNextCronRun(schedule.cron) : `Cron: ${schedule.cron}`;
    }
    return frequencyLabels[schedule.frequency] || '--';
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero Card                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderTop: `4px solid ${typeColor}`,
          bgcolor: alpha(typeColor, 0.03),
          position: 'relative',
        }}
      >
        {/* Edit button */}
        <Button
          size="small"
          startIcon={<Edit fontSize="small" />}
          onClick={() => onEditStep(0)}
          sx={{ position: 'absolute', top: 12, right: 12 }}
        >
          Edit
        </Button>

        <Stack direction="row" spacing={2.5} alignItems="flex-start">
          {/* Type icon */}
          <Avatar
            sx={{
              bgcolor: typeColor,
              width: 48,
              height: 48,
              flexShrink: 0,
            }}
          >
            {typeIconMap[formData.checkType] || <Http />}
          </Avatar>

          {/* Text block */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              {formData.name || 'Untitled Check'}
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              sx={{ mb: 1 }}
            >
              {/* Type chip */}
              {typeInfo && (
                <Chip
                  label={typeInfo.label}
                  size="small"
                  icon={typeIconMap[formData.checkType]
                    ? React.cloneElement(typeIconMap[formData.checkType], { fontSize: 'small' })
                    : undefined}
                  sx={{
                    bgcolor: alpha(typeColor, 0.12),
                    color: typeColor,
                    fontWeight: 600,
                  }}
                />
              )}

              {/* CSI entity text */}
              {selectedCsi && (
                <Typography variant="body2" color="text.secondary">
                  {selectedCsi.id} - {selectedCsi.name}
                </Typography>
              )}

              {/* Environment chip */}
              {formData.environment && (
                <Chip
                  label={formData.environment}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>

            {/* Description */}
            {formData.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formData.description}
              </Typography>
            )}

            {/* Tags */}
            {formData.tags && formData.tags.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {formData.tags.map((tag: string) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 12 }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Paper>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Configuration Card                                               */}
      {/* ------------------------------------------------------------------ */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Configuration
          </Typography>
          <Button
            size="small"
            startIcon={<Edit fontSize="small" />}
            onClick={() => onEditStep(1)}
          >
            Edit
          </Button>
        </Stack>

        {renderConfiguration()}
      </Paper>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Schedule Card                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderLeft: `4px solid ${theme.palette.warning.main}`,
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Schedule
          </Typography>
          <Button
            size="small"
            startIcon={<Edit fontSize="small" />}
            onClick={() => onEditStep(2)}
          >
            Edit
          </Button>
        </Stack>

        {/* Schedule info */}
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <ConfigRow
            label="Frequency"
            value={frequencyLabels[schedule.frequency] || schedule.frequency}
          />
          <ConfigRow
            label="Enabled"
            value={schedule.enabled ? 'Yes' : 'No'}
          />
          {schedule.time && schedule.frequency !== 'hourly' && schedule.frequency !== 'custom' && (
            <ConfigRow label="Time" value={schedule.time} />
          )}
          {schedule.frequency === 'weekly' &&
            schedule.daysOfWeek &&
            schedule.daysOfWeek.length > 0 && (
              <ConfigRow
                label="Days"
                value={schedule.daysOfWeek
                  .map((d) => dayOfWeekLabels[d] || d)
                  .join(', ')}
              />
            )}
          {schedule.frequency === 'monthly' &&
            schedule.daysOfMonth &&
            schedule.daysOfMonth.length > 0 && (
              <ConfigRow
                label="Days of Month"
                value={schedule.daysOfMonth.join(', ')}
              />
            )}
          {schedule.frequency === 'custom' && schedule.cron && (
            <ConfigRow label="Cron" value={schedule.cron} />
          )}
          {schedule.timezone && (
            <ConfigRow label="Timezone" value={schedule.timezone} />
          )}
        </Grid>

        {/* Next run info alert */}
        <Alert severity="info" sx={{ mt: 1 }}>
          <Typography variant="body2">
            <strong>Next run:</strong> {nextRunLabel}
          </Typography>
        </Alert>
      </Paper>
    </Stack>
  );
};

export default ReviewStep;
