import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Checkbox,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowForward, DeleteOutline, Edit, MoreVert, PlayArrow, Schedule, Science } from '@mui/icons-material';
import DeleteTestDialog from '@/components/studio/tests/DeleteTestDialog';
import UiTestScheduleDialog from '@/components/scheduling/UiTestScheduleDialog';
import { LastLearningAttemptNote } from '@/components/studio/guided/LastLearningAttemptNote';
import type { GuidedLatestAttempt } from '@/types/studio/studioGuidedTypes';
import { uiTestEditorPath, uiTestPath } from '@/components/studio/uiTestPaths';
import { catalogRowStatus, formatLastExecution, type UiTestCatalogRowData } from './catalogRows';

export interface UiTestCatalogRowProps {
  row: UiTestCatalogRowData;
  /**
   * The test's latest terminal learning attempt, from the page's one read (AC-04); `undefined` when
   * there is none, while it loads, or when the read failed. The row never reads it itself.
   */
  attempt?: GuidedLatestAttempt;
  /** Called after the test is deleted (the page refreshes its UI test list). */
  onDeleted: (id: string) => void;
}

type OpenDialog = 'schedule' | 'delete' | null;

/**
 * Compact cell controls below `sm` so the phone table (checkbox, name, status, actions) fits 390 px.
 * From `sm` up the values are MUI's own defaults, so the desktop layout is unchanged. Same values as the
 * check rows in AllChecksPage.tsx.
 */
const compactCheckboxSx = { p: { xs: 0.5, sm: 1.125 } } as const;
const compactIconButtonSx = { p: { xs: '3px', sm: '5px' } } as const;
const compactChipSx = {
  fontSize: { xs: '0.6875rem', sm: '0.8125rem' },
  // Below sm a long label ("Needs re-learn") wraps instead of widening the Status column.
  height: { xs: 'auto', sm: 24 },
  '& .MuiChip-label': {
    px: { xs: 0.75, sm: 1 },
    py: { xs: '2px', sm: 0 },
    whiteSpace: { xs: 'normal', sm: 'nowrap' },
    textAlign: { xs: 'center', sm: 'left' },
  },
} as const;

/**
 * One UI test in the All Checks table (spec §9.2, §9.5). The cells follow the check rows' columns:
 * a disabled selection box, the name linking to the detail page with the CSI and description, the
 * type, the status chip, the last run time, and the actions. Below `sm` the Type column is hidden and
 * the flask icon sits beside the name; below `md` the last run shows as a caption under the name.
 *
 * Execute never sends a run request from here. It opens the editor with `?autorun=1`, and the run
 * starts only if the editor's run gate admits it. The row owns its Schedule and Delete dialogs, which
 * mount only while open.
 */
const UiTestCatalogRow: React.FC<UiTestCatalogRowProps> = ({ row, attempt, onDeleted }) => {
  const { test, csiName } = row;
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const status = catalogRowStatus(row);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <>
      <TableRow hover data-testid={`ui-test-row-${test.id}`}>
        <TableCell padding="checkbox">
          {/* UI tests never join a bulk selection (FR-17). */}
          <Checkbox sx={compactCheckboxSx} disabled checked={false} inputProps={{ 'aria-label': `select ${test.name}` }} />
        </TableCell>
        <TableCell>
          {/* Flex gap, not Stack spacing: the hidden flask (from sm) must not leave an indent before the name. */}
          <Stack direction="row" spacing={0.75} useFlexGap alignItems="flex-start">
            {/* Below sm the Type column is hidden, so the flask marks UI test rows beside the name (D7). */}
            <Science
              fontSize="small"
              data-testid={`ui-test-name-icon-${test.id}`}
              sx={{ display: { xs: 'block', sm: 'none' }, flexShrink: 0, mt: '1px', color: 'text.secondary' }}
            />
            <Stack sx={{ minWidth: 0 }}>
              <Typography
                component={RouterLink}
                to={uiTestPath(test.id)}
                variant="subtitle2"
                fontWeight={600}
                sx={{ color: 'primary.main', textDecoration: 'none', overflowWrap: 'anywhere', '&:hover': { textDecoration: 'underline' } }}
              >
                {test.name}
              </Typography>
              {csiName && (
                <Typography variant="caption" color="text.secondary" data-testid={`ui-test-csi-${test.id}`}>
                  {csiName}
                </Typography>
              )}
              {test.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  {test.description}
                </Typography>
              )}
              {/* Below md the Last Execution column is hidden; its value shows here instead (own testid). */}
              <Typography
                variant="caption"
                color="text.secondary"
                data-testid={`ui-test-last-run-caption-${test.id}`}
                sx={{ display: { xs: 'block', md: 'none' } }}
              >
                Last run: {formatLastExecution(test.lastRunAt)}
              </Typography>
              {/* The failed-learn line (AC-04) in the same slot, at every width; it wraps instead of widening the column. */}
              <LastLearningAttemptNote
                testId={test.id}
                readiness={test.readiness}
                sourceRevision={test.sourceRevision}
                attempt={attempt}
                sx={{ typography: 'caption' }}
              />
            </Stack>
          </Stack>
        </TableCell>
        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Science />
            <Typography variant="body2" noWrap>UI Test</Typography>
          </Stack>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
            sx={compactChipSx}
            label={status.label}
            color={status.color}
            data-testid={`ui-test-status-${test.id}`}
          />
        </TableCell>
        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
          <Typography variant="body2" data-testid={`ui-test-last-run-${test.id}`}>
            {formatLastExecution(test.lastRunAt)}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={{ xs: 0, sm: 1 }} justifyContent="flex-end">
            <Tooltip title="Run in Studio">
              <IconButton size="small" sx={compactIconButtonSx} data-testid={`ui-test-run-${test.id}`} onClick={() => navigate(uiTestEditorPath(test.id, { autorun: true }))}>
                <PlayArrow />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              sx={compactIconButtonSx}
              data-testid={`ui-test-more-${test.id}`}
              aria-label={`More actions for ${test.name}`}
              aria-haspopup="menu"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <MoreVert />
            </IconButton>
          </Stack>
          <Menu
            anchorEl={menuAnchor}
            open={menuAnchor !== null}
            onClose={closeMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem component={RouterLink} to={uiTestPath(test.id)} onClick={closeMenu}>
              <ListItemIcon><ArrowForward fontSize="small" /></ListItemIcon>
              <ListItemText>Open</ListItemText>
            </MenuItem>
            <MenuItem component={RouterLink} to={uiTestEditorPath(test.id)} onClick={closeMenu}>
              <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
              <ListItemText>Edit in Studio</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); setDialog('schedule'); }}>
              <ListItemIcon><Schedule fontSize="small" /></ListItemIcon>
              <ListItemText>Schedule</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); setDialog('delete'); }} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        </TableCell>
      </TableRow>

      {dialog === 'schedule' && (
        <UiTestScheduleDialog test={test} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delete' && (
        <DeleteTestDialog
          test={{ id: test.id, name: test.name }}
          onClose={() => setDialog(null)}
          onDeleted={(id) => {
            setDialog(null);
            onDeleted(id);
          }}
        />
      )}
    </>
  );
};

export default UiTestCatalogRow;
