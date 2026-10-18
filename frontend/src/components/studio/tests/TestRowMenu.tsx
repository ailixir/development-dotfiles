import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { DeleteOutline, MoreVert, ArrowForward, Schedule } from '@mui/icons-material';
import type { TestDto } from '@/types/studio/studioTypes';

export interface TestRowMenuProps {
  test: Pick<TestDto, 'id' | 'name'>;
  href: string;
  disabled?: boolean;
  onDelete: () => void;
  onSchedule?: () => void;
}

/**
 * The row's secondary actions. "Run now" is intentionally absent: running goes through the editor's
 * run gate (`useRunGate` — save-before-run, readiness, idempotency, refusal narratives),
 * which a list row cannot reuse without re-implementing it. "Open" leads there.
 */
const TestRowMenu: React.FC<TestRowMenuProps> = ({ test, href, disabled = false, onDelete, onSchedule }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <Tooltip title="More actions" describeChild>
        <span>
          <IconButton
            size="small"
            aria-label={`Actions for ${test.name}`}
            aria-haspopup="menu"
            disabled={disabled}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <MoreVert />
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem component={RouterLink} to={href} onClick={close}>
          <ListItemIcon><ArrowForward fontSize="small" /></ListItemIcon>
          <ListItemText>Open</ListItemText>
        </MenuItem>
        {onSchedule && <MenuItem onClick={() => { const trigger = anchor; close(); trigger?.focus(); onSchedule(); }}>
          <ListItemIcon><Schedule fontSize="small" /></ListItemIcon>
          <ListItemText>Manage schedule</ListItemText>
        </MenuItem>}
        <MenuItem
          onClick={() => { close(); onDelete(); }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default TestRowMenu;
