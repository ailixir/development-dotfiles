import React from 'react';
import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/shared/States/EmptyState';
import { UI_TEST_CATALOG_SIZE } from './useUiTestCatalog';

/** Where 'Create UI test' goes: Create Check with the UI Test type preselected. */
export const CREATE_UI_TEST_PATH = '/checks/create?type=UI_TEST';

interface UiTestCapNoticeProps {
  /** The server's total of UI tests for the current filters. */
  totalElements: number;
  /** Rows the list asked for. Defaults to the catalog hook's page size. */
  cap?: number;
}

/** Tells the user the UI test list was cut. Renders nothing when everything is shown. */
export const UiTestCapNotice: React.FC<UiTestCapNoticeProps> = ({
  totalElements,
  cap = UI_TEST_CATALOG_SIZE,
}) => {
  if (totalElements <= cap) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {`Showing ${cap} of ${totalElements} UI tests — narrow by system or search`}
    </Alert>
  );
};

interface UiTestLoadFailureNoticeProps {
  onRetry: () => void;
}

/** The UI test list failed while the check rows loaded: says so inline and offers a retry. */
export const UiTestLoadFailureNotice: React.FC<UiTestLoadFailureNoticeProps> = ({ onRetry }) => (
  <Alert severity="warning" sx={{ mb: 2 }}>
    UI tests could not be loaded ·{' '}
    <Button color="inherit" size="small" onClick={onRetry} sx={{ verticalAlign: 'baseline' }}>
      Retry
    </Button>
  </Alert>
);

/** Shown when the Type filter is UI Test and no UI test exists. */
export const UiTestEmptyState: React.FC = () => {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="No UI tests yet"
      description="UI tests you create appear here."
      actionLabel="Create UI test"
      onAction={() => navigate(CREATE_UI_TEST_PATH)}
    />
  );
};
