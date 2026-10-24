import { useState, type MouseEvent } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { Link as LinkIcon, MoreVert, PlayCircleOutline } from '@mui/icons-material';

export interface RunRowMenuProps {
  /** Shown in the button name, e.g. the run's short id. */
  label: string;
  onOpenRun: () => void;
  onCopyLink: () => void;
}

/** The row's secondary actions: Open run, Copy link. */
export function RunRowMenu({ label, onOpenRun, onCopyLink }: RunRowMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        onClick={(event: MouseEvent<HTMLElement>) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        <MoreVert />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        onClick={(event) => event.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={run(onOpenRun)}>
          <ListItemIcon><PlayCircleOutline fontSize="small" /></ListItemIcon>
          <ListItemText>Open run</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(onCopyLink)}>
          <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Copy link</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export default RunRowMenu;
