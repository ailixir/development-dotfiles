import React, { useEffect } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Divider,
  Chip,
  Skeleton,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { setSelectedTags, setTagFilterMode, fetchTags } from '@/store/slices/csiSlice';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { Search } from '@mui/icons-material';

/**
 * Visual skeleton rail for faceted filters (status, type, tags summary).
 * Non-functional for now; for layout validation only.
 */
const FiltersRail: React.FC = () => {
  const dispatch = useAppDispatch();
  const { tags } = useAppSelector((s) => s.csi);

  useEffect(() => {
    dispatch(fetchTags());
  }, [dispatch]);

  return (
    <Paper sx={{ p: 2, border: (t) => `1px solid ${t.palette.divider}` }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Filters
        </Typography>
        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Tag Filter Mode
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {(['AND', 'OR'] as const).map((mode) => (
              <Chip
                key={mode}
                label={mode}
                size="small"
                variant={tags.filterMode === mode ? 'filled' : 'outlined'}
                onClick={() => dispatch(setTagFilterMode(mode))}
              />
            ))}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Selected Tags
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {tags.selected.map((tag) => (
              <Chip key={tag} label={tag} size="small" onDelete={() => dispatch(setSelectedTags(tags.selected.filter((t) => t !== tag)))} />
            ))}
            {tags.selected.length === 0 && (
              <Typography variant="caption" color="text.secondary">None</Typography>
            )}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Available Tags
          </Typography>
          <TextField
            placeholder="Search tags"
            size="small"
            fullWidth
            sx={{ mt: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            onChange={(e) => {
              const q = e.target.value.toLowerCase();
              const filtered = (tags as any).available.filter((t: string) => t.toLowerCase().includes(q));
              // Store filtered list transiently on state object for render (prototype-only)
              (tags as any).filtered = filtered;
            }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', maxHeight: 220, overflowY: 'auto' }}>
            {tags.loading ? (
              [...Array(6)].map((_, i) => <Skeleton variant="rounded" height={20} width={120} key={i} />)
            ) : (
              ((tags as any).filtered || tags.available).slice(0, 30).map((tag: string) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant={tags.selected.includes(tag) ? 'filled' : 'outlined'}
                  onClick={() => {
                    const selected = tags.selected.includes(tag)
                      ? tags.selected.filter((t) => t !== tag)
                      : [...tags.selected, tag];
                    dispatch(setSelectedTags(selected));
                  }}
                />
              ))
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

export default FiltersRail;









