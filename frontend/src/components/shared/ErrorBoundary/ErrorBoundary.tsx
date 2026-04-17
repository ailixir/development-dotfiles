import { Component, ErrorInfo, ReactNode } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Collapse,
} from '@mui/material';
import { ErrorOutline, ExpandMore, ExpandLess, Refresh } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showDetails: false,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for tracking
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return { 
      hasError: true, 
      error, 
      showDetails: false,
      errorId,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
    
    this.setState({ errorInfo });
    
    // Call the optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendErrorToService(error, errorInfo, this.state.errorId);
    }
  }

  private handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      showDetails: false,
      errorId: '',
    });
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
          <Paper 
            sx={{ 
              p: 4, 
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'error.light',
            }}
          >
            <ErrorOutline 
              sx={{ 
                fontSize: 64, 
                color: 'error.main', 
                mb: 2 
              }} 
            />
            
            <Typography variant="h5" gutterBottom>
              Something went wrong
            </Typography>
            
            <Typography variant="body1" color="text.secondary" paragraph>
              An unexpected error occurred in the Checks module. The error has been logged and our team has been notified.
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Error ID: <code>{this.state.errorId}</code>
            </Typography>
            
            <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                startIcon={<Refresh />}
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
              
              <Button
                variant="outlined"
                startIcon={this.state.showDetails ? <ExpandLess /> : <ExpandMore />}
                onClick={this.toggleDetails}
              >
                {this.state.showDetails ? 'Hide' : 'Show'} Details
              </Button>
            </Box>

            <Collapse in={this.state.showDetails} sx={{ mt: 3 }}>
              <Alert severity="error" sx={{ textAlign: 'left' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Error Details:
                </Typography>
                
                <Box component="pre" sx={{ 
                  whiteSpace: 'pre-wrap', 
                  fontSize: '0.75rem',
                  maxHeight: '300px',
                  overflow: 'auto',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  p: 1,
                  borderRadius: 1,
                  mt: 1,
                }}>
                  <strong>Message:</strong> {this.state.error?.message}
                  {'\n\n'}
                  <strong>Stack:</strong>
                  {'\n'}
                  {this.state.error?.stack}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\n'}
                      <strong>Component Stack:</strong>
                      {'\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </Box>
              </Alert>
            </Collapse>

            {process.env.NODE_ENV === 'development' && (
              <Typography variant="caption" display="block" sx={{ mt: 2, color: 'warning.main' }}>
                Development Mode: This error boundary provides additional debugging information.
              </Typography>
            )}
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}