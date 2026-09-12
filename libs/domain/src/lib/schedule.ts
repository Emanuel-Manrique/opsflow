import { CronExpressionParser } from 'cron-parser';
import type { ScheduleProblem } from './schedule.types';

export class InvalidScheduleError extends Error {
  constructor(readonly problems: readonly ScheduleProblem[]) {
    super(`Cannot compute runs for an invalid schedule: ${problems[0]?.message ?? 'unknown problem'}`);
    this.name = 'InvalidScheduleError';
  }
}

const CRON_FIELD_COUNT = 5;

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function hasFiveFields(cronExpr: string): boolean {
  return cronExpr.trim().split(/\s+/).length === CRON_FIELD_COUNT;
}

export function isValidCronExpression(cronExpr: string): boolean {
  // H is randomized on each parse; previews and persisted schedules must agree.
  if (!cronExpr || !hasFiveFields(cronExpr) || /\bH\b/i.test(cronExpr)) {
    return false;
  }

  try {
    CronExpressionParser.parse(cronExpr);
    return true;
  } catch {
    return false;
  }
}

export function validateSchedule(cronExpr: string, timezone: string): readonly ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];

  if (!cronExpr?.trim()) {
    problems.push({ field: 'cronExpr', message: 'A cron expression is required.' });
  } else if (!hasFiveFields(cronExpr)) {
    const message = 'Use five fields: minute, hour, day of month, month, day of week.';
    problems.push({ field: 'cronExpr', message });
  } else if (!isValidCronExpression(cronExpr)) {
    problems.push({ field: 'cronExpr', message: 'This is not a cron expression we can parse.' });
  }

  if (!isValidTimezone(timezone)) {
    problems.push({ field: 'timezone', message: `Unknown timezone "${timezone}".` });
  }

  return problems;
}

export function nextRuns(cronExpr: string, timezone: string, count: number, from: Date = new Date()): readonly Date[] {
  const problems = validateSchedule(cronExpr, timezone);

  if (problems.length > 0) {
    throw new InvalidScheduleError(problems);
  }

  const iterator = CronExpressionParser.parse(cronExpr, { tz: timezone, currentDate: from });
  const runs: Date[] = [];

  for (let i = 0; i < count; i++) {
    runs.push(iterator.next().toDate());
  }

  return runs;
}
