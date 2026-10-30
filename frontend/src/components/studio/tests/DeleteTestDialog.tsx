import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import studioApi from '@/services/api/studioApi';
import type { TestDto } from '@/types/studio/studioTypes';
import { deleteErrorMessage, statusOf } from './testErrors';

export interface DeleteTestDialogProps {
  /** The test to delete; `null` closes the dialog. */
  test: Pick<TestDto, 'id' | 'name'> | null;
  onClose: () => void;
  /** Called after the test is gone (including when it was already gone: `404`). */
  onDeleted: (id: string) => void;
}

/** Confirms and sends `DELETE /studio/tests/{id}`. A `404` means the goal is met and counts as success. */
const DeleteTestDialog: React.FC<DeleteTestDialogProps> = ({ test, onClose, onDeleted }) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (test) setError(null);
  }, [test]);

  const confirm = async () => {
    if (!test) return;
    setDeleting(true);
    setError(null);
    try {
      await studioApi.deleteTest(test.id);
      onDeleted(test.id);
    } catch (failure) {
      if (statusOf(failure) === 404) {
        onDeleted(test.id);
        return;
      }
      console.error(`Failed to delete Studio test ${test.id}:`, failure);
      setError(deleteErrorMessage(failure));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={test !== null}
      onClose={() => { if (!deleting) onClose(); }}
      maxWidth="xs"
      fullWidth
      aria-labelledby="delete-test-title"
    >
      <DialogTitle id="delete-test-title">Delete UI test?</DialogTitle>
      <DialogContent>
        <Typography>“{test?.name}” will be removed from All Checks.</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Future scheduled runs stop. Accepted runs not yet dispatched may be refused. Already admitted runs follow existing stop and recovery controls; run history remains.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={deleting} onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={deleting} onClick={() => { void confirm(); }}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteTestDialog;
