import { HTTP_METHODS, sources, transitionsFor } from '@opsflow/domain';
import type { RunEvent } from '@opsflow/domain';
import type { SqlMachine } from './sql.types';

// Projection of RUN_TRANSITIONS. A hand-written CASE in a repository is a drift bug.
// Finish timestamps use clock_timestamp() so two writes in one statement do not share now().

export function sqlLiterals(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

export function sqlActionSnapshot(column: string): string {
  const string = (key: string) => `${column} ? '${key}' AND jsonb_typeof(${column} -> '${key}') = 'string'`;
  const webhook = [
    string('type'), `${column} ->> 'type' = 'webhook'`,
    string('url'),
    string('method'), `${column} ->> 'method' IN (${sqlLiterals(HTTP_METHODS)})`,
  ].join(' AND ');
  return `(${column} = '{"type": "noop"}'::jsonb) OR (${webhook})`;
}

function sqlStatusCase(event: RunEvent): string {
  const branches = transitionsFor(event).map((row) => `WHEN '${row.from}' THEN '${row.to}'`);
  return `CASE status ${branches.join(' ')} END`;
}

function sqlFinishedAtCase(event: RunEvent): string {
  const branches = transitionsFor(event).map((row) => {
    const value = row.setsFinishedAt ? 'clock_timestamp()' : 'NULL';
    return `WHEN '${row.from}' THEN ${value}`;
  });
  return `CASE status ${branches.join(' ')} ELSE NULL END`;
}

function sqlErrorCase(event: RunEvent, bound = '$4'): string {
  const branches = transitionsFor(event).map((row) => {
    const value = row.to === 'failed' || row.to === 'retrying' ? bound : 'NULL';
    return `WHEN '${row.from}' THEN ${value}`;
  });
  // NULLIF keeps $4 in succeed/fail/backoff so the three events share one bind list.
  return `CASE status ${branches.join(' ')} ELSE NULLIF(${bound}, ${bound}) END`;
}

export function sqlMachine(event: RunEvent): SqlMachine {
  const p1 = { status: sqlStatusCase(event), finishedAt: sqlFinishedAtCase(event) };
  return { ...p1, error: sqlErrorCase(event), sources: sqlLiterals(sources(event)) };
}
