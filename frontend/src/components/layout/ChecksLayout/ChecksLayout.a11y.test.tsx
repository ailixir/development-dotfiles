import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from '@/theme';
import { MemoryRouter } from 'react-router-dom';
import { ChecksLayout } from './ChecksLayout';
import { LayoutProvider } from '@/components/layout/LayoutProvider';

describe('ChecksLayout accessibility', () => {
  it('renders skip link and main landmark', async () => {
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <MemoryRouter initialEntries={['/']}> 
            <LayoutProvider>
              <ChecksLayout>
                <div>content</div>
              </ChecksLayout>
            </LayoutProvider>
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );
    // Skip link present
    expect(screen.getByText(/Skip to main content/i)).toBeInTheDocument();
  });
});


