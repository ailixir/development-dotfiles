import { parseCron } from '@/utils/cronNextRun';
import type { SchedulePreview, SchedulePolicy } from '@/types/studio/studioScheduling';

export const MOCK_SCHEDULE_POLICY: SchedulePolicy = {
  minIntervalSeconds: 60, misfireGraceSeconds: 300, overlap: 'SKIP', dstOverlap: 'EARLIER_OFFSET',
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** A bounded fixture resolver for common cron shapes, never the production scheduling authority. */
export function mockSchedulePreview(cron: string, timeZone: string, after = new Date()): SchedulePreview {
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5) parts.unshift('0');
  if (parts.length !== 6 || parts[0] !== '0') throw new Error('INVALID_SCHEDULE');
  const normalizedCronExpression = parts.join(' ');
  const numeric = [...parts];
  numeric[4] = numeric[4].replace(/[A-Z]{3}/gi, name => String(MONTHS.indexOf(name.toUpperCase()) + 1));
  numeric[5] = numeric[5].replace(/[A-Z]{3}/gi, name => String(WEEKDAYS.indexOf(name.toUpperCase())));
  numeric[3] = numeric[3] === '?' ? '*' : numeric[3];
  numeric[5] = numeric[5] === '?' ? '*' : numeric[5] === '7' ? '0' : numeric[5];
  if (numeric.some(part => !/^[\d*,/-]+$/.test(part))) throw new Error('INVALID_SCHEDULE');
  const fields = parseCron(numeric.join(' '));
  if (!fields) throw new Error('INVALID_SCHEDULE');
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch { throw new Error('INVALID_TIME_ZONE'); }
  const local = (instant: number) => {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  };
  const firstDay = new Date(local(after.getTime()));
  firstDay.setUTCHours(0, 0, 0, 0);
  const occurrences: SchedulePreview['occurrences'] = [];
  for (let day = 0; day < 366 * 5 && occurrences.length < 5; day += 1) {
    const date = new Date(firstDay.getTime() + day * 86_400_000);
    if (!fields.months.includes(date.getUTCMonth() + 1) || !fields.daysOfMonth.includes(date.getUTCDate()) || !fields.daysOfWeek.includes(date.getUTCDay())) continue;
    const offsets = new Set<number>();
    for (const shift of [-36, -12, 12, 36]) {
      const sample = date.getTime() + shift * 3_600_000;
      offsets.add(local(sample) - sample);
    }
    for (const hour of fields.hours) {
      for (const minute of fields.minutes) {
        const wall = date.getTime() + hour * 3_600_000 + minute * 60_000;
        const instants = [...offsets].map(offset => wall - offset).filter(instant => local(instant) === wall).sort((a, b) => a - b);
        const instant = instants[0]; // Earlier overlap offset; a nonexistent gap has no candidate.
        if (instant === undefined || instant <= after.getTime()) continue;
        occurrences.push({ scheduledAt: new Date(instant).toISOString(), localScheduledAt: new Date(wall).toISOString().slice(0, 19), offsetSeconds: (wall - instant) / 1000 });
        if (occurrences.length === 5) break;
      }
      if (occurrences.length === 5) break;
    }
  }
  if (occurrences.length !== 5) throw new Error('INVALID_SCHEDULE');
  return { normalizedCronExpression, timeZone, occurrences, policy: MOCK_SCHEDULE_POLICY };
}
