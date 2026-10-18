import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Link, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow,
  TextField, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { studioSchedulesApi } from '@/services/api/studioSchedulesApi';
import type { TestDraftHeader } from '@/types/studio/studioTypes';
import type { ScheduleCapabilities, ScheduleOccurrencePage, SchedulePreview, StudioSchedule } from '@/types/studio/studioScheduling';
import { notifyScheduleChanged, occurrenceLabel, offsetLabel, scheduleError, scheduleLabel } from './schedulePresentation';
import { runDetailsPath } from '@/components/studio/runs/runLinks';

const PRESETS = [
  ['0 */5 * * * *', 'Every 5 minutes'], ['0 */15 * * * *', 'Every 15 minutes'],
  ['0 0 * * * *', 'Every hour'], ['DAILY', 'Daily'], ['CUSTOM', 'Custom cron'],
] as const;
const EMPTY_HISTORY: ScheduleOccurrencePage = { data: [], page: 0, size: 10, totalElements: 0, totalPages: 0 };

export interface StudioScheduleDialogProps {
  test: TestDraftHeader | null;
  dirty?: boolean;
  onClose: () => void;
}

function ScheduleContent({ test: initialTest, dirty = false, onClose, onBusyChange }: StudioScheduleDialogProps & { test: TestDraftHeader; onBusyChange: (busy: boolean) => void }) {
  const location = useLocation();
  const studioIndex = location.pathname.indexOf('/studio');
  const runsPath = `${studioIndex >= 0 ? location.pathname.slice(0, studioIndex) : '/checks'}/studio/runs`;
  const [test, setTest] = useState<TestDraftHeader>(initialTest);
  const [schedule, setSchedule] = useState<StudioSchedule | null>(null);
  const [capabilities, setCapabilities] = useState<ScheduleCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [mutation, setMutation] = useState<string | null>(null);
  const [cron, setCron] = useState('0 */5 * * * *');
  const [zone, setZone] = useState('UTC');
  const [principal, setPrincipal] = useState('');
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<ReturnType<typeof scheduleError> | null>(null);
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReload, setHistoryReload] = useState(0);
  const cronInput = useRef<HTMLInputElement>(null);
  const zoneInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onBusyChange(mutation !== null); return () => onBusyChange(false); }, [mutation, onBusyChange]);
  useEffect(() => {
    if (mutation !== null) return;
    if (error?.field === 'cron') cronInput.current?.focus();
    if (error?.field === 'zone') zoneInput.current?.focus();
  }, [error, mutation]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setAcknowledged(false); setRemoveConfirm(false);
    Promise.all([studioSchedulesApi.capabilities(initialTest.id), studioSchedulesApi.get(initialTest.id), studioApi.getTest(initialTest.id)])
      .then(([caps, value, saved]) => {
        if (cancelled) return;
        setCapabilities(caps); setSchedule(value); setTest(saved);
        setCron(value?.cronExpression ?? '0 */5 * * * *'); setZone(value?.timeZone ?? 'UTC');
        setPrincipal(value?.executionPrincipal ?? caps.availableExecutionPrincipals[0] ?? '');
      }).catch(failure => { if (!cancelled) setError(scheduleError(failure)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialTest.id, reload]);

  useEffect(() => {
    if (loading || !capabilities) return undefined;
    const abort = new AbortController();
    setPreview(null); setPreviewError(null); setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      studioSchedulesApi.preview({ cronExpression: cron, timeZone: zone }, abort.signal)
        .then(value => { if (!abort.signal.aborted) setPreview(value); })
        .catch(failure => { if (!abort.signal.aborted) setPreviewError(scheduleError(failure).message); })
        .finally(() => { if (!abort.signal.aborted) setPreviewLoading(false); });
    }, 250);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [cron, zone, loading, capabilities]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true); setHistoryError(null);
    studioSchedulesApi.occurrences(initialTest.id, historyPage, 10).then(value => {
      if (!cancelled) setHistory(value);
    }).catch(() => { if (!cancelled) setHistoryError('Occurrence history could not be loaded.'); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [initialTest.id, historyPage, historyReload]);

  const canManage = capabilities?.enabled === true && capabilities.canManage;
  const busy = loading || mutation !== null;
  const configChanged = !!schedule && (cron !== schedule.cronExpression || zone !== schedule.timeZone || principal !== schedule.executionPrincipal);
  const uncertainty = schedule?.unacknowledgedUncertaintyExecutionIds ?? [];
  // The API can reveal newly terminal uncertainty before the producer persists BLOCKED.
  // Presentation blocks immediately, without writing schedule state or changing author intent.
  const effectiveBlocked = schedule?.state === 'BLOCKED' || (!!schedule?.requestedEnabled && uncertainty.length > 0);
  // The server derives readiness: a confirmed revision that is no longer READY no longer matches the saved steps.
  const confirmedSourceChanged = !!test.confirmedRevisionId && test.readiness !== 'READY';
  const blockedWithoutNewConfirmation = schedule?.blockedCode === 'LEARN_REQUIRED' && schedule.activatedRevisionId === test.confirmedRevisionId;
  const canSave = canManage && !busy && !dirty && capabilities.availableExecutionPrincipals.includes(principal) && preview !== null && !previewLoading;
  const canResume = canManage && !busy && !dirty && !configChanged && !confirmedSourceChanged && !blockedWithoutNewConfirmation && !!test.confirmedRevisionId &&
    capabilities.availableExecutionPrincipals.includes(principal) && (uncertainty.length === 0 || acknowledged);
  const preset = PRESETS.some(([value]) => value === cron) ? cron : /^0 \d+ \d+ \* \* \*$/.test(cron) ? 'DAILY' : 'CUSTOM';
  const daily = cron.split(' ');

  const mutate = async (label: string, request: () => Promise<StudioSchedule | null>, message: string) => {
    setMutation(label); setError(null); setNotice('');
    try {
      const value = await request();
      if (!active.current) return;
      setSchedule(value); setAcknowledged(false); setRemoveConfirm(false); setNotice(message);
      if (value) { setCron(value.cronExpression); setZone(value.timeZone); setPrincipal(value.executionPrincipal); }
      notifyScheduleChanged(test.id); setHistoryReload(value => value + 1);
    } catch (failure) { if (active.current) setError(scheduleError(failure)); }
    finally { if (active.current) setMutation(null); }
  };
  const reloadSaved = () => { setReload(value => value + 1); setHistoryReload(value => value + 1); setNotice(''); };

  return <>
    <DialogTitle id="studio-schedule-title">Manage schedule · {initialTest.name}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography variant="body2">CSI {test.csiId ?? 'Unavailable'} · {test.environment}</Typography>
        <Box role="status" aria-live="polite">{notice && <Alert severity="success" role="presentation">{notice}</Alert>}</Box>
        {error && <Alert severity="error" action={<Button color="inherit" onClick={reloadSaved} disabled={busy}>Reload</Button>}>{error.message}</Alert>}
        {loading && <Box role="status"><CircularProgress size={24} aria-label="Loading schedule" /></Box>}
        {!loading && capabilities && <>
          {!capabilities.enabled && <Alert severity="info">Scheduling disabled. Existing schedules and occurrences remain inspectable.</Alert>}
          {!capabilities.canManage && <Alert severity="info">You do not have permission to change this schedule.</Alert>}
          {capabilities.localAuthorizationOnly && <Alert severity="info">Local authorization only. These execution identities do not establish production authorization.</Alert>}
          {!capabilities.availableExecutionPrincipals.length && <Alert severity="warning">No approved unattended execution identity is available for this test and environment.</Alert>}
          {dirty && <Alert severity="warning">Save your changes before creating or resuming a schedule. Pausing and removal remain available.</Alert>}
          <Typography variant="subtitle2" component="p">Schedule: {scheduleLabel(schedule)}</Typography>
          {schedule && effectiveBlocked && <Alert severity="warning">{uncertainty.length > 0 || schedule.blockedCode === 'UNCERTAIN_EXECUTION'
            ? 'Investigate the uncertain runs before explicitly resuming future slots.'
            : 'If the saved steps need learning, resume only after a Run has learned them: reload, then explicitly Resume. Learning alone does not restart scheduling.'}</Alert>}
          {schedule?.state === 'ENABLED' && !effectiveBlocked && schedule.nextDueAt && <Typography variant="body2">Next scheduled due: {new Date(schedule.nextDueAt).toISOString()} · {schedule.timeZone}</Typography>}
          <TextField select label="Frequency" value={preset} disabled={!canManage || busy} onChange={event => {
            const value = event.target.value;
            if (value === 'DAILY') setCron('0 0 9 * * *');
            else if (value === 'CUSTOM') setCron('0 */10 * * * *');
            else setCron(value);
          }}>{PRESETS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          {preset === 'DAILY' && <TextField label="Daily time" type="time" value={`${String(daily[2]).padStart(2, '0')}:${String(daily[1]).padStart(2, '0')}`} InputLabelProps={{ shrink: true }}
            disabled={!canManage || busy} onChange={event => { const [hour, minute] = event.target.value.split(':'); if (hour && minute) setCron(`0 ${Number(minute)} ${Number(hour)} * * *`); }} />}
          <TextField label="Cron expression" inputRef={cronInput} value={cron} onChange={event => setCron(event.target.value)} disabled={!canManage || busy}
            error={error?.field === 'cron'} helperText="second minute hour day-of-month month day-of-week · seconds must be 0; five fields are normalized." />
          <TextField label="Time zone" inputRef={zoneInput} value={zone} onChange={event => setZone(event.target.value)} disabled={!canManage || busy}
            error={error?.field === 'zone'} helperText="IANA zone, for example UTC or America/New_York. Runs once per local slot; nonexistent daylight saving times are skipped." />
          <TextField select label="Execution identity" value={principal} onChange={event => setPrincipal(event.target.value)} disabled={!canManage || busy || !capabilities.availableExecutionPrincipals.length}>
            {principal && !capabilities.availableExecutionPrincipals.includes(principal) && <MenuItem value={principal}>{principal} · unavailable</MenuItem>}
            {capabilities.availableExecutionPrincipals.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </TextField>
          <Box aria-live="polite">
            <Typography variant="subtitle2" component="h3">Next five scheduled slots</Typography>
            <Typography variant="caption">Preview is advisory; browser start depends on readiness and capacity.</Typography>
            {previewLoading && <Typography>Calculating next runs…</Typography>}
            {previewError && <Alert severity="warning">{previewError}</Alert>}
            {preview && <Box component="ol" sx={{ pl: 3 }}>{preview.occurrences.map(slot => <Typography component="li" variant="body2" key={slot.scheduledAt}>
              {slot.localScheduledAt.replace('T', ' ')} · {preview.timeZone} ({offsetLabel(slot.offsetSeconds)}) · {slot.scheduledAt}
            </Typography>)}</Box>}
            {preview && <Typography variant="caption" component="div">Rule: {preview.normalizedCronExpression}</Typography>}
          </Box>
          <Typography variant="body2">Scheduled runs repeat the saved, learned steps and settings. Changing scheduling settings leaves the schedule Paused; explicitly Resume when ready.</Typography>
          {test.confirmedRevisionId ? <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Current learned revision: {test.confirmedRevisionId}</Typography>
            : <Alert severity="info">Resume becomes available once a Run has learned the saved steps.</Alert>}
          {schedule?.activatedBy && <Typography variant="caption">Last activated by {schedule.activatedBy} at {schedule.activatedAt}</Typography>}
          {configChanged && <Alert severity="info">Save scheduling changes before resuming.</Alert>}
          {!!uncertainty.length && <Box>
            <Typography variant="body2">We cannot tell whether these browsers ran. Investigate their effects before approving future scheduled runs.</Typography>
            {uncertainty.map(id => <Box key={id}><Link component={RouterLink} to={runDetailsPath(runsPath, id)}>Inspect run {id}</Link></Box>)}
            <FormControlLabel control={<Checkbox checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={!canManage || busy} />}
              label="I investigated these uncertain runs and acknowledge their possible effects. Resume permits future slots only." />
          </Box>}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="contained" disabled={!canSave || (!!schedule && !configChanged)} onClick={() => {
              const body = { cronExpression: cron, timeZone: zone, executionPrincipal: principal };
              void mutate('save', () => schedule ? studioSchedulesApi.update(test.id, { ...body, expectedVersion: schedule.version }) : studioSchedulesApi.create(test.id, body), 'Schedule saved. Paused until explicitly resumed.');
            }}>{mutation === 'save' ? 'Saving…' : schedule ? 'Save changes' : 'Create paused schedule'}</Button>
            {schedule?.requestedEnabled && <Button disabled={!canManage || busy} onClick={() => {
              void mutate('pause', () => studioSchedulesApi.enable(test.id, { expectedVersion: schedule.version, enabled: false }), 'Schedule paused. Runs already accepted remain under existing dispatch and recovery.');
            }}>Pause schedule</Button>}
            {schedule && (schedule.state !== 'ENABLED' || effectiveBlocked) && <Button disabled={!canResume} onClick={() => {
              void mutate('resume', () => studioSchedulesApi.enable(test.id, { expectedVersion: schedule.version, enabled: true,
                confirmedRevisionId: test.confirmedRevisionId!, acknowledgedUncertaintyExecutionIds: uncertainty }), 'Schedule resumed for future slots.');
            }}>Resume schedule</Button>}
            {schedule && <Button color="error" disabled={!canManage || busy} onClick={() => setRemoveConfirm(true)}>Remove schedule</Button>}
          </Stack>
          {removeConfirm && schedule && <Alert severity="warning">
            Remove schedule for “{test.name}”? Future scheduled runs stop. The test and history remain; accepted runs are not cancelled.
            <Stack direction="row" gap={1} sx={{ mt: 1 }}><Button disabled={busy} onClick={() => setRemoveConfirm(false)}>Keep schedule</Button>
              <Button color="error" disabled={busy} onClick={() => { void mutate('remove', async () => { await studioSchedulesApi.remove(test.id, schedule.version); return null; }, 'Schedule removed. History remains.'); }}>Confirm removal</Button></Stack>
          </Alert>}
        </>}
        <Typography variant="h6" component="h3">Occurrence history</Typography>
        {historyLoading && <Typography role="status">Loading occurrences…</Typography>}
        {historyError && <Alert severity="error" action={<Button onClick={() => setHistoryReload(value => value + 1)}>Retry</Button>}>{historyError}</Alert>}
        {!historyLoading && !historyError && !history.data.length && <Typography>No recorded occurrences.</Typography>}
        {!!history.data.length && <Box sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Schedule occurrences"><TableHead><TableRow>
          <TableCell>Scheduled due</TableCell><TableCell>Outcome</TableCell><TableCell>Evidence</TableCell>
        </TableRow></TableHead><TableBody>{history.data.map(row => <TableRow key={row.id}>
          <TableCell><Typography variant="body2">{row.localScheduledAt.replace('T', ' ')} · {row.timeZone} ({offsetLabel(row.offsetSeconds)})</Typography>
            <Typography variant="caption">{row.scheduledAt}</Typography>
            {row.activatedBy && <Typography variant="caption" component="div">Activated by {row.activatedBy} at {row.activatedAt}</Typography>}</TableCell>
          <TableCell>{occurrenceLabel(row, capabilities)}</TableCell><TableCell>{row.executionId
            ? <Link component={RouterLink} to={runDetailsPath(runsPath, row.executionId)}>View run</Link>
            : <Typography variant="caption">No browser run accepted</Typography>}</TableCell>
        </TableRow>)}</TableBody></Table></Box>}
        <TablePagination component="div" count={history.totalElements} page={historyPage} rowsPerPage={10} rowsPerPageOptions={[10]}
          onPageChange={(_, page) => setHistoryPage(page)} />
      </Stack>
    </DialogContent>
    <DialogActions><Button disabled={mutation !== null} onClick={onClose}>Close</Button></DialogActions>
  </>;
}

export function StudioScheduleDialog(props: StudioScheduleDialogProps) {
  const [busy, setBusy] = useState(false);
  return <Dialog open={props.test !== null} onClose={() => { if (!busy) props.onClose(); }} disableEscapeKeyDown={busy} fullWidth maxWidth="md" aria-labelledby="studio-schedule-title">
    {props.test && <ScheduleContent key={props.test.id} {...props} test={props.test} onBusyChange={setBusy} />}
  </Dialog>;
}
