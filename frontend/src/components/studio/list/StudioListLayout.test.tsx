import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { Science } from '@mui/icons-material';
import {
  SortableHeaderCell,
  StudioListLayout,
  type StudioListLayoutProps,
} from './StudioListLayout';
import { hideBelowMd } from './studioListSx';

function renderLayout(overrides: Partial<StudioListLayoutProps> = {}) {
  const props: StudioListLayoutProps = {
    title: 'UI Tests',
    description: 'Create and manage browser tests.',
    icon: <Science />,
    query: '',
    onQueryChange: vi.fn(),
    filter: null,
    csiId: null,
    loading: false,
    error: null,
    onRefresh: vi.fn(),
    emptyMessage: 'No tests yet.',
    count: 1,
    page: 1,
    pageSize: 10,
    onPageChange: vi.fn(),
    children: (
      <Table>
        <TableBody>
          <TableRow><TableCell>Row one</TableCell></TableRow>
        </TableBody>
      </Table>
    ),
    ...overrides,
  };
  render(<StudioListLayout {...props} />);
  return props;
}

describe('StudioListLayout', () => {
  it('shows a table-shaped skeleton on first load', () => {
    renderLayout({ loading: true, count: 0, skeletonColumns: 4 });
    const skeleton = screen.getByRole('status', { name: 'Loading ui tests' });
    const rows = within(skeleton).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getAllByRole('cell')).toHaveLength(4);
    expect(screen.queryByText('Row one')).toBeNull();
  });

  it('keeps existing rows visible and dimmed during a refresh', () => {
    renderLayout({ loading: true, count: 1 });
    expect(screen.getByText('Row one')).toBeInTheDocument();
    expect(screen.getByTestId('studio-list-rows')).toHaveStyle({ opacity: '0.55' });
    expect(screen.getByTestId('studio-list-refreshing')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading ui tests' })).toBeNull();
  });

  it('renders the shared empty state with the CTA when no filter is active', () => {
    const onClick = vi.fn();
    renderLayout({ count: 0, emptyTitle: 'No tests yet', emptyAction: { label: 'Create test', onClick } });
    expect(screen.getByText('No tests yet')).toBeInTheDocument();
    expect(screen.getByText('No tests yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create test' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('offers "Clear Filters" in the toolbar and the empty state when filters are active', () => {
    const onClearFilters = vi.fn();
    renderLayout({
      count: 0,
      hasActiveFilters: true,
      onClearFilters,
      emptyMessage: 'No tests match your filters.',
      emptyAction: { label: 'Create test', onClick: vi.fn() },
    });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create test' })).toBeNull();
    const buttons = screen.getAllByRole('button', { name: /Clear Filters/ });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => fireEvent.click(button));
    expect(onClearFilters).toHaveBeenCalledTimes(2);
  });

  it('always shows "Clear Filters", as on All Checks / All Reports', () => {
    renderLayout({ hasActiveFilters: false, onClearFilters: vi.fn() });
    expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeEnabled();
  });

  it('offers a rows-per-page selector when the caller handles it', async () => {
    const onPageSizeChange = vi.fn();
    renderLayout({ count: 30, pageSizeOptions: [10, 25, 50, 100], onPageSizeChange });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Rows per page/ }));
    fireEvent.click(await screen.findByRole('option', { name: '25' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('falls back to "Clear search" for callers without onClearFilters', () => {
    const props = renderLayout({ count: 0, query: 'abc', emptyMessage: 'No tests match your filters.' });
    // Toolbar and empty state both offer it.
    const buttons = screen.getAllByRole('button', { name: 'Clear search' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(props.onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows the scroll hint only on request', () => {
    renderLayout();
    expect(screen.queryByText('Scroll horizontally to see all columns.')).toBeNull();
  });

  it('uses the same header shape as All Checks / All Reports', () => {
    renderLayout({ csiId: '178672', environment: 'UAT' });
    expect(screen.getByRole('heading', { level: 1, name: 'UI Tests' })).toBeInTheDocument();
    expect(screen.getByText('Global filters active:')).toBeInTheDocument();
    expect(screen.getByText('CSI: 178672')).toBeInTheDocument();
    expect(screen.getByText('Env: UAT')).toBeInTheDocument();
  });

  it('shows an error with Retry instead of rows', () => {
    const props = renderLayout({ error: 'Tests could not be loaded.' });
    expect(screen.queryByText('Row one')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('paginates from count and pageSize', () => {
    const props = renderLayout({ count: 25, page: 2 });
    expect(screen.getByText('11–20 of 25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(props.onPageChange).toHaveBeenCalledWith(3);
  });
});

describe('SortableHeaderCell', () => {
  it('marks the active column and reports clicks with its field', () => {
    const onSort = vi.fn();
    render(
      <Table>
        <TableHead>
          <TableRow>
            <SortableHeaderCell field="name" label="Test" activeField="name" direction="asc" onSort={onSort} />
            <SortableHeaderCell field="updatedAt" label="Updated" activeField="name" direction="asc" onSort={onSort} sx={hideBelowMd} />
          </TableRow>
        </TableHead>
      </Table>,
    );
    const [name, updated] = screen.getAllByRole('columnheader');
    expect(name).toHaveAttribute('aria-sort', 'ascending');
    expect(updated).not.toHaveAttribute('aria-sort');
    fireEvent.click(within(updated).getByRole('button', { name: 'Updated' }));
    expect(onSort).toHaveBeenCalledWith('updatedAt');
  });
});
