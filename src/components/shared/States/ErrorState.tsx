import React from 'react';
import { Alert, Button, Stack } from '@mui/material';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message = 'Something went wrong.', onRetry }) => {
  return (
    <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}>
      {message}
    </Alert>
  );
};

export default ErrorState;


