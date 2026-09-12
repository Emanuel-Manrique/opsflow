import { RUN_TRANSITIONS } from '@opsflow/domain';
import { sqlLiterals, sqlMachine } from './sql';

describe('sqlMachine', () => {
  it.each(RUN_TRANSITIONS)('renders $event $from → $to', (row) => {
    const machine = sqlMachine(row.event);
    const finished = row.setsFinishedAt ? 'clock_timestamp()' : 'NULL';
    const error = row.to === 'failed' || row.to === 'retrying' ? '$4' : 'NULL';
    expect(machine.status).toContain(`WHEN '${row.from}' THEN '${row.to}'`);
    expect(machine.sources).toContain(`'${row.from}'`);
    expect(machine.finishedAt).toContain(`WHEN '${row.from}' THEN ${finished}`);
    expect(machine.error).toContain(`WHEN '${row.from}' THEN ${error}`);
  });

  it('keeps sqlLiterals escaped for CHECK lists', () => {
    expect(sqlLiterals(["queued", "it's"])).toBe("'queued', 'it''s'");
  });
});
