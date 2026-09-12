import { InvalidScheduleError, isValidCronExpression, isValidTimezone, nextRuns, validateSchedule } from './schedule';

describe('schedule', () => {
  it.each(['* * * * *', '0 3 * * *', '*/15 * * * *', '30 8 * * 1-5', '0 3 * * THU'])('accepts valid cron %s', (expression) => {
    expect(isValidCronExpression(expression)).toBe(true);
  });

  it.each(['', 'not a cron', '0 3 * *', '*/5 * * * * *', '99 * * * *'])('rejects invalid cron %s', (expression) => {
    expect(isValidCronExpression(expression)).toBe(false);
  });

  it('validates IANA timezones', () => {
    expect(isValidTimezone('Europe/Madrid')).toBe(true);
    expect(isValidTimezone('Nowhere/Nope')).toBe(false);
  });

  it('reports every invalid field', () => {
    expect(validateSchedule('nope', 'Nowhere/Nope').map((problem) => problem.field)).toEqual(['cronExpr', 'timezone']);
  });

  it('returns occurrences in order', () => {
    const from = new Date('2026-03-01T12:00:00Z');
    const runs = nextRuns('0 3 * * *', 'UTC', 3, from);

    expect(runs.map((run) => run.toISOString())).toEqual(['2026-03-02T03:00:00.000Z', '2026-03-03T03:00:00.000Z', '2026-03-04T03:00:00.000Z']);
  });

  it.each([
    ['2026-03-01T12:00:00Z', '2026-03-02T02:00:00.000Z'],
    ['2026-03-30T00:00:00Z', '2026-03-30T01:00:00.000Z'],
  ])('honors timezone offsets from %s', (from, expected) => {
    expect(nextRuns('0 3 * * *', 'Europe/Madrid', 1, new Date(from))[0].toISOString()).toBe(expected);
  });

  describe('daylight saving in Europe/Madrid', () => {
    const at = (iso: string) => new Date(iso);

    it('runs the hour that does not exist, once, when clocks spring forward', () => {
      const runs = nextRuns('0 2 * * *', 'Europe/Madrid', 3, at('2026-03-27T12:00:00.000Z'));

      const instants = runs.map((run) => run.toISOString());
      expect(instants).toEqual(['2026-03-28T01:00:00.000Z', '2026-03-29T01:00:00.000Z', '2026-03-30T00:00:00.000Z']);
      expect(new Set(instants).size).toBe(3);
    });

    it('runs the repeated hour once when clocks fall back', () => {
      const runs = nextRuns('0 2 * * *', 'Europe/Madrid', 3, at('2026-10-23T12:00:00.000Z'));

      const instants = runs.map((run) => run.toISOString());
      expect(instants).toEqual(['2026-10-24T00:00:00.000Z', '2026-10-25T00:00:00.000Z', '2026-10-26T01:00:00.000Z']);
    });

    it('does not replay the skipped minutes of a per-minute schedule', () => {
      const runs = nextRuns('* * * * *', 'Europe/Madrid', 3, at('2026-03-29T00:58:00.000Z'));

      const instants = runs.map((run) => run.toISOString());
      expect(instants).toEqual(['2026-03-29T00:59:00.000Z', '2026-03-29T01:00:00.000Z', '2026-03-29T01:01:00.000Z']);
    });
  });

  it('refuses an invalid schedule as InvalidScheduleError', () => {
    expect(() => nextRuns('nope', 'UTC', 1)).toThrow(InvalidScheduleError);
    let thrown: unknown;
    try {
      nextRuns('nope', 'UTC', 1);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidScheduleError);
    expect((thrown as InvalidScheduleError).problems[0]?.field).toBe('cronExpr');
  });

  it.each(['H 3 * * *', 'H(0-10)/5 * * * *', '0 0 * * H#3'])('rejects randomized schedules: %s', (expression) => {
    expect(isValidCronExpression(expression)).toBe(false);
    expect(() => nextRuns(expression, 'UTC', 1)).toThrow(/invalid schedule/i);
  });
});
