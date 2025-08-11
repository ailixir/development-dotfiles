import React, { useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
  Button,
} from '@mui/material';
import { FilterAlt, ClearAll, Refresh } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs, fetchTags, setSelectedCSI, setSelectedTags, setTagFilterMode, clearFilters } from '@store/slices/csiSlice';
import CSISelect from '@components/common/FilterBar/CSISelect';
import TagSelect from '@components/common/FilterBar/TagSelect';

/**
 * Global scope bar shown across Checks pages.
 * Visual-first skeleton that reuses existing CSISelect/TagSelect.
 */
const ScopeBar: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const {
    data: csis,
    loading,
    selectedCSI,
    tags: { available: availableTags, selected: selectedTags, loading: tagsLoading, filterMode },
  } = useAppSelector((s) => s.csi);

  useEffect(() => {
    dispatch(fetchCSIs());
    dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
  }, [dispatch, selectedCSI]);

  const handleCSIChange = useCallback(
    (csiId: string | null) => {
      dispatch(setSelectedCSI(csiId));
      dispatch(fetchTags(csiId ? { csiId } : undefined));
    },
    [dispatch]
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      dispatch(setSelectedTags(tags));
    },
    [dispatch]
  );

  const handleModeChange = (_: any, next: 'AND' | 'OR' | null) => {
    if (next) dispatch(setTagFilterMode(next));
  };

  const handleClear = () => {
    dispatch(clearFilters());
  };

  const handleRefresh = () => {
    dispatch(fetchCSIs());
    dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
  };

  const isBusy = loading === 'loading' || tagsLoading;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.5,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.primary.main, 0.015)} 100%)`,
        borderRadius: 2,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 260, flex: 2 }}>
          <FilterAlt sx={{ color: 'text.secondary' }} />
          <Typography variant="subtitle2" color="text.secondary">
            Scope
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh CSI and tags">
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={isBusy}>
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear scope">
            <span>
              <IconButton size="small" onClick={handleClear} disabled={isBusy}>
                <ClearAll fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Box sx={{ flex: 4, minWidth: 280 }}>
          <CSISelect
            csis={csis}
            selectedCSI={selectedCSI}
            onCSIChange={handleCSIChange}
            loading={loading === 'loading'}
          />
        </Box>

        <Box sx={{ flex: 6, minWidth: 320 }}>
          <TagSelect
            tags={availableTags}
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            loading={tagsLoading}
            disabled={false}
          />
        </Box>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Tag mode
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={filterMode}
            exclusive
            onChange={handleModeChange}
            aria-label="Tag filter mode"
          >
            <ToggleButton value="AND" aria-label="AND">
              AND
            </ToggleButton>
            <ToggleButton value="OR" aria-label="OR">
              OR
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button variant="outlined" size="small" disabled>
            Save
          </Button>
          <Button variant="outlined" size="small" disabled>
            Share
          </Button>
        </Stack>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Scope applies across pages.
      </Typography>
    </Paper>
  );
};

export default ScopeBar;


