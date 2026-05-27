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
  Grid,
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
        label: 'Checks Studio',
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
}

const CheckTypeSelector: React.FC<CheckTypeSelectorProps> = ({ selectedType, onSelect }) => {
  const theme = useTheme();
  const sources = useAppSelector(selectSources);

  const isEnabled = (typeValue: string): boolean => {
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

          <Grid container spacing={2}>
            {category.types.map((type) => {
              const Icon = type.icon;
              const enabled = isEnabled(type.value);
              const selected = selectedType === type.value;
              const paletteColor = theme.palette[type.color].main;

              return (
                <Grid
                  item
                  key={type.value}
                  xs={12}
                  sm={category.label === 'UI Testing' ? 12 : 6}
                  md={category.label === 'UI Testing' ? 12 : 4}
                >
                  <Card
                    onClick={enabled ? () => onSelect(type.value) : undefined}
                    sx={{
                      cursor: enabled ? 'pointer' : 'default',
                      opacity: enabled ? 1 : 0.5,
                      transition: 'all 0.2s ease',
                      borderLeft: selected
                        ? `2px solid ${paletteColor}`
                        : `1px solid ${theme.palette.divider}`,
                      borderRight: `1px solid ${selected ? 'transparent' : theme.palette.divider}`,
                      borderTop: `1px solid ${selected ? 'transparent' : theme.palette.divider}`,
                      borderBottom: `1px solid ${selected ? 'transparent' : theme.palette.divider}`,
                      backgroundColor: selected
                        ? alpha(paletteColor, 0.04)
                        : theme.palette.background.paper,
                      boxShadow: selected ? theme.shadows[3] : theme.shadows[0],
                      '&:hover': enabled
                        ? {
                            boxShadow: theme.shadows[2],
                            borderColor: alpha(paletteColor, 0.5),
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

                      {!enabled && (
                        <Chip
                          label="Coming Soon"
                          size="small"
                          variant="outlined"
                          sx={{ mt: 1.5 }}
                        />
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ))}
    </Box>
  );
};

export default CheckTypeSelector;
