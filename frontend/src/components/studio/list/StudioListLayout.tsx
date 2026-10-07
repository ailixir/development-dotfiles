import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  type SxProps,
  type TableCellProps,
  type Theme,
} from '@mui/material';
import { FilterList, Refresh, Search } from '@mui/icons-material';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import type { SortDirection } from '@/types/studio/studioTypes';

/** Bordered flat card, as on the All Checks and All Reports lists. */
const LIST_CARD_SX: SxProps<Theme> = { border: (theme) => `1px solid ${theme.palette.divider}` };


export interface SortableHeaderCellProps<F extends string> extends Omit<TableCellProps, 'children'> {
  /** The sort field this column orders by. */
  field: F;
  label: ReactNode;
  /** The list's current sort field and direction (see `useUrlListState`). */
  activeField: string;
  direction: SortDirection;
  /** Called with this column's field; `useUrlListState().toggleSort` fits directly. */
  onSort: (field: F) => void;
}

/** A header cell with an MUI `TableSortLabel`; `aria-sort` is set on the active column. */
export function SortableHeaderCell<F extends string>({
  field,
  label,
  activeField,
  direction,
  onSort,
  ...cellProps
}: SortableHeaderCellProps<F>) {
  const active = activeField === field;
  return (
    <TableCell
      {...cellProps}
      sortDirection={active ? direction : false}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={() => onSort(field)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

export interface TableSkeletonRowsProps {
  columns: number;
  rows?: number;
  /** Per-column `sx` (e.g. `hideBelowMd` from `./studioListSx`) so skeleton columns match the real ones. */
  columnSx?: ReadonlyArray<SxProps<Theme> | undefined>;
}

/** Placeholder rows shaped like the table they stand in for. Render inside a `TableBody`. */
export function TableSkeletonRows({ columns, rows = 5, columnSx }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column} sx={columnSx?.[column]}>
              <Skeleton variant="text" width={column === 0 ? '80%' : '60%'} />
              {column === 0 && <Skeleton variant="text" width="45%" sx={{ fontSize: '0.75rem' }} />}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export interface StudioListEmptyAction {
  label: string;
  onClick: () => void;
}

export interface StudioListLayoutProps {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  /** Filter controls next to the search box, each in its own `Grid item` (e.g. `xs={6} md={2}`). */
  filter: ReactNode;
  csiId: string | null;
  environment?: string | null;
  /**
   * True while a request is in flight. With rows already on screen (`count > 0`) they stay
   * visible and dimmed under a progress bar; only a first load shows the skeleton.
   */
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Description in the empty state. */
  emptyMessage: string;
  /** Heading in the empty state. Defaults to "No matches" with active filters, else "Nothing here yet". */
  emptyTitle?: string;
  /** Primary call to action in the empty state when no filter is active (e.g. "Create test"). */
  emptyAction?: StudioListEmptyAction;
  /** Total matching rows across all pages (server `totalElements`). */
  count: number;
  /** 1-based. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Rows-per-page choices; with `onPageSizeChange`, the pagination bar shows a selector. */
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
  /** Show a Refresh button in the toolbar (e.g. for lists that change while you watch). */
  showRefresh?: boolean;
  /**
   * Whether search or any filter is active. Defaults to `query !== ''`. The toolbar's
   * "Clear Filters" button is always shown, as on All Checks / All Reports; when filters are
   * active the empty state offers it too.
   */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /** Column count for the first-load table skeleton. Omit for the legacy block skeleton. */
  skeletonColumns?: number;
  /** Per-column `sx` for the skeleton, matching the real table's responsive columns. */
  skeletonColumnSx?: ReadonlyArray<SxProps<Theme> | undefined>;
  /** Show the "Scroll horizontally" hint on phones. Off by default: hide columns with `hideBelowMd` from `./studioListSx` instead. */
  showScrollHint?: boolean;
  children: ReactNode;
}

/** Shared list chrome and request states for Studio tests and run history. */
export function StudioListLayout({
  title,
  description,
  icon,
  action,
  query,
  onQueryChange,
  filter,
  csiId,
  environment,
  loading,
  error,
  onRefresh,
  emptyMessage,
  emptyTitle,
  emptyAction,
  count,
  page,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  showRefresh = false,
  hasActiveFilters,
  onClearFilters,
  skeletonColumns,
  skeletonColumnSx,
  showScrollHint = false,
  children,
}: StudioListLayoutProps) {
  const filtersActive = hasActiveFilters ?? query !== '';
  const clearFilters = onClearFilters ?? (() => onQueryChange(''));
  const clearLabel = onClearFilters ? 'Clear Filters' : 'Clear search';
  const firstLoad = loading && count === 0;
  const refreshing = loading && count > 0;
  const lowerTitle = title.toLowerCase();

  let body: ReactNode;
  if (error) {
    body = (
      <Box sx={{ p: 2 }}>
        <ErrorState message={error} onRetry={onRefresh} />
      </Box>
    );
  } else if (firstLoad) {
    body = skeletonColumns ? (
      <Box role="status" aria-label={`Loading ${lowerTitle}`} sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableBody>
            <TableSkeletonRows columns={skeletonColumns} columnSx={skeletonColumnSx} />
          </TableBody>
        </Table>
      </Box>
    ) : (
      <Stack spacing={2} sx={{ p: 2 }} role="status" aria-label={`Loading ${lowerTitle}`}>
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} variant="rounded" height={40} />)}
      </Stack>
    );
  } else if (count === 0) {
    const cta = filtersActive ? { label: clearLabel, onClick: clearFilters } : emptyAction;
    body = (
      <Box sx={{ py: 6 }}>
        <EmptyState
          title={emptyTitle ?? (filtersActive ? 'No matches' : 'Nothing here yet')}
          description={emptyMessage}
          actionLabel={cta?.label}
          onAction={cta?.onClick}
        />
      </Box>
    );
  } else {
    body = (
      <>
        {showScrollHint && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: { xs: 'block', sm: 'none' } }}>
            Scroll horizontally to see all columns.
          </Typography>
        )}
        <Box
          data-testid="studio-list-rows"
          sx={{
            '& .MuiTableHead-root .MuiTableCell-root': { whiteSpace: 'nowrap' },
            transition: 'opacity 150ms',
            ...(refreshing ? { opacity: 0.55, pointerEvents: 'none' } : {}),
          }}
        >
          {children}
        </Box>
        <TablePagination
          component="div"
          count={count}
          page={page - 1}
          onPageChange={(_, zeroBasedPage) => onPageChange(zeroBasedPage + 1)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={onPageSizeChange && pageSizeOptions ? [...pageSizeOptions] : [pageSize]}
          onRowsPerPageChange={(event) => onPageSizeChange?.(Number(event.target.value))}
        />
      </>
    );
  }

  return (
    <Box>
      {/* Header — same shape as All Checks / All Reports. */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        mb={3}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={600}
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1, '& > svg': { fontSize: 32, color: 'primary.main' } }}
          >
            {icon}
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
        {action && <Stack direction="row" spacing={1} alignItems="center" useFlexGap>{action}</Stack>}
      </Stack>

      {/* Global search context indicator */}
      {(csiId || environment) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2">Global filters active:</Typography>
            {csiId && <Chip label={`CSI: ${csiId}`} size="small" />}
            {environment && <Chip label={`Env: ${environment}`} size="small" />}
          </Stack>
        </Alert>
      )}

      {/* Search and quick controls */}
      <Card elevation={0} sx={[LIST_CARD_SX, { mb: 3 }] as SxProps<Theme>}>
        <CardContent>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth placeholder={`Search ${lowerTitle}...`}
                value={query} onChange={(event) => onQueryChange(event.target.value)}
                inputProps={{ 'aria-label': `Search ${lowerTitle}` }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              />
            </Grid>
            {filter}
            <Grid item xs={12} md>
              <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                {showRefresh && (
                  <Tooltip title="Refresh" describeChild>
                    <span><IconButton aria-label={`Refresh ${lowerTitle}`} disabled={loading} onClick={onRefresh}><Refresh /></IconButton></span>
                  </Tooltip>
                )}
                <Button variant="outlined" startIcon={<FilterList />} onClick={clearFilters} sx={{ whiteSpace: 'nowrap' }}>
                  {clearLabel}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card
        elevation={0}
        component="section"
        aria-label={`${title} list`}
        aria-busy={loading}
        sx={[LIST_CARD_SX, { position: 'relative' }] as SxProps<Theme>}
      >
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
          {refreshing && <LinearProgress data-testid="studio-list-refreshing" />}
        </Box>
        {body}
      </Card>
    </Box>
  );
}
