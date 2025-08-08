import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Stack,
  Box,
  Alert,
  Chip,
  Switch,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Schedule,
  Info,
  PlayArrow,
  Pause,
} from '@mui/icons-material';
import { CheckEntity } from '../../types/checks/checkTypes';
import { useAppDispatch } from '@store/index';
import { updateCheckSchedule } from '@store/slices/checksSlice';

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  check: CheckEntity | null;
}

const FREQUENCY_OPTIONS = [
  { value: 'EVERY_MINUTE', label: 'Every minute', description: 'High frequency monitoring' },
  { value: 'EVERY_5_MINUTES', label: 'Every 5 minutes', description: 'Standard monitoring' },
  { value: 'EVERY_15_MINUTES', label: 'Every 15 minutes', description: 'Regular checks' },
  { value: 'EVERY_30_MINUTES', label: 'Every 30 minutes', description: 'Moderate monitoring' },
  { value: 'HOURLY', label: 'Every hour', description: 'Periodic checks' },
  { value: 'EVERY_6_HOURS', label: 'Every 6 hours', description: 'Low frequency' },
  { value: 'DAILY', label: 'Daily at midnight', description: 'Daily maintenance' },
  { value: 'CUSTOM', label: 'Custom cron expression', description: 'Advanced scheduling' },
];

const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ open, onClose, check }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState('EVERY_5_MINUTES');
  const [cronExpression, setCronExpression] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (check?.schedule) {
      setEnabled(check.schedule.enabled);
      setFrequency(check.schedule.frequency || 'EVERY_5_MINUTES');
      setCronExpression(check.schedule.cron || '');
    }
  }, [check]);

  const handleSave = async () => {
    if (!check) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const scheduleData = {
        enabled,
        frequency: frequency !== 'CUSTOM' ? frequency : undefined,
        cron: frequency === 'CUSTOM' ? cronExpression : undefined,
      };
      
      await dispatch(updateCheckSchedule({ id: check.id, schedule: scheduleData })).unwrap();
      onClose();
    } catch (err) {
      setError('Failed to update schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getNextExecutionPreview = (): string => {
    if (!enabled) return 'Check is disabled';
    
    const now = new Date();
    let nextExecution: Date;
    
    switch (frequency) {
      case 'EVERY_MINUTE':
        nextExecution = new Date(now.getTime() + 60 * 1000);
        break;
      case 'EVERY_5_MINUTES':
        nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
        break;
      case 'EVERY_15_MINUTES':
        nextExecution = new Date(now.getTime() + 15 * 60 * 1000);
        break;
      case 'EVERY_30_MINUTES':
        nextExecution = new Date(now.getTime() + 30 * 60 * 1000);
        break;
      case 'HOURLY':
        nextExecution = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'EVERY_6_HOURS':
        nextExecution = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        break;
      case 'DAILY':
        nextExecution = new Date(now);
        nextExecution.setDate(nextExecution.getDate() + 1);
        nextExecution.setHours(0, 0, 0, 0);
        break;
      case 'CUSTOM':
        return cronExpression ? `Custom: ${cronExpression}` : 'Custom expression required';
      default:
        nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
    }
    
    return `Next run: ${nextExecution.toLocaleString()}`;
  };

  const validateCronExpression = (expression: string): boolean => {
    if (!expression.trim()) return false;
    // Basic validation - should have 5 or 6 parts
    const parts = expression.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  };

  if (!check) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Schedule color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Schedule Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {check.name}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Enable/Disable Toggle */}
          <Box 
            sx={{ 
              p: 2, 
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.02)
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  Schedule Status
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {enabled ? 'Check will run automatically' : 'Check is paused'}
                </Typography>
              </Box>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Chip
                  icon={enabled ? <PlayArrow /> : <Pause />}
                  label={enabled ? 'Enabled' : 'Disabled'}
                  color={enabled ? 'success' : 'default'}
                />
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  color="primary"
                />
              </Stack>
            </Stack>
          </Box>

          {/* Frequency Selection */}
          <FormControl component="fieldset" disabled={!enabled}>
            <FormLabel component="legend" sx={{ mb: 2, fontWeight: 600 }}>
              Execution Frequency
            </FormLabel>
            <RadioGroup
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <Stack spacing={2}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <FormControlLabel
                    key={option.value}
                    value={option.value}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {option.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    }
                    sx={{
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      p: 1.5,
                      m: 0,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04)
                      }
                    }}
                  />
                ))}
              </Stack>
            </RadioGroup>
          </FormControl>

          {/* Custom Cron Expression */}
          {frequency === 'CUSTOM' && enabled && (
            <Box>
              <TextField
                fullWidth
                label="Cron Expression"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 */5 * * * *"
                helperText="Format: second minute hour day month year (optional)"
                error={cronExpression !== '' && !validateCronExpression(cronExpression)}
              />
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Examples:</strong>
                  <br />• <code>0 */5 * * * *</code> - Every 5 minutes
                  <br />• <code>0 0 9 * * MON-FRI</code> - 9 AM on weekdays
                  <br />• <code>0 30 14 * * *</code> - Daily at 2:30 PM
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Preview */}
          <Box
            sx={{
              p: 2,
              bgcolor: alpha(theme.palette.info.main, 0.05),
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
              borderRadius: 2
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <Info color="info" fontSize="small" />
              <Typography variant="subtitle2" color="info.main" fontWeight={600}>
                Schedule Preview
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {getNextExecutionPreview()}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || (frequency === 'CUSTOM' && !validateCronExpression(cronExpression))}
        >
          {loading ? 'Saving...' : 'Save Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleDialog;