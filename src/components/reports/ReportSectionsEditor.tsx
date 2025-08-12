import React from 'react';
import { Box, Paper, Stack, TextField, Typography, Button, Chip } from '@mui/material';
import { Search } from '@mui/icons-material';
import type { ReportSection } from '@/types/reports/reportTypes';

interface Props {
  sections: ReportSection[];
  onChange: (next: ReportSection[]) => void;
  search: string;
  onSearch: (q: string) => void;
  searchResults: Array<{ id: string; name: string; csiName: string }>;
  onAddCheckToSection: (sectionIndex: number, checkId: string) => void;
}

const ReportSectionsEditor: React.FC<Props> = ({ sections, onChange, search, onSearch, searchResults, onAddCheckToSection }) => {
  return (
    <Box>
      <Stack spacing={1}>
        {sections.length === 0 && (
          <Typography variant="caption" color="text.secondary">No sections yet.</Typography>
        )}
        {sections.map((s, idx) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <TextField size="small" label="Title" value={s.title} onChange={(e) => {
                  const updated = [...sections];
                  updated[idx] = { ...updated[idx], title: e.target.value };
                  onChange(updated);
                }} sx={{ minWidth: 240 }} />
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => {
                    if (idx > 0) {
                      const updated = [...sections];
                      const [moved] = updated.splice(idx, 1);
                      updated.splice(idx - 1, 0, moved);
                      onChange(updated);
                    }
                  }}>Up</Button>
                  <Button size="small" onClick={() => {
                    if (idx < sections.length - 1) {
                      const updated = [...sections];
                      const [moved] = updated.splice(idx, 1);
                      updated.splice(idx + 1, 0, moved);
                      onChange(updated);
                    }
                  }}>Down</Button>
                  <Button size="small" color="error" onClick={() => onChange(sections.filter((x) => x.id !== s.id))}>Remove</Button>
                </Stack>
              </Stack>
              {s.kind === 'manual' && (
                <Stack spacing={1}>
                  <TextField size="small" placeholder="Search checks to add" value={search} onChange={(e) => onSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
                  {searchResults.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      {searchResults.map((r) => (
                        <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2">{r.name}</Typography>
                          <Button size="small" onClick={() => onAddCheckToSection(idx, r.id)}>Add</Button>
                        </Stack>
                      ))}
                    </Paper>
                  )}
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {(s.checkIds || []).map((id) => (
                      <Chip key={id} size="small" label={id} onDelete={() => {
                        const updated = [...sections];
                        const target = updated[idx];
                        updated[idx] = { ...target, checkIds: (target.checkIds || []).filter((x) => x !== id) };
                        onChange(updated);
                      }} />
                    ))}
                  </Stack>
                </Stack>
              )}
              {s.kind === 'rule' && (
                <Typography variant="caption" color="text.secondary">Rule-based configuration handled elsewhere</Typography>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default ReportSectionsEditor;


