import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Autocomplete, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Refresh, Send, Search, Save, Add, CheckCircle, Info, OpenInFull, Schedule, Email, Description, ViewList, ArrowUpward, ArrowDownward, DeleteOutline } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { createReport, fetchReports, generatePreview, addSection, updateSection, removeSection, reorderSections } from '@/store/slices/reportsSlice';
import { useNavigate, useParams } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
import reportsApi from '@/services/api/reportsApi';
import RecipientsEditor from '@/components/reports/RecipientsEditor';
import ScheduleEditor from '@/components/reports/ScheduleEditor';
import RuleBuilder from '@/components/reports/RuleBuilder';
import type { ReportSection, ReportSchedule, ManualReportSection } from '@/types/reports/reportTypes';

type CheckSearchOption = { id: string; name: string; csiId: string; csiName: string };

const TEMPLATE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'executive', label: 'Executive' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'alert-digest', label: 'Alert Digest' },
  { value: 'trend-analysis', label: 'Trend Analysis' },
];

const ReportBuilder: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const isEditMode = Boolean(params.id);
  const { previewContent, generatingPreview } = useAppSelector((s) => s.reports);

  const [reportConfig, setReportConfig] = useState({
    name: '',
    description: '',
    subject: '',
    recipients: [] as string[],
    template: 'standard',
    selectedChecks: [] as string[],
    sections: [] as ReportSection[],
    schedule: { frequency: 'daily', time: '18:00', timezone: 'America/New_York', enabled: true } as ReportSchedule,
  });

  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setReportConfig((rc) => ({
            ...rc,
            ...parsed,
            recipients: Array.isArray(parsed.recipients)
              ? parsed.recipients
              : typeof parsed.recipients === 'string'
                ? parsed.recipients.split(',').map((s: string) => s.trim()).filter(Boolean)
                : rc.recipients,
          }));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      window.localStorage.setItem(key, JSON.stringify(reportConfig));
    } catch {}
  }, [reportConfig]);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingIndicator, setSavingIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [testRecipients, setTestRecipients] = useState<string[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [checkMeta, setCheckMeta] = useState<Record<string, { name: string; csiId: string; csiName: string }>>({});
  const [manualSearch, setManualSearch] = useState<Record<string, string>>({});
  const [manualResults, setManualResults] = useState<Record<string, CheckSearchOption[]>>({});
  const [manualLoading, setManualLoading] = useState<Record<string, boolean>>({});
  const searchTimersRef = useRef<Record<string, any>>({});
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (params.id) {
      reportsApi.getById(params.id).then((r: any) => {
        const safeSections = Array.isArray(r.sections)
          ? r.sections.map((s: any, i: number) => {
              const kind = s.kind || (s.rule ? 'rule' : 'manual');
              return {
                id: s.id || `section-loaded-${i}-${Date.now()}`,
                title: s.title || s.type || '',
                kind,
                checkIds: Array.isArray(s.checkIds) ? s.checkIds : kind === 'manual' ? [] : undefined,
                rule: kind === 'rule' ? (s.rule || {}) : undefined,
              };
            })
          : [];
        const recipientsArr = Array.isArray(r.recipients)
          ? r.recipients
          : typeof r.recipients === 'string'
            ? r.recipients.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
        setReportConfig({
          name: r.name ?? '',
          description: r.description ?? '',
          subject: r.name ?? '',
          recipients: recipientsArr,
          template: r.template || 'standard',
          selectedChecks: r.selectedChecks || [],
          sections: safeSections,
          schedule: { frequency: 'daily', time: '18:00', timezone: 'America/New_York', enabled: true, ...r.schedule },
        });
        setDraftId(r.id);
      }).catch(() => {});
    }
  }, [params.id]);

  useEffect(() => {
    dispatch(fetchReports(undefined));
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveReport();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleGeneratePreview();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reportConfig, draftId]);


  const ensureMetaForIds = async (ids: string[]) => {
    const missing = ids.filter((id) => !checkMeta[id]);
    if (missing.length === 0) return;
    try {
      const fetched = await Promise.all(missing.map(async (id) => {
        try {
          const c = await checksApi.getCheckById(id);
          return { id, name: c.name, csiId: c.csiId, csiName: c.csiName } as CheckSearchOption & { id: string };
        } catch { return null; }
      }));
      const next: Record<string, { name: string; csiId: string; csiName: string }> = {};
      for (const it of fetched) {
        if (it && it.id) next[it.id] = { name: it.name, csiId: it.csiId, csiName: it.csiName };
      }
      if (Object.keys(next).length) setCheckMeta((m) => ({ ...m, ...next }));
    } catch {}
  };

  useEffect(() => {
    const allIds: string[] = (reportConfig.sections || [])
      .filter((s: any) => s.kind === 'manual')
      .flatMap((s: any) => (Array.isArray(s.checkIds) ? s.checkIds : []));
    void ensureMetaForIds(Array.from(new Set(allIds)));
  }, [reportConfig.sections]);

  const handleManualInputChange = (sectionId: string, q: string) => {
    setManualSearch((m) => ({ ...m, [sectionId]: q }));
    if (searchTimersRef.current[sectionId]) window.clearTimeout(searchTimersRef.current[sectionId]);
    if (!q.trim()) {
      setManualResults((r) => ({ ...r, [sectionId]: [] }));
      setManualLoading((l) => ({ ...l, [sectionId]: false }));
      return;
    }
    setManualLoading((l) => ({ ...l, [sectionId]: true }));
    searchTimersRef.current[sectionId] = window.setTimeout(async () => {
      try {
        const res = await checksApi.getChecks({ page: 1, limit: 10, filters: { searchQuery: q } });
        const items: CheckSearchOption[] = (res.data || []).map((c: any) => ({ id: c.id, name: c.name, csiId: c.csiId, csiName: c.csiName }));
        setManualResults((r) => ({ ...r, [sectionId]: items }));
      } finally {
        setManualLoading((l) => ({ ...l, [sectionId]: false }));
      }
    }, 300);
  };

  const addCheckToSection = (sectionIndex: number, option: CheckSearchOption) => {
    const updated = [...reportConfig.sections];
    const target = updated[sectionIndex];
    if (target.kind !== 'manual') return;
    const manual = target as ManualReportSection;
    const ids = new Set<string>(manual.checkIds || []);
    ids.add(option.id);
    updated[sectionIndex] = { ...manual, checkIds: Array.from(ids.values()) } as ManualReportSection;
    setReportConfig((rc) => ({ ...rc, sections: updated }));
    setCheckMeta((m) => ({ ...m, [option.id]: { name: option.name, csiId: option.csiId, csiName: option.csiName } }));
    setManualSearch((s) => ({ ...s, [target.id]: '' }));
  };

  const removeCheckFromSection = (sectionIndex: number, id: string) => {
    const updated = [...reportConfig.sections];
    const target = updated[sectionIndex];
    if (target.kind !== 'manual') return;
    const manual = target as ManualReportSection;
    updated[sectionIndex] = { ...manual, checkIds: (manual.checkIds || []).filter((x: string) => x !== id) } as ManualReportSection;
    setReportConfig((rc) => ({ ...rc, sections: updated }));
  };

  const buildPayload = useCallback(() => ({
    name: reportConfig.name || 'Untitled Report',
    description: reportConfig.description,
    template: reportConfig.template,
    sections: reportConfig.sections,
    schedule: reportConfig.schedule,
    recipients: reportConfig.recipients.filter(Boolean),
    selectedChecks: reportConfig.selectedChecks,
  }), [reportConfig]);

  const handleSaveReport = async (): Promise<string | null> => {
    if (saving) return draftId;
    try {
      setSaving(true);
      setSavingIndicator('saving');
      const payload = buildPayload();
      if (draftId || isEditMode) {
        const idToUpdate = draftId || (params.id as string);
        try {
          const updated = await reportsApi.updateReport(idToUpdate, payload as any);
          setDraftId(updated.id);
          setSavingIndicator('saved');
          window.setTimeout(() => setSavingIndicator('idle'), 1500);
          return updated.id;
        } catch (e: any) {
          if (e?.response?.status === 404) {
            const created = await dispatch(createReport(payload as any)).unwrap();
            setDraftId(created.id);
            setSavingIndicator('saved');
            window.setTimeout(() => setSavingIndicator('idle'), 1500);
            return created.id;
          }
          throw e;
        }
      } else {
        const created = await dispatch(createReport(payload as any)).unwrap();
        setDraftId(created.id);
        setSavingIndicator('saved');
        window.setTimeout(() => setSavingIndicator('idle'), 1500);
        return created.id;
      }
    } catch (e) {
      console.error('Failed to save report', e);
      setSnack({ open: true, message: 'Save failed', severity: 'error' });
      setSavingIndicator('idle');
      return null;
    } finally { setSaving(false); }
  };

  const handleGeneratePreview = async () => {
    let id = draftId;
    if (!id) {
      id = await handleSaveReport();
      if (!id) return;
    } else {
      try {
        await reportsApi.updateReport(id, buildPayload() as any);
      } catch (e) {
        console.error('Failed to update before preview', e);
      }
    }
    try {
      await dispatch(generatePreview(id)).unwrap();
    } catch {
      setSnack({ open: true, message: 'Preview failed to generate', severity: 'error' });
    }
  };

  useEffect(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(async () => {
      const savedId = await handleSaveReport();
      if (savedId && reportConfig.sections.length > 0) {
        try { await dispatch(generatePreview(savedId)).unwrap(); } catch {}
      }
    }, 1200) as unknown as number;
    return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current); };
  }, [reportConfig.name, reportConfig.description, reportConfig.subject, reportConfig.sections, reportConfig.schedule, reportConfig.recipients, reportConfig.template]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {isEditMode ? `Edit Report${reportConfig.name ? `: ${reportConfig.name}` : ''}` : 'Create Report'}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Save (Cmd+S)"><span>
            <Button variant="contained" size="small" startIcon={<Save />} onClick={handleSaveReport} disabled={saving} aria-label="save report">
              {saving ? 'Saving...' : 'Save Report'}
            </Button>
          </span></Tooltip>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1 }} aria-live="polite" role="status">
            {savingIndicator === 'saving' && <>
              <Info fontSize="small" color="info" />
              <Typography variant="caption" color="text.secondary">Saving...</Typography>
            </>}
            {savingIndicator === 'saved' && <>
              <CheckCircle fontSize="small" color="success" />
              <Typography variant="caption" color="text.secondary">All changes saved</Typography>
            </>}
          </Stack>
        </Stack>
      </Stack>
      <Grid container spacing={3}>
        {/* Left Panel: Configuration */}
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Description fontSize="small" color="action" />
                    <Typography variant="subtitle2" fontWeight={700}>Details</Typography>
                  </Stack>
                  <TextField
                    label="Report Name"
                    value={reportConfig.name}
                    onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value, subject: e.target.value })}
                    fullWidth
                    size="small"
                    required
                    error={!reportConfig.name.trim()}
                    helperText={!reportConfig.name.trim() ? 'Name is required' : undefined}
                    inputProps={{ 'aria-label': 'Report Name' }}
                  />
                  <TextField
                    label="Description"
                    value={reportConfig.description}
                    onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })}
                    fullWidth
                    size="small"
                    multiline
                    rows={2}
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Template</InputLabel>
                    <Select
                      value={reportConfig.template}
                      label="Template"
                      onChange={(e) => setReportConfig({ ...reportConfig, template: e.target.value })}
                    >
                      {TEMPLATE_OPTIONS.map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <ViewList fontSize="small" color="action" />
                      <Typography variant="subtitle2" fontWeight={700}>Sections</Typography>
                      {reportConfig.sections.length > 0 && (
                        <Chip size="small" label={reportConfig.sections.length} sx={{ height: 20, fontSize: 11 }} />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => {
                        const id = `section-${Date.now()}`;
                        const newSection: ReportSection = { id, title: '', kind: 'manual', checkIds: [] };
                        setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                      }}>Manual</Button>
                      <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => {
                        const id = `section-${Date.now()}`;
                        const newSection: ReportSection = { id, title: '', kind: 'rule', rule: { limit: 10, sort: 'failing-first' } } as any;
                        setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                      }}>Rule</Button>
                    </Stack>
                  </Stack>
                  {reportConfig.sections.length === 0 && (
                    <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center', borderStyle: 'dashed', borderRadius: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">No sections yet. Add a manual or rule-based section to include checks.</Typography>
                    </Paper>
                  )}
                  {reportConfig.sections.map((s, idx) => (
                    <Paper key={s.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <TextField size="small" label="Section Title" value={s.title || ''} required error={!String(s.title || '').trim()} onChange={(e) => {
                            const updated = [...reportConfig.sections];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            setReportConfig((rc) => ({ ...rc, sections: updated }));
                          }} sx={{ flex: 1 }} />
                          <Chip size="small" label={s.kind} color={s.kind === 'manual' ? 'primary' : 'secondary'} variant="outlined" />
                          <Stack direction="row" spacing={0}>
                            <Tooltip title="Move up"><span>
                              <IconButton size="small" disabled={idx === 0} onClick={() => {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx - 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }}><ArrowUpward fontSize="small" /></IconButton>
                            </span></Tooltip>
                            <Tooltip title="Move down"><span>
                              <IconButton size="small" disabled={idx >= reportConfig.sections.length - 1} onClick={() => {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx + 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }}><ArrowDownward fontSize="small" /></IconButton>
                            </span></Tooltip>
                            <Tooltip title="Remove section"><span>
                              <IconButton size="small" color="error" onClick={() => {
                                setReportConfig((rc) => ({ ...rc, sections: rc.sections.filter((x) => x.id !== s.id) }));
                              }}><DeleteOutline fontSize="small" /></IconButton>
                            </span></Tooltip>
                          </Stack>
                        </Stack>
                        {s.kind === 'manual' ? (
                          <Stack spacing={1}>
                            <Autocomplete<CheckSearchOption>
                              options={manualResults[s.id] || []}
                              getOptionLabel={(opt: CheckSearchOption) => `${opt.name} (${opt.csiId} - ${opt.csiName})`}
                              loading={!!manualLoading[s.id]}
                              inputValue={manualSearch[s.id] || ''}
                              clearOnBlur
                              clearOnEscape
                              filterOptions={(x) => x}
                              onInputChange={(_: any, v: string) => handleManualInputChange(s.id, v)}
                              renderOption={(props, option) => (
                                <li {...props} key={option.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{option.name} ({option.csiId} - {option.csiName})</span>
                                  <Button size="small" startIcon={<Add />} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); addCheckToSection(idx, option); }}>Add</Button>
                                </li>
                              )}
                              onChange={(_: any, val: CheckSearchOption | null) => { if (val) addCheckToSection(idx, val); }}
                              renderInput={(params: any) => (
                                <TextField
                                  {...params}
                                  size="small"
                                  placeholder="Search checks to add..."
                                  InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <Search fontSize="small" sx={{ mr: 1 }} />,
                                  }}
                                />
                              )}
                            />
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
                              {((s as ManualReportSection).checkIds || []).map((cid) => {
                                const meta = checkMeta[cid];
                                const label = meta ? `${meta.name} (${meta.csiId})` : cid;
                                return <Chip key={cid} label={label} size="small" onDelete={() => removeCheckFromSection(idx, cid)} />;
                              })}
                              {((s as ManualReportSection).checkIds || []).length === 0 && (
                                <Typography variant="caption" color="text.secondary">No checks added. Use the search above.</Typography>
                              )}
                            </Stack>
                          </Stack>
                        ) : (
                          <RuleBuilder value={(s as any).rule || {}} onChange={(rule) => {
                            const updated = [...reportConfig.sections];
                            updated[idx] = { ...updated[idx], rule } as any;
                            setReportConfig((rc) => ({ ...rc, sections: updated }));
                          }} />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Schedule fontSize="small" color="action" />
                    <Typography variant="subtitle2" fontWeight={700}>Schedule</Typography>
                  </Stack>
                  <ScheduleEditor
                    enabled={reportConfig.schedule.enabled}
                    frequency={reportConfig.schedule.frequency as any}
                    time={reportConfig.schedule.time}
                    cron={reportConfig.schedule.cron}
                    timezone={reportConfig.schedule.timezone}
                    daysOfWeek={reportConfig.schedule.daysOfWeek}
                    daysOfMonth={reportConfig.schedule.daysOfMonth}
                    onChange={(n) => setReportConfig((rc) => ({
                      ...rc,
                      schedule: {
                        ...rc.schedule,
                        ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)),
                      }
                    }))}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        {/* Right Panel: Delivery & Preview */}
        <Grid item xs={12} md={6}>
          <Stack spacing={2} sx={{ position: 'sticky', top: 88 }}>
            <Card variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Email fontSize="small" color="action" />
                    <Typography variant="subtitle2" fontWeight={700}>Delivery</Typography>
                  </Stack>
                  <TextField
                    label="Subject"
                    value={reportConfig.subject || reportConfig.name}
                    onChange={(e) => setReportConfig((rc) => ({ ...rc, subject: e.target.value }))}
                    fullWidth
                    size="small"
                    placeholder="Defaults to report name"
                    inputProps={{ 'aria-label': 'Email Subject' }}
                  />
                  <RecipientsEditor
                    value={reportConfig.recipients}
                    onChange={(arr) => setReportConfig((rc) => ({ ...rc, recipients: arr }))}
                    reportId={draftId}
                  />
                  <Paper variant="outlined" sx={{ px: 1.5, py: 1, background: 'action.hover', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Schedule fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      {reportConfig.schedule.frequency}{reportConfig.schedule.time ? ` at ${reportConfig.schedule.time}` : ''}{reportConfig.schedule.timezone ? ` (${reportConfig.schedule.timezone})` : ''}
                    </Typography>
                  </Paper>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>Live Preview</Typography>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Refresh (Cmd+Enter)"><span>
                    <IconButton size="small" onClick={handleGeneratePreview} disabled={saving || generatingPreview}><Refresh fontSize="small" /></IconButton>
                  </span></Tooltip>
                  {previewContent && (
                    <Tooltip title="Expand preview"><span>
                      <IconButton size="small" onClick={() => setPreviewModalOpen(true)}><OpenInFull fontSize="small" /></IconButton>
                    </span></Tooltip>
                  )}
                  <Tooltip title="Send test email"><span>
                    <Button size="small" variant="outlined" startIcon={<Send />} onClick={() => setTestDialogOpen(true)} sx={{ ml: 0.5 }}>Test</Button>
                  </span></Tooltip>
                </Stack>
              </Stack>
              <CardContent sx={{ pt: 1, flex: 1 }}>
                <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 1.5 }}>
                  {generatingPreview ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Generating preview...</Typography>
                    </Box>
                  ) : previewContent ? (
                    <iframe title="Email Preview" style={{ border: 'none', width: '100%', height: 420, background: '#f8f9fa', display: 'block' }} srcDoc={(() => {
                      const anyWin = window as any;
                      if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                      const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return `<!DOCTYPE html><html><body style="font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;"><pre style="white-space:pre-wrap;margin:0;">${safe}</pre></body></html>`;
                    })()} />
                  ) : reportConfig.sections.length > 0 ? (
                    <Box sx={{ p: 2.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Sections will appear after the first save.</Typography>
                      {reportConfig.sections.map((s) => (
                        <Paper key={s.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>{s.title || 'Untitled Section'}</Typography>
                            <Chip size="small" label={s.kind} color={s.kind === 'manual' ? 'primary' : 'secondary'} variant="outlined" />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {s.kind === 'manual' ? `${(s as ManualReportSection).checkIds?.length || 0} checks` : 'Rule-based'}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  ) : (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">Add sections to see a preview.</Typography>
                    </Box>
                  )}
                </Paper>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      <Dialog open={previewModalOpen} onClose={() => setPreviewModalOpen(false)} maxWidth="md" fullWidth aria-labelledby="preview-modal-title">
        <DialogTitle id="preview-modal-title">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700}>{reportConfig.subject || reportConfig.name || 'Report Preview'}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`${reportConfig.recipients.length} recipient${reportConfig.recipients.length !== 1 ? 's' : ''}`} variant="outlined" />
              <Chip size="small" label={reportConfig.schedule.frequency} variant="outlined" />
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Paper sx={{ overflow: 'hidden' }}>
            {previewContent ? (
              <iframe title="Report Full Preview" style={{ border: 'none', width: '100%', height: 600, background: '#f8f9fa', display: 'block' }} srcDoc={(() => {
                const anyWin = window as any;
                if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<!DOCTYPE html><html><body style="font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;"><pre style="white-space:pre-wrap;margin:0;">${safe}</pre></body></html>`;
              })()} />
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No preview content available. Save the report and generate a preview first.</Typography>
              </Box>
            )}
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Test Email</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <RecipientsEditor value={testRecipients} onChange={setTestRecipients} />
            <Typography variant="caption" color="text.secondary">Enter one or more email addresses to receive a test. These will not be saved to the report.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<Send />}
            disabled={testRecipients.length === 0 || sendingTest}
            onClick={async () => {
              let id = draftId;
              if (!id) {
                id = await handleSaveReport();
              }
              if (!id) return;
              try {
                setSendingTest(true);
                await Promise.all(testRecipients.map((to) => reportsApi.sendTest(id!, to)));
                setTestDialogOpen(false);
                setSnack({ open: true, message: `Test email sent to ${testRecipients.length} recipient${testRecipients.length > 1 ? 's' : ''}`, severity: 'success' });
              } finally {
                setSendingTest(false);
              }
            }}
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ReportBuilder;
