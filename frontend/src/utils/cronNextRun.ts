// Lightweight cron-next-run calculator for standard (5-field) and extended (6-field, with seconds) cron expressions.

function expandField(field: string, min: number, max: number): number[] | null {
  const result = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    const base = stepMatch ? stepMatch[1] : part;

    let start: number;
    let end: number;

    if (base === '*') {
      start = min;
      end = max;
    } else if (base.includes('-')) {
      const [lo, hi] = base.split('-').map(Number);
      if (isNaN(lo) || isNaN(hi)) return null;
      start = lo;
      end = hi;
    } else {
      const val = parseInt(base, 10);
      if (isNaN(val)) return null;
      start = val;
      end = val;
    }

    if (start < min || end > max || step < 1) return null;

    for (let i = start; i <= end; i += step) {
      result.add(i);
    }
  }

  return result.size > 0 ? Array.from(result).sort((a, b) => a - b) : null;
}

export interface CronFields {
  seconds: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];  // 1-12
  daysOfWeek: number[];  // 0-6 (Sun=0)
}

export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) return null;

  const hasSec = parts.length === 6;
  const idx = hasSec ? 0 : -1;

  const seconds = hasSec ? expandField(parts[idx], 0, 59) : [0];
  const minutes = expandField(parts[idx + 1], 0, 59);
  const hours = expandField(parts[idx + 2], 0, 23);
  const daysOfMonth = expandField(parts[idx + 3], 1, 31);
  const months = expandField(parts[idx + 4], 1, 12);
  const daysOfWeek = expandField(parts[idx + 5], 0, 6);

  if (!seconds || !minutes || !hours || !daysOfMonth || !months || !daysOfWeek) return null;

  return { seconds, minutes, hours, daysOfMonth, months, daysOfWeek };
}

function nextInList(list: number[], current: number): { value: number; wrapped: boolean } {
  for (const v of list) {
    if (v >= current) return { value: v, wrapped: false };
  }
  return { value: list[0], wrapped: true };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getNextCronRun(expr: string, after?: Date): Date | null {
  const fields = parseCron(expr);
  if (!fields) return null;

  const start = after ?? new Date();
  const candidate = new Date(start.getTime() + 1000);
  candidate.setMilliseconds(0);

  const limit = 366 * 4;
  let iterations = 0;

  let year = candidate.getFullYear();
  let month = candidate.getMonth() + 1;
  let day = candidate.getDate();
  let hour = candidate.getHours();
  let minute = candidate.getMinutes();
  let second = candidate.getSeconds();

  while (iterations++ < limit) {
    // Month
    const mRes = nextInList(fields.months, month);
    if (mRes.wrapped) { year++; month = mRes.value; day = 1; hour = 0; minute = 0; second = 0; continue; }
    if (mRes.value !== month) { month = mRes.value; day = 1; hour = 0; minute = 0; second = 0; continue; }

    // Day of month
    const maxDay = daysInMonth(year, month);
    const validDom = fields.daysOfMonth.filter(d => d <= maxDay);
    if (validDom.length === 0) { month++; day = 1; hour = 0; minute = 0; second = 0; continue; }

    const dRes = nextInList(validDom, day);
    if (dRes.wrapped) { month++; day = 1; hour = 0; minute = 0; second = 0; continue; }
    if (dRes.value !== day) { day = dRes.value; hour = 0; minute = 0; second = 0; }

    // Day of week check
    const probe = new Date(year, month - 1, day);
    if (isNaN(probe.getTime())) { month++; day = 1; hour = 0; minute = 0; second = 0; continue; }
    const dow = probe.getDay();
    if (!fields.daysOfWeek.includes(dow)) { day++; hour = 0; minute = 0; second = 0; continue; }

    // Hour
    const hRes = nextInList(fields.hours, hour);
    if (hRes.wrapped) { day++; hour = 0; minute = 0; second = 0; continue; }
    if (hRes.value !== hour) { hour = hRes.value; minute = 0; second = 0; continue; }

    // Minute
    const minRes = nextInList(fields.minutes, minute);
    if (minRes.wrapped) { hour++; minute = 0; second = 0; continue; }
    if (minRes.value !== minute) { minute = minRes.value; second = 0; continue; }

    // Second
    const sRes = nextInList(fields.seconds, second);
    if (sRes.wrapped) { minute++; second = 0; continue; }
    second = sRes.value;

    const result = new Date(year, month - 1, day, hour, minute, second, 0);
    if (isNaN(result.getTime())) return null;
    return result;
  }

  return null;
}

export function formatNextCronRun(expr: string, after?: Date): string {
  const next = getNextCronRun(expr, after);
  if (!next) return 'Unable to compute';
  return next.toLocaleString();
}

export function frequencyToCron(
  frequency: string,
  opts?: { time?: string; daysOfWeek?: number[]; daysOfMonth?: number[]; cron?: string },
): string {
  if (frequency === 'custom') return opts?.cron || '';
  const [h, m] = (opts?.time || '09:00').split(':').map(Number);
  const mm = isNaN(m) ? 0 : m;
  const hh = isNaN(h) ? 9 : h;
  switch (frequency) {
    case 'hourly':
      return '0 0 * * * *';
    case 'daily':
      return `0 ${mm} ${hh} * * *`;
    case 'weekly': {
      const dow = opts?.daysOfWeek?.length ? opts.daysOfWeek.join(',') : '1';
      return `0 ${mm} ${hh} * * ${dow}`;
    }
    case 'monthly': {
      const dom = opts?.daysOfMonth?.length ? opts.daysOfMonth.join(',') : '1';
      return `0 ${mm} ${hh} ${dom} * *`;
    }
    default:
      return '0 0 * * * *';
  }
}
