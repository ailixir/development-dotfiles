import React from 'react';
import {
  Box,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { AddCircleOutline } from '@mui/icons-material';
import { columnRange } from './evaluatePreview';
import type { MetricRule, QueryResult, RowScope, RowVerdict } from './types';

interface ResultTableProps {
  result: QueryResult;
  rules?: MetricRule[];
  verdicts?: RowVerdict[];
  rowScope?: RowScope;
  onAddRule?: (column: string) => void;
}

const ResultTable: React.FC<ResultTableProps> = ({
  result,
  rules = [],
  verdicts = [],
  rowScope = 'every',
  onAddRule,
}) => {
  const theme = useTheme();
  const showVerdicts = verdicts.length > 0;
  // Under "any row" a non-matching row is not a failure, so it stays neutral.
  const marksFailures = rowScope === 'every';

  if (result.rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          The query returned 0 rows.
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
            {showVerdicts && <TableCell sx={{ width: 36 }} />}
            {result.columns.map((column) => {
              const numeric = result.numericColumns.includes(column);
              const range = numeric ? columnRange(result, column) : null;
              const hasRule = rules.some((rule) => rule.column === column);
              return (
                <TableCell
                  key={column}
                  align={numeric ? 'right' : 'left'}
                  sx={
                    // Let the group column absorb the slack so the metric columns stay together.
                    result.numericColumns.length > 0 && column === result.labelColumn
                      ? { width: '100%' }
                      : undefined
                  }
                >
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    justifyContent={numeric ? 'flex-end' : 'flex-start'}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {column}
                    </Typography>
                    {numeric && onAddRule && (
                      <Tooltip title={hasRule ? `Add another threshold on ${column}` : `Add threshold on ${column}`}>
                        <IconButton
                          size="small"
                          aria-label={`Add threshold on ${column}`}
                          onClick={() => onAddRule(column)}
                          color="primary"
                        >
                          <AddCircleOutline fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  {range && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', fontSize: 10 }}
                    >
                      {range.min} – {range.max}
                    </Typography>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {result.rows.map((row, rowIndex) => {
            const verdict = verdicts[rowIndex];
            const rowFailed = Boolean(showVerdicts && verdict && !verdict.satisfied && marksFailures);
            return (
              <TableRow
                key={`row-${rowIndex}`}
                sx={rowFailed ? { bgcolor: alpha(theme.palette.error.main, 0.04) } : undefined}
              >
                {showVerdicts && (
                  <TableCell sx={{ width: 36 }}>
                    <Tooltip
                      title={
                        verdict?.satisfied
                          ? 'Row satisfies the condition'
                          : marksFailures
                            ? 'Row breaches the condition'
                            : 'Row does not satisfy the condition'
                      }
                    >
                      <Box
                        aria-label={
                          verdict?.satisfied ? 'row pass' : marksFailures ? 'row fail' : 'row neutral'
                        }
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: verdict?.satisfied
                            ? theme.palette.success.main
                            : marksFailures
                              ? theme.palette.error.main
                              : theme.palette.action.disabled,
                        }}
                      />
                    </Tooltip>
                  </TableCell>
                )}
                {result.columns.map((column) => {
                  const numeric = result.numericColumns.includes(column);
                  const breached =
                    marksFailures && Boolean(verdict?.breachedColumns.includes(column));
                  return (
                    <TableCell
                      key={column}
                      align={numeric ? 'right' : 'left'}
                      sx={{ fontFamily: 'monospace', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                    >
                      <Box
                        component="span"
                        sx={
                          breached
                            ? {
                                px: 0.75,
                                py: 0.25,
                                borderRadius: 0.5,
                                fontWeight: 700,
                                bgcolor: alpha(theme.palette.error.main, 0.16),
                                color: theme.palette.error.dark,
                              }
                            : undefined
                        }
                      >
                        {String(row[column] ?? '—')}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ResultTable;
