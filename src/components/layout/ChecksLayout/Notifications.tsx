import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { removeNotification } from '@/store/slices/uiSlice';

const Notifications: React.FC = () => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((s) => s.ui.notifications);
  const newest = notifications[0];
  const [open, setOpen] = React.useState(Boolean(newest));
  React.useEffect(() => setOpen(Boolean(newest)), [newest?.id]);

  if (!newest) return null;

  const handleClose = () => setOpen(false);
  const handleExited = () => dispatch(removeNotification(newest.id));

  return (
    <Snackbar
      open={open}
      autoHideDuration={3500}
      onClose={handleClose}
      TransitionProps={{ onExited: handleExited as any }}
    >
      <Alert severity={newest.type} onClose={handleClose}>
        {newest.title ? `${newest.title}: ` : ''}{newest.message}
      </Alert>
    </Snackbar>
  );
};

export default Notifications;


