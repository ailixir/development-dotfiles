import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Grid, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip } from '@mui/material';
import { Add, Science } from '@mui/icons-material';
import { SortableHeaderCell, StudioListLayout } from '@/components/studio/list/StudioListLayout';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import CreateTestDialog from '@/components/studio/tests/CreateTestDialog';
import DeleteTestDialog from '@/components/studio/tests/DeleteTestDialog';
import TestRow from '@/components/studio/tests/TestRow';
import { StudioScheduleDialog } from '@/components/studio/scheduling/StudioScheduleDialog';
import { useStudioTests } from '@/components/studio/tests/useStudioTests';
import {
  LAST_RUN_FILTER_LABELS,
  STUDIO_TEST_ENVIRONMENTS,
  testHref,
} from '@/components/studio/tests/testListPresentation';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCSIs } from '@/store/slices/csiSlice';
import { TEST_LAST_RUN_FILTERS, type TestDto, type TestLastRunFilter } from '@/types/studio/studioTypes';

/** Columns: Test · System · Environment · Readiness · Last run · Updated · actions. */
const COLUMN_SX = [undefined, hideBelowMd, hideBelowMd, undefined, undefined, hideBelowMd, undefined] as const;

const StudioTestsPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const registeredCsis = useAppSelector((state) => state.csi.data);
  const list = useStudioTests();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestDto | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<TestDto | null>(null);

  useEffect(() => { void dispatch(fetchCSIs()); }, [dispatch]);

  const csiNames = useMemo(
    () => new Map(registeredCsis.map((csi) => [csi.id, csi.name])),
    [registeredCsis],
  );
  // One "now" per render, so every row's relative time agrees.
  const now = Date.now();

  const openCreate = () => setCreateOpen(true);

  const environmentFilter = (
    <Tooltip
      title={list.globalEnvironment ? 'Set by the global environment filter' : ''}
      describeChild
    >
      <TextField
        fullWidth
        select
        label="Environment"
        value={list.globalEnvironment ?? list.filters.environment}
        disabled={list.globalEnvironment !== null}
        onChange={(event) => list.setFilter('environment', event.target.value)}
      >
        <MenuItem value="">All Environments</MenuItem>
        {STUDIO_TEST_ENVIRONMENTS.map((environment) => (
          <MenuItem key={environment} value={environment}>{environment}</MenuItem>
        ))}
        {list.globalEnvironment && !(STUDIO_TEST_ENVIRONMENTS as readonly string[]).includes(list.globalEnvironment) && (
          <MenuItem value={list.globalEnvironment}>{list.globalEnvironment}</MenuItem>
        )}
      </TextField>
    </Tooltip>
  );

  return (
    <Box>
      <StudioListLayout
        title="UI Tests"
        noun="tests"
        description="Create and manage browser tests"
        icon={<Science aria-hidden="true" />}
        action={<Button variant="contained" startIcon={<Add />} onClick={openCreate} size="large">Create Test</Button>}
        query={list.query}
        onQueryChange={list.setQuery}
        filter={
          <>
            <Grid item xs={6} md={2}>
              <TextField
                fullWidth
                select
                label="Last run"
                value={list.filters.lastRun}
                onChange={(event) => list.setFilter('lastRun', event.target.value as '' | TestLastRunFilter)}
              >
                <MenuItem value="">All Results</MenuItem>
                {TEST_LAST_RUN_FILTERS.map((outcome) => (
                  <MenuItem key={outcome} value={outcome}>{LAST_RUN_FILTER_LABELS[outcome]}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} md={2}>{environmentFilter}</Grid>
          </>
        }
        hasActiveFilters={list.hasActiveFilters}
        onClearFilters={list.clearAll}
        csiId={list.globalCsiId}
        environment={list.globalEnvironment}
        loading={list.loading}
        error={list.error}
        onRefresh={list.reload}
        emptyMessage={list.isNarrowed ? 'No tests match your filters.' : 'No tests yet. Create a test to get started.'}
        emptyTitle={list.isNarrowed ? 'No matching tests' : 'No tests yet'}
        emptyAction={{ label: 'Create Test', onClick: openCreate }}
        count={list.totalElements}
        page={list.page}
        pageSize={list.pageSize}
        onPageChange={list.setPage}
        pageSizeOptions={list.pageSizeOptions}
        onPageSizeChange={list.setPageSize}
        skeletonColumns={COLUMN_SX.length}
        skeletonColumnSx={COLUMN_SX}
      >
        <TableContainer>
          <Table size="small" aria-label="UI tests">
            <TableHead>
              <TableRow>
                <SortableHeaderCell
                  field="name"
                  label="Test"
                  activeField={list.sortField}
                  direction={list.sortDirection}
                  onSort={(field) => list.toggleSort(field, 'asc')}
                />
                <TableCell sx={hideBelowMd}>System</TableCell>
                <TableCell sx={hideBelowMd}>Environment</TableCell>
                <TableCell>Readiness</TableCell>
                <SortableHeaderCell
                  field="lastRunAt"
                  label="Last run"
                  activeField={list.sortField}
                  direction={list.sortDirection}
                  onSort={(field) => list.toggleSort(field, 'desc')}
                />
                <SortableHeaderCell
                  field="updatedAt"
                  label="Updated"
                  activeField={list.sortField}
                  direction={list.sortDirection}
                  onSort={(field) => list.toggleSort(field, 'desc')}
                  sx={hideBelowMd}
                />
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.tests.map((test) => (
                <TestRow
                  key={test.id}
                  test={test}
                  csiName={test.csiId ? csiNames.get(test.csiId) ?? null : null}
                  now={now}
                  actionsDisabled={deleteTarget !== null}
                  onDelete={setDeleteTarget}
                  onSchedule={setScheduleTarget}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </StudioListLayout>

      <DeleteTestDialog
        test={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          list.reload();
        }}
      />
      <StudioScheduleDialog test={scheduleTarget} onClose={() => setScheduleTarget(null)} />

      <CreateTestDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          navigate(testHref(created.id));
        }}
      />
    </Box>
  );
};

export default StudioTestsPage;
