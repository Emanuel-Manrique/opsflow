import { describeCron, scheduleFrequency } from './schedule-description';

describe('readable schedules', () => {
  it.each([
    ['* * * * *', 'Every minute'],
    ['*/5 * * * *', 'Every 5 minutes'],
    ['15 * * * *', 'Every hour at :15'],
    ['30 8 * * 1-5', 'Monday–Friday at 08:30'],
    ['0 9 * * 7', 'Every Sunday at 09:00'],
    ['  0   3 * * * ', 'Every day at 03:00'],
    ['0 9 1 * *', 'Custom schedule · 0 9 1 * *'],
    ['*/7 * * * *', 'Custom schedule · */7 * * * *'],
    ['65 25 * * *', 'Invalid schedule'],
    ['* * * * * *', 'Invalid schedule'],
  ])('describes %s without inventing unsupported semantics', (expression, expected) => {
    expect(describeCron(expression)).toBe(expected);
  });

  it('keeps custom schedules intact', () => {
    expect(scheduleFrequency('0 8 1 * MON')).toBe('custom');
  });
});
