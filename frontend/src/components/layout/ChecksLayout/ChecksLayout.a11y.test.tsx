import { LayoutProvider } from '@/components/layout/LayoutProvider';
import { store } from '@/store';
import theme from '@/theme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecksLayout } from './ChecksLayout';

describe('ChecksLayout accessibility', () => {
  afterEach(() => { vi.restoreAllMocks(); });
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

  it('keeps navigation out of the mobile content until opened and dismisses it after selection', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('max-width'), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={['/checks/all']}>
            <LayoutProvider><ChecksLayout><div>Test list content</div></ChecksLayout></LayoutProvider>
          </MemoryRouter>
        </ThemeProvider>
      </Provider>,
    );

    // jsdom's localhost port is detected as federated; this case exercises the standalone shell.
    act(() => { store.dispatch({ type: 'ui/setDeploymentMode', payload: 'standalone' }); });
    const menu = screen.getByRole('button', { name: 'Navigation' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull();
    fireEvent.click(menu);
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reports', { exact: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Navigation' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('main')).toHaveTextContent('Test list content');
  });
});
