import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Stack,
  LinearProgress,
  Alert,
  AlertTitle,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Badge,
  useTheme,
  alpha,
  CircularProgress,
  GlobalStyles,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Pause,
  Add,
  Delete,
  Edit,
  Science,
  VideoLibrary,
  Code,
  CheckCircle,
  Error,
  Warning,
  Timer,
  Visibility,
  VisibilityOff,
  Save,
  Share,
  Download,
  Upload,
  Settings,
  BugReport,
  Speed,
  Memory,
  WebAsset,
  Mouse,
  Keyboard,
  TouchApp,
  CameraAlt,
  FiberManualRecord,
  Schedule,
  AutoMode,
  ManualMode,
  ListAlt,
  PlaylistAdd,
  Clear,
  Refresh,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { 
  fetchCSIs, 
  setSelectedCSI
} from '@store/slices/csiSlice';
import { CSI } from '@/types/csi/csiTypes';
import { getCSIById } from '../../../data/mockCSIData';

interface CSIFilterBarProps {
  onCSIChange?: (csiId: string | null) => void;
  className?: string;
}

const CSIFilterBar: React.FC<CSIFilterBarProps> = ({ 
  onCSIChange,
  className 
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const { 
    data: csis, 
    loading,
    error,
    selectedCSI
  } = useAppSelector(state => state.csi);

  useEffect(() => {
    // Load CSIs on component mount
    dispatch(fetchCSIs());
  }, [dispatch]);

  useEffect(() => {
    // Notify parent of CSI changes
    if (onCSIChange) {
      onCSIChange(selectedCSI);
    }
  }, [selectedCSI, onCSIChange]);

  const selectedCSIData = selectedCSI ? getCSIById(selectedCSI) : null;

  const handleCSIChange = (event: any, newValue: CSI | null) => {
    dispatch(setSelectedCSI(newValue?.id || null));
  };

  const handleRefresh = () => {
    dispatch(fetchCSIs());
  };

  if (error) {
    return (
      <Alert 
        severity="error" 
        action={
          <Button color="inherit" size="small" onClick={handleRefresh}>
            Retry
          </Button>
        }
        sx={{ mb: 3 }}
      >
        Failed to load CSI data: {error}
      </Alert>
    );
  }

  return (
    <Paper 
      className={className}
      sx={{ 
        p: 2, 
        mb: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        borderRadius: 2
      }}
    >
      {loading === 'loading' && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '8px 8px 0 0' }} />}
      
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ flex: 1 }}>
          <Autocomplete
            options={csis}
            getOptionLabel={(option) => `${option.id} - ${option.name}`}
            value={selectedCSIData}
            onChange={handleCSIChange}
            loading={loading === 'loading'}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select CSI System"
                placeholder="Search by CSI ID or name..."
                required
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <Domain sx={{ color: 'text.secondary', mr: 1 }} />
                  ),
                }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {option.id} - {option.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.businessUnit}
                    </Typography>
                  </Box>
                </Box>
              </li>
            )}
            noOptionsText="No CSI systems found"
            isOptionEqualToValue={(option, value) => option.id === value.id}
          />
        </Box>

        <Tooltip title="Refresh Data">
          <span>
            <IconButton onClick={handleRefresh} disabled={loading === 'loading'}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

export default CSIFilterBar;