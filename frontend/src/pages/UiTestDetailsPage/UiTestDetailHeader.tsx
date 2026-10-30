import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { DeleteOutline, Edit, MoreVert, PlayArrow, Schedule } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import DeleteTestDialog from '@/components/studio/tests/DeleteTestDialog';
import UiTestScheduleDialog from '@/components/scheduling/UiTestScheduleDialog';
import { executionStatusLabel, executionStatusTone } from '@/components/studio/run/executionStatus';
import { LastLearningAttemptNote } from '@/components/studio/guided/LastLearningAttemptNote';
import { useLatestLearningAttempts } from '@/components/studio/guided/useLatestLearningAttempts';
import { uiTestStatus } from '@/components/studio/tests/uiTestStatus';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCSIs } from '@/store/slices/csiSlice';
import { formatAbsoluteTime, formatRelativeTime } from '@/utils/time';
import type { UiTestDetailHeaderProps } from './useUiTestDetail';

/**
 * The UI test detail header (spec §8.2; AC-10, AC-14): name, status chip (the shared mapping), the
 * "UI Test" chip, CSI, environment and last run, with the actions Edit in Studio, Schedule, Run in
 * Studio and (overflow menu) Delete.
 *
 * Run in Studio only navigates to the editor with `?autorun=1`. This page never sends an execute
 * request; the run starts only if the editor's run gate admits it. Delete confirms in the existing
 * dialog and then goes to `/checks/all`.
 */

const UiTestDetailHeader: React.FC<UiTestDetailHeaderProps> = ({ testId, test, reloadSchedule }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const registeredCsis = useAppSelector((state) => state.csi.data);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => { void dispatch(fetchCSIs()); }, [dispatch]);

  const csiLabel = useMemo(() => {
    if (!test.csiId) return null;
    return registeredCsis.find((csi) => csi.id === test.csiId)?.name ?? test.csiId;
  }, [registeredCsis, test.csiId]);

  // The failed-learn line (AC-04) exists only for these two readiness states, so the read is asked
  // for only then: a READY or LEARNING test sends no request.
  const showsLearningAttempt = test.readiness === 'UNLEARNED' || test.readiness === 'NEEDS_RELEARN';
  const attemptIds = useMemo(() => (showsLearningAttempt ? [testId] : []), [showsLearningAttempt, testId]);
  const { byTestId: latestAttempts } = useLatestLearningAttempts(attemptIds);

  const status = uiTestStatus(test);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Card sx={{ mb: 3 }} data-testid="ui-test-detail-header">
      <CardContent>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Box sx={{ minWidth: 0 }}>
            {/*
              * From `md` the title takes at most two lines (clamped, full name on hover) and the status and
              * "UI Test" chips stay beside it, so the header does not grow with the name. Below `md` it wraps.
              */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap={{ xs: 'wrap', md: 'nowrap' }} useFlexGap>
              <Typography
                variant="h5"
                component="h1"
                title={test.name}
                sx={{
                  minWidth: 0,
                  overflowWrap: { xs: 'anywhere', md: 'normal' },
                  display: { md: '-webkit-box' },
                  WebkitLineClamp: { md: 2 },
                  WebkitBoxOrient: { md: 'vertical' },
                  overflow: { md: 'hidden' },
                }}
              >
                {test.name}
              </Typography>
              <Chip size="small" label={status.label} color={status.color} data-testid="ui-test-status" sx={{ flexShrink: 0 }} />
              <Chip size="small" variant="outlined" label="UI Test" data-testid="ui-test-type" sx={{ flexShrink: 0 }} />
            </Stack>
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 0.5 }}
            >
              <Typography variant="body2" color="text.secondary" data-testid="ui-test-csi">
                {csiLabel ? (
                  <Tooltip title={`CSI ${test.csiId}`} describeChild><span>CSI: {csiLabel}</span></Tooltip>
                ) : 'CSI: Not available'}
              </Typography>
              <Typography variant="body2" color="text.secondary" data-testid="ui-test-environment">
                Environment: {test.environment || 'Not specified'}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div" data-testid="ui-test-last-run">
                Last run:{' '}
                {test.lastRunStatus ? (
                  <>
                    <Chip
                      size="small"
                      label={executionStatusLabel(test.lastRunStatus)}
                      color={executionStatusTone(test.lastRunStatus)}
                    />
                    {test.lastRunAt && (
                      <Tooltip title={formatAbsoluteTime(test.lastRunAt)} describeChild>
                        <span> {formatRelativeTime(test.lastRunAt)}</span>
                      </Tooltip>
                    )}
                  </>
                ) : 'Never run'}
              </Typography>
              <LastLearningAttemptNote
                testId={testId}
                readiness={test.readiness}
                sourceRevision={test.sourceRevision}
                attempt={latestAttempts.get(testId)}
              />
            </Stack>
          </Box>

          {/* One right-aligned row from `md`, level with the title line; below `md` it may wrap. */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="flex-end"
            flexWrap={{ xs: 'wrap', md: 'nowrap' }}
            useFlexGap
            sx={{ flexShrink: 0 }}
          >
            <Button
              variant="outlined"
              size="small"
              startIcon={<Edit />}
              onClick={() => navigate(uiTestEditorPath(testId))}
            >
              Edit in Studio
            </Button>
            <Button variant="outlined" size="small" startIcon={<Schedule />} onClick={() => setScheduleOpen(true)}>
              Schedule
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrow />}
              onClick={() => navigate(uiTestEditorPath(testId, { autorun: true }))}
            >
              Run in Studio
            </Button>
            <Tooltip title="More actions" describeChild>
              <IconButton
                size="small"
                aria-label={`More actions for ${test.name}`}
                aria-haspopup="menu"
                onClick={(event) => setMenuAnchor(event.currentTarget)}
              >
                <MoreVert />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={menuAnchor !== null}
              onClose={closeMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { closeMenu(); setDeleteOpen(true); }} sx={{ color: 'error.main' }}>
                <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </Menu>
          </Stack>
        </Stack>
      </CardContent>

      <DeleteTestDialog
        test={deleteOpen ? { id: testId, name: test.name } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          navigate('/checks/all');
        }}
      />
      {scheduleOpen && (
        <UiTestScheduleDialog
          test={{ id: testId, name: test.name }}
          onSaved={reloadSchedule}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </Card>
  );
};

export { UiTestDetailHeader };
export default UiTestDetailHeader;
