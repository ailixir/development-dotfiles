import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Divider, List, ListItemButton, ListItemText, Popper, Paper, TextField, InputAdornment, Stack, alpha, useTheme, Button, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearSearchContext, searchAll, setSearchContext, setSearchFilters, clearSearchFilters } from '@/store/slices/dashboardSlice';
import { Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { csiApi } from '@/services/api/csiApi';

const GlobalSearch: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const navigate = useNavigate();
  const { data, loading } = useAppSelector((s) => s.dashboard.search);
  const context = useAppSelector((s) => s.dashboard.searchContext);
  const results = Array.isArray(data) ? data : [];
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [csiResults, setCsiResults] = useState<any[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftEnv, setDraftEnv] = useState<string | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftMode, setDraftMode] = useState<'AND' | 'OR'>('AND');

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = query.trim();
      if (q.toLowerCase().startsWith('csi:')) {
        const val = q.split(':')[1]?.trim();
        if (val) dispatch(setSearchContext({ csiId: val }));
        return;
      }
      if (!context.csiId) {
        if (q.length >= 2) setCsiResults(await csiApi.searchCsis(q, 10));
        else setCsiResults([]);
      } else {
        if (q.length >= 2) dispatch(searchAll({ query: q, context }));
      }
    }, 200);
    return () => clearTimeout(id);
  }, [dispatch, query, context]);

  const open = useMemo(() => {
    if (!anchorEl) return false;
    if (!context.csiId) return query.trim().length >= 2; // need 2 chars for CSI suggestions
    // With context set, open as soon as field is focused to show Change CSI + sections
    return true;
  }, [anchorEl, query, context.csiId]);

  return (
    <Box>
      <TextField
        inputRef={inputRef}
        placeholder={context.csiId ? 'Search or jump to…' : 'Select a CSI to search…'}
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={(e) => setAnchorEl(e.currentTarget)}
        onBlur={() => setTimeout(() => setAnchorEl(null), 200)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
          endAdornment: context.csiId ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`CSI: ${context.csiId}`} onDelete={() => dispatch(clearSearchContext())} />
              {context.environment && (
                <Chip size="small" label={`Env: ${context.environment}`} onDelete={() => dispatch(setSearchFilters({ environment: null }))} />
              )}
              {context.tags && context.tags.length > 0 && (
                <Chip size="small" label={`Tags: ${context.tags.length}`} onDelete={() => dispatch(setSearchFilters({ tags: [] }))} />
              )}
              <Button size="small" onMouseDown={() => {
                setDraftEnv(context.environment || null);
                setDraftTags(context.tags || []);
                setDraftMode(context.tagMode || 'AND');
                setFiltersOpen(true);
              }}>Filters</Button>
            </Stack>
          ) : undefined,
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            background: alpha(theme.palette.primary.main, 0.03),
          }
        }}
      />
      <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1300, width: anchorEl?.clientWidth }}>
        <Paper variant="outlined">
          {!context.csiId ? (
            <>
              {query.trim().length < 2 ? (
                <Box p={2}>Type at least 2 characters to find a CSI</Box>
              ) : csiResults.length === 0 ? (
                <Box p={2}>No CSI matches</Box>
              ) : (
                <List dense disablePadding>
                  {csiResults.map((csi) => (
                    <ListItemButton
                      key={csi.id}
                      onMouseDown={() => {
                        dispatch(setSearchContext({ csiId: csi.id }));
                        setQuery('');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                    >
                      <ListItemText primary={csi.name} secondary={csi.id} />
                    </ListItemButton>
                  ))}
                </List>
              )}
              <Divider />
              <Box p={2} pt={1} color="text.secondary">Choose a CSI to search Checks and Reports.</Box>
            </>
          ) : (
            <>
              <List dense disablePadding>
                <ListItemButton onMouseDown={() => dispatch(clearSearchContext())}>
                  <ListItemText primary="Change CSI" secondary={`Current: ${context.csiId}`} />
                </ListItemButton>
              </List>
              <Divider />
              {query.trim().length >= 2 ? (
                <>
                  {loading === 'loading' ? (
                    <Box p={2}>Searching…</Box>
                  ) : (
                    <>
                      <List dense disablePadding>
                        {results
                          .filter((r) => r.type === 'CHECK')
                          .slice(0, 5)
                          .map((r) => (
                            <ListItemButton key={`${r.type}-${r.id}`} onMouseDown={() => navigate(r.path)}>
                              <ListItemText primary={r.title} secondary={r.subtitle} />
                            </ListItemButton>
                          ))}
                      </List>
                      <Divider />
                      <List dense disablePadding>
                        {results
                          .filter((r) => r.type === 'REPORT')
                          .slice(0, 5)
                          .map((r) => (
                            <ListItemButton key={`${r.type}-${r.id}`} onMouseDown={() => navigate(r.path)}>
                              <ListItemText primary={r.title} />
                            </ListItemButton>
                          ))}
                      </List>
                    </>
                  )}
                </>
              ) : (
                <Box p={2} color="text.secondary">Type to search Checks and Reports</Box>
              )}
              <Divider />
              <List dense disablePadding>
                <ListItemButton onMouseDown={() => navigate('/checks/create')}>
                  <ListItemText primary="Create Check" secondary="Quick action" />
                </ListItemButton>
              </List>
            </>
          )}
        </Paper>
      </Popper>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Filters</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Autocomplete
              options={[ 'Production', 'Staging', 'Development', 'UAT' ]}
              value={draftEnv}
              onChange={(_, v) => setDraftEnv(v)}
              renderInput={(params) => <TextField {...params} label="Environment (optional)" placeholder="Select environment" />}
              clearOnEscape
            />
            <Autocomplete
              multiple
              freeSolo
              options={[ 'team:platform-engineering', 'lob:capital-markets', 'priority:critical', 'application:trading-api' ]}
              value={draftTags}
              onChange={(_, v) => setDraftTags(v)}
              renderInput={(params) => <TextField {...params} label="Tags (optional)" placeholder="Add tags" />} 
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="AND" color={draftMode === 'AND' ? 'primary' : 'default'} onClick={() => setDraftMode('AND')} />
              <Chip label="OR" color={draftMode === 'OR' ? 'primary' : 'default'} onClick={() => setDraftMode('OR')} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDraftEnv(null); setDraftTags([]); setDraftMode('AND'); dispatch(clearSearchFilters()); }}>Clear</Button>
          <Button onClick={() => setFiltersOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            dispatch(setSearchFilters({ environment: draftEnv, tags: draftTags, tagMode: draftMode }));
            setFiltersOpen(false);
            const q = query.trim();
            if (context.csiId && q.length >= 2) {
              const latest = { ...context, environment: draftEnv, tags: draftTags, tagMode: draftMode } as any;
              dispatch(searchAll({ query: q, context: latest }));
            }
          }}>Apply</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GlobalSearch;


