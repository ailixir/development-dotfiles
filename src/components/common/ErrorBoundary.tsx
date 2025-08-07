import { Component, ErrorInfo, ReactNode } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  Alert,
  Stack,
} from '@mui/material';
import { Refresh as RefreshIcon, BugReport as BugReportIcon } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Generate a unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('Error Boundary caught an error:', {
      error,
      errorInfo,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });

    this.setState({
      error,
      errorInfo,
    });

    // Here you could send error to monitoring service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Card sx={{ textAlign: 'center' }}>
            <CardContent sx={{ p: 4 }}>
              <BugReportIcon 
                sx={{ 
                  fontSize: 64, 
                  color: 'error.main', 
                  mb: 2 
                }} 
              />
              
              <Typography variant="h4" gutterBottom color="error">
                Something went wrong
              </Typography>
              
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                We're sorry, but something unexpected happened. Please try refreshing the page 
                or contact support if the problem persists.
              </Typography>

              {this.state.errorId && (
                <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
                  <Typography variant="body2">
                    <strong>Error ID:</strong> {this.state.errorId}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Please include this ID when reporting the issue.
                  </Typography>
                </Alert>
              )}

              <Stack direction="row" spacing={2} justifyContent="center">
                <Button
                  variant="contained"
                  onClick={this.handleRetry}
                  startIcon={<RefreshIcon />}
                >
                  Try Again
                </Button>
                
                <Button
                  variant="outlined"
                  onClick={this.handleReload}
                >
                  Reload Page
                </Button>
              </Stack>

              {/* Development error details */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <Box sx={{ mt: 4, textAlign: 'left' }}>
                  <Typography variant="h6" gutterBottom>
                    Development Error Details:
                  </Typography>
                  <Alert severity="error">
                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                      {this.state.error.toString()}
                    </Typography>
                    {this.state.errorInfo && (
                      <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', mt: 2 }}>
                        {this.state.errorInfo.componentStack}
                      </Typography>
                    )}
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
