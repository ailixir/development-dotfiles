import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography, alpha, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { Preview, Send, ShowChart, Search } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { createReport, fetchReports, generatePreview, addSection, updateSection, removeSection, reorderSections } from '@/store/slices/reportsSlice';
import { useNavigate, useParams } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
import reportsApi from '@/services/api/reportsApi';
import RecipientsEditor from '@/components/reports/RecipientsEditor';
import ScheduleEditor from '@/components/reports/ScheduleEditor';
import RuleBuilder from '@/components/reports/RuleBuilder';
import type { ReportSection } from '@/types/reports/reportTypes';

const ReportBuilder: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams();
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
    sections: [] as ReportSection[]
  });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; csiName: string }>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (params.id && params.id !== 'new') {
      // load existing report for editing (best-effort)
      reportsApi.getById(params.id).then((r: any) => {
        setReportConfig({
          name: r.name,
          description: r.description,
          subject: r.name,
          frequency: r.schedule?.frequency || 'daily',
          recipients: (r.recipients || []).join(', '),
          includeCharts: true,
          template: r.template || 'executive-summary',
          checks: r.selectedChecks || (r.checks || []),
          sections: Array.isArray(r.sections) ? r.sections : [],
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
      if (e.key === '/') {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reportConfig, draftId]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await checksApi.getChecks({ page: 1, limit: 5, filters: { searchQuery: q } });
      const items = (res.data || []).map((c: any) => ({ id: c.id, name: c.name, csiName: c.csiName }));
      setSearchResults(items);
    } finally { setSearchLoading(false); }
  };

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
      const payload = {
        name: reportConfig.name || 'Untitled Report',
        description: reportConfig.description,
        subject: reportConfig.subject || reportConfig.name || 'Checks Report',
        frequency: reportConfig.frequency as any,
        recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        checks: reportConfig.checks,
        sections: reportConfig.sections,
      };
      const created = await dispatch(createReport(payload as any)).unwrap();
      setDraftId(created.id);
      return created.id;
    } catch {
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
        } as any);
      } catch {}
    }
    await dispatch(generatePreview(id));
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>{params.id === 'new' ? 'Create report' : reportConfig.name || 'Edit report'}</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Generate Preview (⌘⏎)"><span>
            <IconButton size="small" onClick={handleGeneratePreview} disabled={saving}><Preview /></IconButton>
          </span></Tooltip>
          <Tooltip title="Save Draft (⌘S)"><span>
            <IconButton size="small" onClick={handleSaveReport} disabled={saving}><Send /></IconButton>
          </span></Tooltip>
        </Stack>
      </Stack>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Configuration" />
            <CardContent>
              <Stack spacing={2}>
                <TextField label="Email Subject" value={reportConfig.subject} onChange={(e) => setReportConfig({ ...reportConfig, subject: e.target.value })} fullWidth />
                <TextField label="Report Name" value={reportConfig.name} onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })} fullWidth />
                <TextField label="Description" value={reportConfig.description} onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })} fullWidth multiline rows={3} />
                <Divider />
                <Typography variant="subtitle2">Include Checks (legacy flat)</Typography>
                <TextField inputRef={searchInputRef} placeholder="Search checks (press '/' to focus)" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
                {searchLoading ? <Typography variant="caption" color="text.secondary">Searching…</Typography> : (
                  searchResults.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      {searchResults.map((r) => (
                        <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2">{r.name}</Typography>
                          <Button size="small" onClick={() => handleAddCheck(r.id)}>Add</Button>
                        </Stack>
                      ))}
                    </Paper>
                  )
                )}
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {reportConfig.checks.map((id) => (
                    <Chip key={id} label={id} size="small" onDelete={() => handleRemoveCheck(id)} />
                  ))}
                </Stack>
                <Divider />
                <Typography variant="subtitle2">Sections (grouped content)</Typography>
                <Stack spacing={1}>
                  {reportConfig.sections.length === 0 && (
                    <Typography variant="caption" color="text.secondary">No sections yet. Add manual or rule-based sections.</Typography>
                  )}
                  {reportConfig.sections.map((s, idx) => (
                    <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField size="small" label="Title" value={s.title} onChange={(e) => {
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
                            <TextField size="small" placeholder="Search checks to add to this section" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
                            {searchLoading ? <Typography variant="caption" color="text.secondary">Searching…</Typography> : (
                              searchResults.length > 0 && (
                                <Paper variant="outlined" sx={{ p: 1 }}>
                                  {searchResults.map((r) => (
                                    <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between">
                                      <Typography variant="body2">{r.name}</Typography>
                                      <Button size="small" onClick={() => {
                                        const updated = [...reportConfig.sections];
                                        const target = updated[idx];
                                        const ids = new Set(target.checkIds || []);
                                        ids.add(r.id);
                                        updated[idx] = { ...target, checkIds: Array.from(ids) };
                                        setReportConfig((rc) => ({ ...rc, sections: updated }));
                                      }}>Add</Button>
                                    </Stack>
                                  ))}
                                </Paper>
                              )
                            )}
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {(s.checkIds || []).map((id) => (
                                <Chip key={id} label={id} size="small" onDelete={() => {
                                  const updated = [...reportConfig.sections];
                                  const target = updated[idx];
                                  updated[idx] = { ...target, checkIds: (target.checkIds || []).filter((x) => x !== id) };
                                  setReportConfig((rc) => ({ ...rc, sections: updated }));
                                }} />
                              ))}
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
                <ScheduleEditor enabled={true} frequency={reportConfig.frequency as any} time={undefined} onChange={(n) => setReportConfig((rc) => ({ ...rc, frequency: (n.frequency as any) || rc.frequency }))} />
                <Divider />
                <RecipientsEditor value={(reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean)} onChange={(arr) => setReportConfig((rc) => ({ ...rc, recipients: arr.join(', ') }))} reportId={draftId} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader title="Live Preview" />
            <CardContent sx={{ flex: 1 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>{reportConfig.subject || reportConfig.name || 'Report Preview'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>To: {reportConfig.recipients || 'recipients@citi.com'} • {new Date().toLocaleDateString()}</Typography>
                {generatingPreview ? (
                  <Typography variant="body2" color="text.secondary">Generating preview…</Typography>
                ) : previewContent ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{previewContent}</pre>
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
    </Box>
  );
};

export default ReportBuilder;

