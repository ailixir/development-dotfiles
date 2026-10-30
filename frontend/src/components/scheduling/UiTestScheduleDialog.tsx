import React, { useMemo } from 'react';
import { useUiTestSchedule } from '@/hooks/useUiTestSchedule';
import ScheduleDialog, { type ScheduleTarget } from './ScheduleDialog';

export interface UiTestScheduleDialogProps {
  test: { id: string; name: string };
  onClose: () => void;
  /** Called after a successful save, before the dialog closes. */
  onSaved?: () => void | Promise<void>;
}

/**
 * The shared schedule dialog opened for a UI test: it reads the test's current schedule, then shows
 * the same {@link ScheduleDialog} a check uses. Mount it only while it should be open; it reads on
 * mount and shows nothing until that read has answered.
 */
const UiTestScheduleDialog: React.FC<UiTestScheduleDialogProps> = ({ test, onClose, onSaved }) => {
  const { status, schedule } = useUiTestSchedule(test.id);
  const target = useMemo<ScheduleTarget>(
    () => ({ kind: 'uiTest', id: test.id, name: test.name, schedule }),
    [test.id, test.name, schedule],
  );
  if (status === 'loading') return null;
  return <ScheduleDialog open onClose={onClose} target={target} onSaved={onSaved} />;
};

export default UiTestScheduleDialog;
