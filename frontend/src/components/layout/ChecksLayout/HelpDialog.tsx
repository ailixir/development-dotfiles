import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText, Typography } from '@mui/material';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="checks-help-title">
      <DialogTitle id="checks-help-title">Shortcuts & Tips</DialogTitle>
      <DialogContent dividers>
        <List dense>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Cmd/Ctrl + K</strong> — Open Command Palette</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>?</strong> — Open this Help</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Cmd/Ctrl + N</strong> — Create a new Check</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>G</strong> — Go to Home</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Esc</strong> — Close dialogs/overlays</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Search</strong>: Type to find CSIs, then search Checks/Reports within a CSI.</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Reports builder</strong>: ⌘S to save draft, ⌘⏎ to generate preview, <code>/</code> to focus check search.</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2">Dev toggles (localStorage): <code>__msw_debug_slow</code> (ms), <code>__msw_debug_fail</code> (code), <code>__msw_debug_empty</code> (1)</Typography>} />
          </ListItem>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} autoFocus>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HelpDialog;


