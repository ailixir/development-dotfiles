import type { SxProps, Theme } from '@mui/material';

/**
 * `sx` for a column that only shows from the `md` breakpoint up. Put it on the header cell and on
 * every body cell of that column, so narrow screens drop secondary columns instead of scrolling.
 */
export const hideBelowMd: SxProps<Theme> = { display: { xs: 'none', md: 'table-cell' } };
