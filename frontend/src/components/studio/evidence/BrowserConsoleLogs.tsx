import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import type { ExecutionLogEntry } from '@/types/studio/studioTypes';
import { formatLogTime } from '@/utils/studio/logTime';
import { consoleLinesOf } from './consoleLines';

const LEVEL_COLOR: Record<ExecutionLogEntry['level'], string> = {
  DEBUG: 'grey.500',
  INFO: 'info.light',
  WARN: 'warning.light',
  ERROR: 'error.light',
};

export const NO_CONSOLE_ERRORS = 'No console errors or warnings were captured.';

/** Collapsed box of the run's browser console lines, under the player. */
export function BrowserConsoleLogs({
  logs,
  terminal,
}: {
  logs: readonly ExecutionLogEntry[];
  terminal: boolean;
}) {
  const entries = consoleLinesOf(logs);
  if (entries.length === 0 && !terminal) {
    return null;
  }
  const errors = entries.filter((entry) => entry.level === 'ERROR').length;
  const warnings = entries.filter((entry) => entry.level === 'WARN').length;
  return (
    <Accordion disableGutters variant="outlined" data-testid="console-logs">
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="body2" sx={{ mr: 1 }}>{`Browser console errors (${entries.length})`}</Typography>
        {errors > 0 && <Chip size="small" color="error" label={`${errors} ${errors === 1 ? 'error' : 'errors'}`} sx={{ mr: 0.5 }} />}
        {warnings > 0 && <Chip size="small" color="warning" label={`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`} />}
      </AccordionSummary>
      <AccordionDetails>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {NO_CONSOLE_ERRORS}
          </Typography>
        ) : (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'grey.900',
              color: 'grey.100',
              fontFamily: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {entries.map((entry, index) => {
              const time = formatLogTime(entry.at);
              return (
                <Box key={`${entry.at ?? 'na'}-${index}`} data-testid={`console-log-line-${index}`} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {time !== '' && <Box component="span" sx={{ color: 'grey.500', mr: 1 }}>{time}</Box>}
                  <Box component="span" sx={{ color: LEVEL_COLOR[entry.level] ?? 'grey.300', fontWeight: 700, mr: 1 }}>
                    {entry.level.padEnd(5)}
                  </Box>
                  {typeof entry.stepIndex === 'number' && (
                    <Chip size="small" label={`Step ${entry.stepIndex + 1}`} sx={{ mr: 1, height: 18, fontSize: 11, color: 'grey.100', bgcolor: 'grey.700' }} />
                  )}
                  {entry.message}
                </Box>
              );
            })}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default BrowserConsoleLogs;
