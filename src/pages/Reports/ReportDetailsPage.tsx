import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Stack, Tab, Tabs, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReportById, fetchReportExecutions, pauseReport, resumeReport, duplicateReport, generatePreview, sendTestReport } from '@/store/slices/reportsSlice';
import { Preview, Edit, Pause, PlayArrow, ContentCopy, Send } from '@mui/icons-material';

const ReportDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const { data: reports, generatingPreview, previewContent, executionsByReportId } = useAppSelector((s) => s.reports);
  const report = useMemo(() => reports.find((r) => r.id === id), [reports, id]);

  useEffect(() => {
    if (id) {
      dispatch(fetchReportById(id));
      dispatch(fetchReportExecutions(id));
    }
  }, [id, dispatch]);

  if (!id) return null;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Report Details</Typography>
          <Typography variant="body2" color="text.secondary">ID: {id}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/checks/reports/${id}/edit`)}>Edit</Button>
          {report?.status === 'paused' ? (
            <Button size="small" variant="outlined" startIcon={<PlayArrow />} onClick={() => dispatch(resumeReport(id))}>Resume</Button>
          ) : (
            <Button size="small" variant="outlined" startIcon={<Pause />} onClick={() => dispatch(pauseReport(id))}>Pause</Button>
          )}
          <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={() => dispatch(duplicateReport(id))}>Duplicate</Button>
          <Button size="small" variant="outlined" startIcon={<Send />} onClick={() => dispatch(sendTestReport({ id }))} title="Send a test email to the first recipient" aria-label="send test email">Send test</Button>
          <Button size="small" variant="outlined" startIcon={<Preview />} onClick={async () => {
            const resp = await (await import('@/services/api/reportsApi')).default.previewReport(id);
            try { (window as any).__REPORT_HTML_PREVIEW__ = resp?.html; } catch {}
            await dispatch(generatePreview(id));
          }} disabled={generatingPreview}>Preview</Button>
        </Stack>
      </Stack>

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Overview" />
          <Tab label="History" />
          <Tab label="Preview" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title={report?.name || '—'} subheader={report?.description} />
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="body2">Status: <Chip size="small" label={report?.status} /></Typography>
                      <Typography variant="body2">Schedule: {report?.schedule?.frequency} {report?.schedule?.time}</Typography>
                      <Typography variant="body2">Recipients: {report?.recipients?.length || 0}</Typography>
                      <Typography variant="body2">Sections: {Array.isArray((report as any)?.sections) ? (report as any).sections.length : 0}</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardHeader title="Sections" />
                  <CardContent>
                    <Stack spacing={1}>
                      {Array.isArray((report as any)?.sections) && (report as any).sections.map((s: any) => (
                        <Stack key={s.id}>
                          <Typography variant="subtitle2">{s.title} <Chip size="small" label={s.kind} sx={{ ml: 1 }} /></Typography>
                          <Typography variant="caption" color="text.secondary">{s.kind === 'manual' ? `${(s.checkIds || []).length} checks` : 'Rule-based'}</Typography>
                        </Stack>
                      ))}
                      {!Array.isArray((report as any)?.sections) && (
                        <Typography variant="caption" color="text.secondary">This report uses a legacy flat list of checks.</Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
          {tab === 1 && (
            <Box>
              {Array.isArray(executionsByReportId?.[id]) && executionsByReportId![id].length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Recipients</TableCell>
                        <TableCell align="right">Checks</TableCell>
                        <TableCell align="right">Failures</TableCell>
                        <TableCell align="right">Generation</TableCell>
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
                          <TableCell align="right">{exec.checksIncluded}</TableCell>
                          <TableCell align="right">{exec.checksFailures}</TableCell>
                          <TableCell align="right">{Math.round(exec.generationDuration)} ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography variant="body2" color="text.secondary">No executions yet.</Typography>
              )}
            </Box>
          )}
           {tab === 2 && (
            <Box>
               {generatingPreview ? (
                <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Generating preview…</Typography>
               ) : previewContent ? (
                <Card variant="outlined"><CardContent>
                  <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                    <iframe
                      title="Report Preview"
                      style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }}
                      srcDoc={(() => {
                        const anyWin = window as any;
                        if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                        const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                      })()}
                    />
                  </Paper>
                </CardContent></Card>
              ) : (
                <Typography variant="body2" color="text.secondary">No preview yet.</Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ReportDetailsPage;


