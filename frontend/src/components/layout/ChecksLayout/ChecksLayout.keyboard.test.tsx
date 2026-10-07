import { LayoutProvider } from '@/components/layout/LayoutProvider';
import { store } from '@/store';
import theme from '@/theme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ChecksLayout } from './ChecksLayout';

/**
 * Story 10.19 AC-14: keyboard order. The skip link is reached by the first Tab from page load,
 * before any sidebar navigation item, and activating it moves focus into the <main> landmark.
 */
describe('ChecksLayout keyboard order', () => {
  it('first Tab reaches the skip link before the sidebar; Enter moves focus to <main>', async () => {
    const user = userEvent.setup();
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
      </Provider>,
    );

    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    // The sidebar must actually be rendered, or "before the sidebar" would hold vacuously.
    const sidebarItems = screen.getAllByRole('menuitem');
    expect(sidebarItems.length).toBeGreaterThan(0);
    const home = sidebarItems[0];
    expect(home).toHaveAccessibleName(/home/i);
    expect(home.closest('nav')).not.toBeNull();
    expect(document.body).toHaveFocus();

    await user.tab();
    expect(skip).toHaveFocus();
    sidebarItems.forEach((item) => expect(item).not.toHaveFocus());

    // The next stop is the first sidebar item, so the skip link precedes the whole sidebar.
    await user.tab();
    expect(home).toHaveFocus();

    skip.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
