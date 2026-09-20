import React, { useEffect, useRef, useState } from 'react';
import { Box, Stack, TextField, Typography, MenuItem, FormControl, InputLabel, Select, Chip, Autocomplete, CircularProgress } from '@mui/material';
import TagSelect from '@/components/common/FilterBar/TagSelect';
import { csiApi } from '@/services/api/csiApi';
import apiClient from '@/services/api/apiClient';

interface RuleBuilderProps {
  value: any;
  onChange: (next: any) => void;
  availableTags?: string[];
}

const RuleBuilder: React.FC<RuleBuilderProps> = ({ value, onChange, availableTags = [] }) => {
  // --- CSI IDs (re-implemented) ---
  const [csiInput, setCsiInput] = useState<string>('');
  const [csiOptions, setCsiOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [csiSelected, setCsiSelected] = useState<Array<{ id: string; name: string }>>([]);
  const [csiLoading, setCsiLoading] = useState<boolean>(false);
  const searchTimer = useRef<number | undefined>(undefined);

  const [allTags, setAllTags] = useState<string[]>(availableTags);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Keep selected list in sync with external value.csiIds and hydrate names
  useEffect(() => {
    const selectedIds: string[] = Array.isArray(value?.csiIds) ? value.csiIds : [];
    if (selectedIds.length === 0) { setCsiSelected([]); return; }
    const existingMap = new Map(csiOptions.map(o => [o.id, o.name] as const));
    const nextSelected: Array<{ id: string; name: string }> = selectedIds.map(id => ({ id, name: existingMap.get(id) || '' }));
    setCsiSelected(nextSelected);
    // hydrate missing names
    const missing = nextSelected.filter(s => !s.name).map(s => s.id);
    if (missing.length > 0) {
      setCsiLoading(true);
      Promise.all(missing.map(async (id) => {
        try { const d: any = await csiApi.getCsiById(id); return { id: d.id, name: d.name }; } catch { return { id, name: id }; }
      })).then(details => {
        // merge into options and selected
        const mergedOptions = new Map<string, string>();
        csiOptions.forEach(o => mergedOptions.set(o.id, o.name));
        details.forEach(d => mergedOptions.set(d.id, d.name));
        setCsiOptions(Array.from(mergedOptions.entries()).map(([id, name]) => ({ id, name })));
        setCsiSelected(selectedIds.map(id => ({ id, name: mergedOptions.get(id) || id })));
      }).finally(() => setCsiLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.csiIds]);

  // Search when typing (debounced)
  useEffect(() => {
    if (!csiInput || csiInput.length < 2) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setCsiLoading(true);
      try {
        const items = await csiApi.searchCsis(csiInput, 10);
        const list = items.map((i: any) => ({ id: i.id, name: i.name }));
        // merge with selected to ensure chips remain labeled
        const merged = new Map<string, string>();
        list.forEach(i => merged.set(i.id, i.name));
        csiSelected.forEach(s => merged.set(s.id, s.name || merged.get(s.id) || ''));
        setCsiOptions(Array.from(merged.entries()).map(([id, name]) => ({ id, name })));
      } finally { setCsiLoading(false); }
    }, 250);
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csiInput]);

  useEffect(() => {
    const active = true;
    setTagsLoading(true);
    apiClient.get('/tags')
      .then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []);
        if (active) setAllTags(list && Array.isArray(list) ? list : availableTags);
      })
      .catch(() => setAllTags(availableTags))
      .finally(() => { if (active) setTagsLoading(false); });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Box>
      <Stack spacing={1.5}>
        <Autocomplete
          multiple
          options={csiOptions}
          getOptionLabel={(opt) => `${opt.id}${opt.name ? ` - ${opt.name}` : ''}`}
          isOptionEqualToValue={(opt, val) => opt.id === val.id}
          filterOptions={(options) => options}
          filterSelectedOptions
          loading={csiLoading}
          value={csiSelected}
          onChange={(_, newVals) => {
            const next = (newVals || []).map(v => ({ id: v.id, name: v.name || (csiOptions.find(o => o.id === v.id)?.name) || '' }));
            setCsiSelected(next);
            onChange({ ...value, csiIds: next.map(n => n.id) });
          }}
          inputValue={csiInput}
          onInputChange={(_, newInput) => setCsiInput(newInput)}
          noOptionsText={csiInput && csiInput.length >= 2 ? 'No CSI matches' : 'Type ID or name (min 2 chars)'}
          loadingText="Searching…"
          renderInput={(params) => (
            <TextField {...params} size="small" label="CSI" placeholder="Search by CSI ID or name" InputProps={{ ...params.InputProps, endAdornment: (<>
              {csiLoading ? <CircularProgress color="inherit" size={16} /> : null}
              {params.InputProps.endAdornment}
            </>) }} />
          )}
        />

        <TagSelect tags={allTags} selectedTags={value?.tags || []} onTagsChange={(tags) => onChange({ ...value, tags })} loading={tagsLoading} placeholder="Type to filter by tag" label="Tags" />
         <FormControl size="small">
          <InputLabel>Types</InputLabel>
          <Select multiple value={value?.types || []} label="Types" onChange={(e) => onChange({ ...value, types: e.target.value })} renderValue={(selected) => (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(selected as string[]).map((s) => (<Chip key={s} size="small" label={s} />))}
            </Box>
          )}>
            {['HTTP','TCP','SPLUNK','GRAFANA','ITRS','APPDYNAMICS','UI_TEST'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
         <FormControl size="small">
          <InputLabel>Status</InputLabel>
          <Select multiple value={value?.status || []} label="Status" onChange={(e) => onChange({ ...value, status: e.target.value })} renderValue={(selected) => (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(selected as string[]).map((s) => (<Chip key={s} size="small" label={s} />))}
            </Box>
          )}>
            {['PASSING','WARNING','FAILING','PENDING','UNKNOWN'].map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Sort</InputLabel>
            <Select value={value?.sort || ''} label="Sort" onChange={(e) => onChange({ ...value, sort: e.target.value })}>
              <MenuItem value="">None</MenuItem>
              <MenuItem value="failing-first">Failing first</MenuItem>
              <MenuItem value="recently-failed">Recently failed</MenuItem>
              <MenuItem value="alphabetical">Alphabetical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select value={value?.timeframe || ''} label="Timeframe" onChange={(e) => onChange({ ...value, timeframe: e.target.value })}>
              <MenuItem value="">Any time</MenuItem>
              <MenuItem value="5m">Last 5 minutes</MenuItem>
              <MenuItem value="15m">Last 15 minutes</MenuItem>
              <MenuItem value="1h">Last hour</MenuItem>
              <MenuItem value="24h">Last 24 hours</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" type="number" label="Limit" value={value?.limit ?? 10} onChange={(e) => onChange({ ...value, limit: Math.max(0, Number(e.target.value) || 0) })} sx={{ maxWidth: 120 }} />
        </Stack>
         <Typography variant="caption" color="text.secondary">Live match count appears in Preview after save/preview. Use tags, CSI IDs, types and status to refine.</Typography>
      </Stack>
    </Box>
  );
};

export default RuleBuilder;


