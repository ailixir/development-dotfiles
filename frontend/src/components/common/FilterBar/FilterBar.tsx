import React, { useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Button,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Refresh,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { 
  fetchCSIs, 
  setSelectedCSI,
  fetchTags,
  setSelectedTags
} from '@store/slices/csiSlice';
import CSISelect from './CSISelect';
import TagSelect from './TagSelect';

interface FilterBarProps {
  onFiltersChange?: (filters: { csiId: string | null; tags: string[] }) => void;
  className?: string;
  showTagFilter?: boolean;
}

const FilterBar: React.FC<FilterBarProps> = ({ 
  onFiltersChange,
  className,
  showTagFilter = true
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const { 
    data: csis, 
    loading,
    error,
    selectedCSI,
    tags: {
      selected: selectedTags,
      available: availableTags,
      loading: tagsLoading
    }
  } = useAppSelector(state => state.csi);

  useEffect(() => {
    // Load initial data
    dispatch(fetchCSIs());
    if (showTagFilter) {
      dispatch(fetchTags());
    }
  }, [dispatch, showTagFilter]);

  useEffect(() => {
    // Notify parent of filter changes
    if (onFiltersChange) {
      onFiltersChange({
        csiId: selectedCSI,
        tags: selectedTags
      });
    }
  }, [selectedCSI, selectedTags, onFiltersChange]);

  const handleCSIChange = useCallback((csiId: string | null) => {
    dispatch(setSelectedCSI(csiId));
    // Refresh tags when CSI changes to show relevant tags
    if (showTagFilter && csiId) {
      dispatch(fetchTags({ csiId }));
    }
  }, [dispatch, showTagFilter]);

  const handleTagsChange = useCallback((tags: string[]) => {
    dispatch(setSelectedTags(tags));
  }, [dispatch]);

  const handleRefresh = useCallback(() => {
    dispatch(fetchCSIs());
    if (showTagFilter) {
      dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
    }
  }, [dispatch, showTagFilter, selectedCSI]);

  const isLoading = loading === 'loading' || tagsLoading;

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
        Failed to load filter data: {error}
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
        borderRadius: 2,
        position: 'relative'
      }}
    >
      {isLoading && (
        <LinearProgress 
          sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            borderRadius: '8px 8px 0 0' 
          }} 
        />
      )}
      
      {/* Primary Filters Row */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ flex: 3, minWidth: '300px' }}>
          <CSISelect
            csis={csis}
            selectedCSI={selectedCSI}
            onCSIChange={handleCSIChange}
            loading={loading === 'loading'}
          />
        </Box>

        {showTagFilter && (
          <Box sx={{ flex: 3, minWidth: '300px' }}>
            <TagSelect
              tags={availableTags}
              selectedTags={selectedTags}
              onTagsChange={handleTagsChange}
              loading={tagsLoading}
              disabled={!selectedCSI}
            />
          </Box>
        )}

        <Tooltip title="Refresh Data">
          <span>
            <IconButton onClick={handleRefresh} disabled={isLoading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

export default FilterBar;