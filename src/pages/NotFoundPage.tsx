import React from 'react';
import {
  Container,
  Typography,
  Button,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Home as HomeIcon } from '@mui/icons-material';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h1" component="h1" gutterBottom>
        404
      </Typography>
      <Typography variant="h4" component="h2" gutterBottom>
        Page Not Found
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        The page you're looking for doesn't exist.
      </Typography>
      <Button
        variant="contained"
        startIcon={<HomeIcon />}
        onClick={() => navigate('/dashboard')}
      >
        Go to Dashboard
      </Button>
    </Container>
  );
};

export default NotFoundPage;
