import React, { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, Chip, Stack, TextField, InputAdornment, MenuItem, Button, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Paper } from '@mui/material';
import { Api, Storage, AutoGraph, Security, BugReport, Science, Search } from '@mui/icons-material';
import templatesApi from '@/services/api/templatesApi';
import { useNavigate } from 'react-router-dom';

const TYPE_ICON: Record<string, any> = { HTTP: Api, TCP: Storage, SPLUNK: AutoGraph, GRAFANA: AutoGraph, ITRS: Security, APPDYNAMICS: BugReport, UI_TEST: Science };

const ChecksTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [preview, setPreview] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list({ q: query || undefined, type: type || undefined });
      const data = (res as any).data || res || [];
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('templates:filters');
      if (raw) {
        const f = JSON.parse(raw);
        if (f.query) setQuery(f.query);
        if (f.type) setType(f.type);
      }
    } catch {}
    load();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('templates:filters', JSON.stringify({ query, type })); } catch {}
  }, [query, type]);

  const onApply = async (tpl: any) => {
    // Prefill create wizard via localStorage draft and redirect
    try {
      const draftRaw = localStorage.getItem('checks:create:draft');
      const draft = draftRaw ? JSON.parse(draftRaw) : {};
      const merged = { ...draft, checkType: tpl.type, ...tpl.defaults, __fromTemplate: tpl.title };
      localStorage.setItem('checks:create:draft', JSON.stringify(merged));
    } catch {}
    navigate('/checks/create');
  };

  const onPreview = (tpl: any) => setPreview(tpl);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ flex: 1 }}>Templates</Typography>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 260 }}
        />
        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All</MenuItem>
          {Object.keys(TYPE_ICON).map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={load}>Search</Button>
      </Stack>

      <Grid container spacing={2}>
        {loading ? (
          [...Array(6)].map((_, i) => (
            <Grid key={i} item xs={12} md={6} lg={4}>
              <Skeleton variant="rounded" height={140} />
            </Grid>
          ))
        ) : items.length === 0 ? (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">No templates found.</Typography>
          </Grid>
        ) : (
          items.map((tpl: any) => {
            const Icon = TYPE_ICON[tpl.type] || Api;
            return (
              <Grid key={tpl.id} item xs={12} md={6} lg={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Icon />
                        <Typography variant="subtitle1" fontWeight={600}>{tpl.title}</Typography>
                        <Chip size="small" label={tpl.type} sx={{ ml: 'auto' }} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{tpl.description}</Typography>
                      <Stack direction="row" spacing={1}>
                        {tpl.tags?.slice(0, 3).map((t: string) => (
                          <Chip key={t} label={t} size="small" variant="outlined" />
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" onClick={() => onApply(tpl)}>Use template</Button>
                        <Button size="small" variant="outlined" onClick={() => onPreview(tpl)}>Preview</Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>

      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md" fullWidth>
        <DialogTitle>{preview?.title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">{preview?.description}</Typography>
            <Stack direction="row" spacing={1}>
              <Chip label={preview?.type} size="small" />
              {preview?.tags?.map((t: string) => <Chip key={t} label={t} size="small" variant="outlined" />)}
            </Stack>
            <Typography variant="subtitle2">Defaults</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(preview?.defaults, null, 2)}</pre>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
          <Button variant="contained" onClick={() => { if (preview) onApply(preview); }}>Use template</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecksTemplatesPage;


