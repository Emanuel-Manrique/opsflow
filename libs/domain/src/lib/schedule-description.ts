import { isValidCronExpression } from './schedule';
import type { ScheduleFrequency } from './schedule.types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function scheduleFrequency(expression: string): ScheduleFrequency {
  const cron = expression.trim().replace(/\s+/g, ' ');
  if (!isValidCronExpression(cron)) return 'custom';
  if (cron === '* * * * *') return 'minute';
  if (/^\*\/(5|10|15|30) \* \* \* \*$/.test(cron)) return 'interval';
  if (/^\d+ \* \* \* \*$/.test(cron)) return 'hourly';
  if (/^\d+ \d+ \* \* \*$/.test(cron)) return 'daily';
  if (/^\d+ \d+ \* \* 1-5$/.test(cron)) return 'weekdays';
  if (/^\d+ \d+ \* \* [0-7]$/.test(cron)) return 'weekly';
  return 'custom';
}

export function describeCron(expression: string): string {
  const [minute, hour, , , day] = expression.trim().split(/\s+/);
  const time = `${hour?.padStart(2, '0')}:${minute?.padStart(2, '0')}`;
  switch (scheduleFrequency(expression)) {
    case 'minute': return 'Every minute';
    case 'interval': return `Every ${minute.slice(2)} minutes`;
    case 'hourly': return `Every hour at :${minute.padStart(2, '0')}`;
    case 'daily': return `Every day at ${time}`;
    case 'weekdays': return `Monday–Friday at ${time}`;
    case 'weekly': return `Every ${WEEKDAYS[Number(day) % 7]} at ${time}`;
    default: return isValidCronExpression(expression) ? `Custom schedule · ${expression.trim()}` : 'Invalid schedule';
  }
}

export function describeTimezone(timezone: string, at: Date = new Date()): string {
  try {
    const format = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'longOffset' });
    const offset = format.formatToParts(at).find((part) => part.type === 'timeZoneName')?.value;
    if (!offset) return timezone;
    const label = offset.replace('GMT', 'UTC').replace(':00', '');
    return label === 'UTC+00' || label === 'UTC-00' || label === 'UTC' ? 'UTC' : label;
  } catch {
    return timezone;
  }
}
