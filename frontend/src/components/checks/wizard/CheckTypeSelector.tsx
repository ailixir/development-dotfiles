import React from 'react';
import {
  Http,
  Cable,
  ManageSearch,
  ShowChart,
  DesktopWindows,
  Speed,
  SmartDisplay,
  LockOutlined,
} from '@mui/icons-material';
import {
  Card,
  CardContent,
  Typography,
  Avatar,
  Chip,
  Divider,
  Box,
  useTheme,
  alpha,
} from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import { useAppSelector } from '@/store/index';
import { selectSources } from '@/store/slices/sourcesSlice';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';

interface CheckType {
  value: string;
  label: string;
  description: string;
  icon: SvgIconComponent;
  color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';
}

interface CheckTypeCategory {
  label: string;
  types: CheckType[];
}

export const checkTypeCategories: CheckTypeCategory[] = [
  {
    label: 'Basic',
    types: [
      {
        value: 'HTTP',
        label: 'HTTP/HTTPS Check',
        description: 'Monitor HTTP/HTTPS endpoints for availability and response validation',
        icon: Http,
        color: 'primary',
      },
      {
        value: 'TCP',
        label: 'TCP Port Check',
        description: 'Verify TCP port connectivity and basic network health',
        icon: Cable,
        color: 'secondary',
      },
    ],
  },
  {
    label: 'Integrations',
    types: [
      {
        value: 'SPLUNK',
        label: 'Splunk Query',
        description: 'Execute Splunk searches for log-based health validation',
        icon: ManageSearch,
        color: 'success',
      },
      {
        value: 'GRAFANA',
        label: 'Grafana Metrics',
        description: 'Monitor Grafana dashboards and metric thresholds',
        icon: ShowChart,
        color: 'info',
      },
      {
        value: 'ITRS',
        label: 'ITRS Geneos',
        description: 'Check ITRS sampler status and infrastructure monitoring',
        icon: DesktopWindows,
        color: 'warning',
      },
      {
        value: 'APPDYNAMICS',
        label: 'AppDynamics APM',
        description: 'Validate AppDynamics health rules and performance metrics',
        icon: Speed,
        color: 'error',
      },
    ],
  },
  {
    label: 'UI Testing',
    types: [
      {
        value: 'UI_TEST',
        label: 'UI Test (Checks Studio)',
        description:
          'No-code browser automation with plain English commands — the flagship testing experience',
        icon: SmartDisplay,
        color: 'primary',
      },
    ],
  },
];

interface CheckTypeSelectorProps {
  selectedType: string;
  onSelect: (value: string) => void;
  /** Types the card list shows dimmed and refuses to select (the edit page passes UI_TEST). */
  disabledTypes?: readonly string[];
}

const NO_DISABLED_TYPES: readonly string[] = [];

const CheckTypeSelector: React.FC<CheckTypeSelectorProps> = ({
  selectedType,
  onSelect,
  disabledTypes = NO_DISABLED_TYPES,
}) => {
  const theme = useTheme();
  const sources = useAppSelector(selectSources);
  const uiTestAvailability = useUiTestAvailability();

  const isEnabled = (typeValue: string): boolean => {
    if (disabledTypes.includes(typeValue)) return false;
    // UI Test is selectable only once both the UI_TEST source and the STUDIO feature are known to be on (DC-18).
    if (typeValue === 'UI_TEST') return uiTestAvailability === 'on';
    // Fail-open: if sources array is empty, treat all as enabled
    if (sources.length === 0) return true;
    const source = sources.find((s) => s.type === typeValue);
    return source ? source.enabled : true;
  };

  return (
    <Box>
      {checkTypeCategories.map((category) => (
        <Box key={category.label} sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary">
            {category.label}
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {/*
            * A CSS grid, two columns from `sm`: Basic and Integrations (2 + 4) fill their rows, UI Test is the
            * same width as its siblings, and `1fr` rows make every card in a group one height.
            */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
              gridAutoRows: '1fr',
            }}
          >
            {category.types.map((type) => {
              const Icon = type.icon;
              const enabled = isEnabled(type.value);
              const selected = selectedType === type.value;
              const paletteColor = theme.palette[type.color].main;

              return (
                <Card
                  key={type.value}
                  onClick={enabled ? () => onSelect(type.value) : undefined}
                  sx={{
                    height: '100%',
                    cursor: enabled ? 'pointer' : 'default',
                    opacity: enabled ? 1 : 0.5,
                    transition: 'all 0.2s ease',
                    border: `1px solid ${selected ? paletteColor : theme.palette.divider}`,
                    backgroundColor: selected
                      ? alpha(paletteColor, 0.04)
                      : theme.palette.background.paper,
                    boxShadow: selected ? theme.shadows[3] : theme.shadows[0],
                    '&:hover': enabled
                      ? {
                          boxShadow: theme.shadows[2],
                          borderColor: selected ? paletteColor : alpha(paletteColor, 0.5),
                        }
                      : undefined,
                  }}
                >
                  <CardContent
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      py: 3,
                    }}
                  >
                    <Box sx={{ position: 'relative', mb: 2 }}>
                      <Avatar
                        sx={{
                          width: 48,
                          height: 48,
                          bgcolor: paletteColor,
                          color: '#fff',
                        }}
                      >
                        <Icon />
                      </Avatar>
                      {!enabled && (
                        <Avatar
                          sx={{
                            width: 48,
                            height: 48,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bgcolor: alpha(theme.palette.common.black, 0.5),
                            color: '#fff',
                          }}
                        >
                          <LockOutlined />
                        </Avatar>
                      )}
                    </Box>

                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {type.label}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {type.description}
                    </Typography>

                    {!enabled
                      && !disabledTypes.includes(type.value)
                      && !(type.value === 'UI_TEST' && uiTestAvailability === 'pending') && (
                      <Chip
                        label="Coming Soon"
                        size="small"
                        variant="outlined"
                        sx={{ mt: 1.5 }}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default CheckTypeSelector;
