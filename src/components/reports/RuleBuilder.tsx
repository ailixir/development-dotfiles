import React from 'react';
import { Box, Stack, TextField, Typography, MenuItem, FormControl, InputLabel, Select, Chip } from '@mui/material';
import TagSelect from '@/components/common/FilterBar/TagSelect';

interface RuleBuilderProps {
  value: any;
  onChange: (next: any) => void;
  availableTags?: string[];
}

const RuleBuilder: React.FC<RuleBuilderProps> = ({ value, onChange, availableTags = [] }) => {
  return (
    <Box>
      <Stack spacing={1.5}>
        <TextField size="small" label="CSI IDs (comma sep)" value={(value?.csiIds || []).join(', ')} onChange={(e) => onChange({ ...value, csiIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        <TagSelect tags={availableTags} selectedTags={value?.tags || []} onTagsChange={(tags) => onChange({ ...value, tags })} />
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
        <Typography variant="caption" color="text.secondary">Live match count appears in Preview after save/preview.</Typography>
      </Stack>
    </Box>
  );
};

export default RuleBuilder;


