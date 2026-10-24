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
import { StudioScheduleDialog } from '@/components/studio/scheduling/StudioScheduleDialog';
import { uiTestEditorPath, uiTestPath, uiTestRunPath } from '@/components/studio/uiTestPaths';
import { catalogRowStatus, formatLastExecution, type UiTestCatalogRowData } from './catalogRows';

export interface UiTestCatalogRowProps {
  row: UiTestCatalogRowData;
  /** Called after the test is deleted (the page refreshes its UI test list). */
  onDeleted: (id: string) => void;
}

type OpenDialog = 'schedule' | 'delete' | null;

/**
 * One UI test in the All Checks table (spec §9.2, §9.5). The cells follow the check rows' columns:
 * a disabled selection box, the name linking to the detail page with the CSI and description, the
 * type, the status chip, the last run time, and the actions.
 *
 * Execute never sends a run request from here. It opens the editor with `?autorun=1`, and the run
 * starts only if the editor's run gate admits it. The row owns its Schedule and Delete dialogs, which
 * mount only while open.
 */
const UiTestCatalogRow: React.FC<UiTestCatalogRowProps> = ({ row, onDeleted }) => {
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
          <Checkbox disabled checked={false} inputProps={{ 'aria-label': `select ${test.name}` }} />
        </TableCell>
        <TableCell>
          <Stack>
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
          </Stack>
        </TableCell>
        <TableCell>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Science />
            <Typography variant="body2">UI Test</Typography>
          </Stack>
        </TableCell>
        <TableCell>
          <Chip
            size="small"
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
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Tooltip title="Run in Studio">
              <IconButton size="small" onClick={() => navigate(uiTestEditorPath(test.id, { autorun: true }))}>
                <PlayArrow />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
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
        <StudioScheduleDialog
          test={test}
          runHref={(executionId) => uiTestRunPath(test.id, executionId)}
          onClose={() => setDialog(null)}
        />
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
