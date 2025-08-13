import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Stack, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper, Tooltip, Skeleton, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReportById, fetchReportExecutions, pauseReport, resumeReport, duplicateReport, generatePreview, sendTestReport, runReportNow } from '@/store/slices/reportsSlice';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import { Preview, Edit, Pause, PlayArrow, ContentCopy, Send } from '@mui/icons-material';

const ReportDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: reports, generatingPreview, previewContent, executionsByReportId, loading, errorsById } = useAppSelector((s) => s.reports);
  const report = useMemo(() => reports.find((r) => r.id === id), [reports, id]);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [viewEmailOpen, setViewEmailOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<any | null>(null);

  const computeNextRun = (sched: any | undefined): string | null => {
    if (!sched || !sched.enabled) return null;
    const now = new Date();
    const time = (sched.time || '09:00').split(':');
    const target = new Date();
    target.setHours(parseInt(time[0] || '9', 10), parseInt(time[1] || '0', 10), 0, 0);
    if (sched.frequency === 'daily') {
      if (target <= now) target.setDate(target.getDate() + 1);
      return target.toLocaleString();
    }
    if (sched.frequency === 'weekly' && Array.isArray(sched.daysOfWeek) && sched.daysOfWeek.length) {
      const desired = sched.daysOfWeek[0];
      const day = now.getDay();
      let diff = desired - day;
      if (diff < 0 || (diff === 0 && target <= now)) diff += 7;
      target.setDate(target.getDate() + diff);
      return target.toLocaleString();
    }
    // Fallback
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.toLocaleString();
  };

  useEffect(() => {
    if (id) {
      dispatch(fetchReportById(id));
      dispatch(fetchReportExecutions(id));
    }
  }, [id, dispatch]);

  if (!id) return null;

  const notFound = id && errorsById && errorsById[id] === 404;

  return (
    <Box>
      {notFound && (
        <Box sx={{ mb: 2 }}>
          <ErrorState message="Report not found" onRetry={() => navigate('/checks/reports')} />
        </Box>
      )}
      <Card sx={{ mb: 2 }}>
        <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack spacing={0.5}>
            <Typography variant="h4" fontWeight={700}>{report?.name || 'Report Details'}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {report ? <Chip size="small" label={report.status} color={report.status === 'active' ? 'success' : report.status === 'paused' ? 'warning' : 'default'} /> : <Skeleton width={60} />}
              <Typography variant="body2" color="text.secondary">{report?.description || `ID: ${id}`}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Last sent: {report?.lastSent ? new Date(report.lastSent).toLocaleString() : '—'}</Typography>
              <Typography variant="caption" color="text.secondary">Next send: {report ? (computeNextRun(report.schedule) || '—') : '—'}</Typography>
              <Typography variant="caption" color="text.secondary">Owner: {report?.createdBy || '—'}</Typography>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1}>
          <Tooltip title="Edit">
            <span>
              <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/checks/reports/${id}/edit`)}>Edit</Button>
            </span>
          </Tooltip>
          {report?.status === 'paused' ? (
            <Tooltip title="Resume">
              <span>
                <Button size="small" variant="outlined" startIcon={<PlayArrow />} onClick={() => dispatch(resumeReport(id))}>Resume</Button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title="Pause">
              <span>
                <Button size="small" variant="outlined" startIcon={<Pause />} onClick={() => dispatch(pauseReport(id))}>Pause</Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Duplicate">
            <span>
              <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={() => dispatch(duplicateReport(id))}>Duplicate</Button>
            </span>
          </Tooltip>
          <Tooltip title="Send a test email">
            <span>
              <Button size="small" variant="outlined" startIcon={<Send />} onClick={() => dispatch(sendTestReport({ id })).then(() => setSnack({ open: true, message: 'Test email sent (mock)', severity: 'success' })).catch(() => setSnack({ open: true, message: 'Test email failed', severity: 'error' }))} aria-label="send test email">Send test</Button>
            </span>
          </Tooltip>
          <Tooltip title="Send now">
            <span>
              <Button size="small" variant="contained" startIcon={<Send />} onClick={async () => {
                try {
                  await dispatch(runReportNow(id)).unwrap();
                  setSnack({ open: true, message: 'Report sent (mock)', severity: 'success' });
                } catch {
                  setSnack({ open: true, message: 'Send failed', severity: 'error' });
                }
              }}>Send now</Button>
            </span>
          </Tooltip>
        </Stack>
        </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardHeader title="Overview"/>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Stack spacing={1}>
                      <Typography variant="body2">Schedule: {report ? `${report?.schedule?.frequency || '—'} ${report?.schedule?.time || ''}` : <Skeleton width={160} />}</Typography>
                      <Typography variant="body2">Next send: {report ? (computeNextRun(report.schedule) || '—') : (<Skeleton width={120} />)}</Typography>
                      <Typography variant="body2">Recipients: {report ? (report?.recipients?.length || 0) : (<Skeleton width={40} />)}</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Stack spacing={1}>
                      <Typography variant="body2">Owner: {report?.createdBy || '—'}</Typography>
                      <Typography variant="body2">Sections: {report ? (Array.isArray((report as any)?.sections) ? (report as any).sections.length : 0) : (<Skeleton width={40} />)}</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Sections</Typography>
                    <Stack spacing={1}>
                      {Array.isArray((report as any)?.sections) ? (
                        (report as any).sections.map((s: any) => (
                          <Stack key={s.id}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.title} <Chip size="small" label={s.kind} sx={{ ml: 1 }} /></Typography>
                            <Typography variant="caption" color="text.secondary">{s.kind === 'manual' ? `${(s.checkIds || []).length} checks` : 'Rule-based'}</Typography>
                          </Stack>
                        ))
                      ) : loading === 'loading' ? (
                        <>
                          <Skeleton height={24} />
                          <Skeleton height={24} width={200} />
                        </>
                      ) : (
                        <Typography variant="caption" color="text.secondary">This report uses a legacy flat list of checks.</Typography>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader title="Recent Sends"/>
              <CardContent>
                {Array.isArray(executionsByReportId?.[id]) && executionsByReportId![id].length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Time</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Recipients</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {executionsByReportId![id].map((exec: any) => (
                          <TableRow key={exec.id} hover>
                            <TableCell>{new Date(exec.executionTime).toLocaleString()}</TableCell>
                            <TableCell>
                              <Chip size="small" label={exec.status} color={exec.status === 'success' ? 'success' : exec.status === 'partial' ? 'warning' : 'error'} />
                            </TableCell>
                            <TableCell align="right">{exec.recipientCount}</TableCell>
                            <TableCell align="right">
                              <Button size="small" onClick={() => { setSelectedExecution(exec); setViewEmailOpen(true); }}>View email</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <EmptyState title="No sends yet" description="This report hasn't been sent yet." onAction={async () => { try { await dispatch(runReportNow(id)).unwrap(); } catch {} }} />
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ position: 'sticky', top: 88 }}>
            <CardHeader title="Live Preview" action={<Button size="small" onClick={async () => { await dispatch(generatePreview(id)); }} disabled={generatingPreview}>Preview now</Button>} />
            <CardContent>
              {generatingPreview ? (
                <Typography variant="body2" color="text.secondary">Generating preview…</Typography>
              ) : previewContent ? (
                <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                  <iframe
                    title="Report Preview"
                    style={{ border: 'none', width: '100%', height: 640, background: '#f3f4f6' }}
                    srcDoc={(() => {
                      const anyWin = window as any;
                      if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                      const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                    })()}
                  />
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">No preview yet.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={viewEmailOpen} onClose={() => setViewEmailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Sent Email</DialogTitle>
        <DialogContent dividers>
          {selectedExecution?.emailContent ? (
            <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
              <iframe title="Sent Email" style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }} srcDoc={selectedExecution.emailContent} />
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary">No email content captured for this execution.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewEmailOpen(false)}>Close</Button>
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

export default ReportDetailsPage;


