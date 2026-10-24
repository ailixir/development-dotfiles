import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  UiTestCapNotice,
  UiTestEmptyState,
  UiTestLoadFailureNotice,
} from './UiTestCatalogNotices';

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

describe('UiTestCatalogNotices', () => {
  it('names the cap and the total when the list is cut', () => {
    render(<UiTestCapNotice totalElements={150} />);

    expect(screen.getByText('Showing 100 of 150 UI tests — narrow by system or search')).toBeTruthy();
  });

  it('shows no cap notice at or below the cap', () => {
    const { container, rerender } = render(<UiTestCapNotice totalElements={100} />);
    expect(container.textContent).toBe('');

    rerender(<UiTestCapNotice totalElements={0} />);
    expect(container.textContent).toBe('');
  });

  it('offers Retry next to the failure message', () => {
    const onRetry = vi.fn();
    render(<UiTestLoadFailureNotice onRetry={onRetry} />);

    expect(screen.getByText(/UI tests could not be loaded/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens Create Check with the UI Test type from the empty state', () => {
    render(
      <MemoryRouter initialEntries={['/checks/all']}>
        <Routes>
          <Route path="*" element={<><UiTestEmptyState /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('No UI tests yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create UI test' }));

    expect(screen.getByTestId('location').textContent).toBe('/checks/create?type=UI_TEST');
  });
});
