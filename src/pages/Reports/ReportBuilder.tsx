import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography, alpha, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Autocomplete } from '@mui/material';
import { Refresh, Send, ShowChart, Search, Save, Add, CheckCircle, Info } from '@mui/icons-material';
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
    frequency: 'daily',
    recipients: '',
    includeCharts: true,
    template: 'executive-summary',
    checks: [] as string[],
    sections: [] as ReportSection[],
    schedule: { frequency: 'daily', time: '18:00', timezone: 'EST', enabled: true } as ReportSchedule,
  });
  // Load draft from localStorage
  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setReportConfig((rc) => ({ ...rc, ...parsed }));
        }
      }
    } catch {}
  }, []);

  // Persist draft to localStorage
  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      const toSave = {
        name: reportConfig.name,
        description: reportConfig.description,
        subject: reportConfig.subject,
        frequency: reportConfig.frequency,
        recipients: reportConfig.recipients,
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        checks: reportConfig.checks,
        sections: reportConfig.sections,
        schedule: reportConfig.schedule,
      };
      window.localStorage.setItem(key, JSON.stringify(toSave));
    } catch {}
  }, [reportConfig]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingIndicator, setSavingIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRecipients, setTestRecipients] = useState<string[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  // Manual section selector state (per section)
  const [checkMeta, setCheckMeta] = useState<Record<string, { name: string; csiId: string; csiName: string }>>({});
  const [manualSearch, setManualSearch] = useState<Record<string, string>>({});
  const [manualResults, setManualResults] = useState<Record<string, CheckSearchOption[]>>({});
  const [manualLoading, setManualLoading] = useState<Record<string, boolean>>({});
  const searchTimersRef = useRef<Record<string, any>>({});
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (params.id) {
      // load existing report for editing (best-effort)
      reportsApi.getById(params.id).then((r: any) => {
        const safeSections = Array.isArray(r.sections)
          ? r.sections.map((s: any) => ({
              id: s.id,
              title: s.title ?? '',
              kind: s.kind,
              checkIds: Array.isArray(s.checkIds) ? s.checkIds : s.kind === 'manual' ? [] : undefined,
              rule: s.kind === 'rule' ? (s.rule || {}) : undefined,
            }))
          : [];
        setReportConfig({
          name: r.name ?? '',
          description: r.description ?? '',
          subject: r.name ?? '',
          frequency: r.schedule?.frequency || 'daily',
          recipients: Array.isArray(r.recipients) ? r.recipients.join(', ') : (r.recipients || ''),
          includeCharts: true,
          template: r.template || 'executive-summary',
          checks: r.selectedChecks || (r.checks || []),
          sections: safeSections,
          schedule: r.schedule || { frequency: 'daily', time: '18:00', timezone: 'EST', enabled: true },
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

  // Unsaved changes protection
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const isDirty = true; // lightweight: assume dirty when this component is mounted and config can be changed
    if (isDirty) {
      window.addEventListener('beforeunload', beforeUnload);
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

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

  // Auto-refresh preview when subject or sections change (debounced)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void handleGeneratePreview();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [reportConfig.subject, reportConfig.sections]);

  const handleAddCheck = (id: string) => {
    if (!reportConfig.checks.includes(id)) {
      setReportConfig((rc) => ({ ...rc, checks: [...rc.checks, id] }));
    }
  };
  const handleRemoveCheck = (id: string) => {
    setReportConfig((rc) => ({ ...rc, checks: rc.checks.filter((x) => x !== id) }));
  };

  const handleSaveReport = async () => {
    try {
      setSaving(true);
      setSavingIndicator('saving');
      const payload = {
        name: reportConfig.name || 'Untitled Report',
        description: reportConfig.description,
        subject: reportConfig.subject || reportConfig.name || 'Checks Report',
        frequency: reportConfig.frequency as any,
        recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        sections: reportConfig.sections,
        schedule: reportConfig.schedule,
      };
      if (draftId || isEditMode) {
        const idToUpdate = draftId || (params.id as string);
        try {
          const updated = await reportsApi.updateReport(idToUpdate, payload as any);
          setDraftId(updated.id);
          setSavingIndicator('saved');
          window.setTimeout(() => setSavingIndicator('idle'), 1500);
          return updated.id;
        } catch (e: any) {
          // Fallback: if report not found (e.g., mock reset), create a new one seamlessly
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
        await reportsApi.updateReport(id, {
          name: reportConfig.name || 'Untitled Report',
          description: reportConfig.description,
          subject: reportConfig.subject || reportConfig.name || 'Checks Report',
          frequency: reportConfig.frequency as any,
          recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
          includeCharts: reportConfig.includeCharts,
          template: reportConfig.template,
          checks: reportConfig.checks,
          sections: reportConfig.sections,
          schedule: reportConfig.schedule,
        } as any);
      } catch (e) {
        console.error('Failed to update before preview', e);
        setSnack({ open: true, message: 'Could not sync latest edits before preview', severity: 'error' });
      }
    }
    try {
      await dispatch(generatePreview(id)).unwrap();
    } catch {
      setSnack({ open: true, message: 'Preview failed to generate', severity: 'error' });
    }
  };

  // Debounced autosave when editing
  useEffect(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void handleSaveReport();
    }, 1200) as unknown as number;
    return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current); };
  }, [reportConfig.name, reportConfig.description, reportConfig.subject, reportConfig.sections, reportConfig.schedule, reportConfig.recipients, reportConfig.template, reportConfig.includeCharts]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {isEditMode ? `Edit Report${reportConfig.name ? `: ${reportConfig.name}` : ''}` : 'Create Report'}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Save (⌘S)"><span>
            <Button variant="contained" size="small" startIcon={<Save />} onClick={handleSaveReport} disabled={saving} aria-label="save report">
              {saving ? 'Saving…' : 'Save Report'}
            </Button>
          </span></Tooltip>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1 }} aria-live="polite" role="status">
            {savingIndicator === 'saving' && <>
              <Info fontSize="small" color="info" />
              <Typography variant="caption" color="text.secondary">Saving…</Typography>
            </>}
            {savingIndicator === 'saved' && <>
              <CheckCircle fontSize="small" color="success" />
              <Typography variant="caption" color="text.secondary">All changes saved</Typography>
            </>}
          </Stack>
        </Stack>
      </Stack>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Configuration" />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Report Name"
                  value={reportConfig.name}
                  onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })}
                  fullWidth
                  required
                  error={!reportConfig.name.trim()}
                  helperText={!reportConfig.name.trim() ? 'Name is required' : ' '}
                  inputProps={{ 'aria-label': 'Report Name' }}
                />
                <TextField label="Description" value={reportConfig.description} onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })} fullWidth multiline rows={3} />
                {!reportConfig.name && (
                  <Typography variant="caption" color="error">Report name is required to save.</Typography>
                )}
                <Divider />
                <Typography variant="subtitle2">Check Sections (grouped content)</Typography>
                <Stack spacing={1}>
                  {reportConfig.sections.length === 0 && (
                    <Typography variant="caption" color="text.secondary">No sections yet. Add manual or rule-based sections.</Typography>
                  )}
                  {reportConfig.sections.map((s, idx) => (
                    <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField size="small" label="Title" value={s.title || ''} required error={!String(s.title || '').trim()} helperText={!String(s.title || '').trim() ? 'Title is required' : ' '} onChange={(e) => {
                              const updated = [...reportConfig.sections];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setReportConfig((rc) => ({ ...rc, sections: updated }));
                            }} sx={{ minWidth: 240 }} />
                            <Chip size="small" label={s.kind} />
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => {
                              if (idx > 0) {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx - 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }
                            }}>Up</Button>
                            <Button size="small" onClick={() => {
                              if (idx < (reportConfig.sections.length - 1)) {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx + 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }
                            }}>Down</Button>
                            <Button size="small" color="error" onClick={() => {
                              setReportConfig((rc) => ({ ...rc, sections: rc.sections.filter((x) => x.id !== s.id) }));
                            }}>Remove</Button>
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
                                  placeholder="Search checks to add to this section"
                                  InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <Search fontSize="small" sx={{ mr: 1 }} />,
                                  }}
                                />
                              )}
                            />
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
                              {((s as ManualReportSection).checkIds || []).map((id) => {
                                const meta = checkMeta[id];
                                const label = meta ? `${meta.name} (${meta.csiId} - ${meta.csiName})` : id;
                                return (
                                  <Chip key={id} label={label} size="small" onDelete={() => removeCheckFromSection(idx, id)} />
                                );
                              })}
                            </Stack>
                          </Stack>
                        ) : (
                          <RuleBuilder value={s.rule || {}} onChange={(rule) => {
                            const updated = [...reportConfig.sections];
                            updated[idx] = { ...updated[idx], rule } as any;
                            setReportConfig((rc) => ({ ...rc, sections: updated }));
                          }} />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" onClick={() => {
                      const id = `section-${Date.now()}`;
                      const newSection: ReportSection = { id, title: 'New Manual Section', kind: 'manual', checkIds: [] };
                      setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                    }}>Add Manual Section</Button>
                    <Button variant="outlined" size="small" onClick={() => {
                      const id = `section-${Date.now()}`;
                      const newSection: ReportSection = { id, title: 'New Rule Section', kind: 'rule', rule: { limit: 10, sort: 'failing-first' } } as any;
                      setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                    }}>Add Rule-based Section</Button>
                  </Stack>
                </Stack>
                <Divider />
                <ScheduleEditor
                  enabled={reportConfig.schedule.enabled}
                  frequency={reportConfig.schedule.frequency as any}
                  time={reportConfig.schedule.time}
                  cron={reportConfig.schedule.cron}
                  timezone={reportConfig.schedule.timezone}
                  daysOfWeek={(reportConfig.schedule as any)?.daysOfWeek}
                  daysOfMonth={(reportConfig.schedule as any)?.daysOfMonth}
                  onChange={(n) => setReportConfig((rc) => ({
                    ...rc,
                    schedule: {
                      ...rc.schedule,
                      enabled: typeof n.enabled === 'boolean' ? n.enabled : rc.schedule.enabled,
                      frequency: (n.frequency as any) || rc.schedule.frequency,
                      time: n.time || rc.schedule.time,
                      cron: n.cron || rc.schedule.cron,
                      timezone: n.timezone || rc.schedule.timezone,
                      daysOfWeek: (n as any).daysOfWeek || (rc.schedule as any).daysOfWeek,
                      daysOfMonth: (n as any).daysOfMonth || (rc.schedule as any).daysOfMonth,
                    }
                  }))}
                />
                {/* Recipients removed from left pane per requirements; now lives in Live Preview card */}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader title="Live Preview" action={
              <Tooltip title="Refresh Preview (⌘⏎)"><span>
                <IconButton size="small" onClick={handleGeneratePreview} disabled={saving}><Refresh /></IconButton>
              </span></Tooltip>
            } />
            <CardContent sx={{ flex: 1 }}>
              <Stack spacing={2} sx={{ mb: 2 }}>
                <TextField label="Email Subject" value={reportConfig.subject} onChange={(e) => setReportConfig({ ...reportConfig, subject: e.target.value })} fullWidth />
                <RecipientsEditor value={(reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean)} onChange={(arr) => setReportConfig((rc) => ({ ...rc, recipients: arr.join(', ') }))} reportId={draftId} />
              </Stack>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>{reportConfig.subject || reportConfig.name || 'Report Preview'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  To: {reportConfig.recipients || 'recipients@citi.com'} • {new Date().toLocaleDateString()} • Schedule: {reportConfig.schedule.frequency}{reportConfig.schedule.time ? ` at ${reportConfig.schedule.time}` : ''}{reportConfig.schedule.timezone ? ` ${reportConfig.schedule.timezone}` : ''}
                </Typography>
                 {generatingPreview ? (
                  <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Generating preview…</Typography>
                ) : (reportConfig.sections || []).length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      No sections configured yet.
                    </Typography>
                    <Typography variant="body2">
                      Add a manual or rule-based section to build your report preview.
                    </Typography>
                  </Paper>
                ) : previewContent ? (
                  <Paper variant="outlined" sx={{ p: 0, mb: 2, overflow: 'hidden' }}>
                    <iframe title="Email Preview" style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }} srcDoc={(() => {
                      const anyWin = window as any;
                      if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                      const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                    })()} />
                  </Paper>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ mb: 2 }}>{reportConfig.description || 'Your automated health monitoring report is ready.'}</Typography>
                    <Stack spacing={2}>
                      {(reportConfig.sections || []).map((s) => (
                        <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{s.title}</Typography>
                          {s.kind === 'manual' ? (
                            <Typography variant="caption" color="text.secondary">{s.checkIds?.length || 0} checks will be included</Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">Rule-based section; contents resolved at send time</Typography>
                          )}
                        </Paper>
                      ))}
                    </Stack>
                  </>
                )}
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    {/* Send Test Dialog */}
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
              setSnack({ open: true, message: `Test email sent to ${testRecipients.length} recipient${testRecipients.length > 1 ? 's' : ''}` , severity: 'success' });
            } finally {
              setSendingTest(false);
            }
          }}
        >
          {sendingTest ? 'Sending…' : 'Send Test'}
        </Button>
      </DialogActions>
    </Dialog>
    {/* Toast (aligned with Studio) */}
    <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
        {snack.message}
      </Alert>
    </Snackbar>
    </Box>
  );
};

export default ReportBuilder;


