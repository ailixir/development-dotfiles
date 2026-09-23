import { LayoutProvider } from '@/components/layout/LayoutProvider';
import { store } from '@/store';
import theme from '@/theme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ChecksLayout } from './ChecksLayout';

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
    const skip=screen.getByRole('link',{name:'Skip to main content'});
    expect(skip).toHaveAttribute('href','#checks-main');
    fireEvent.click(skip);
    expect(screen.getByRole('main')).toHaveFocus();
  });
});


