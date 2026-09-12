import { Logger } from '@nestjs/common';
import { TERMINAL_RUN_STATUSES } from '@opsflow/domain';
import type { DataSource } from 'typeorm';
import { sqlLiterals } from '../schema/sql';
import type { PurgeCounts, RemovedRow } from './retention.types';

const TERMINAL = sqlLiterals(TERMINAL_RUN_STATUSES);

export class RetentionRepository {
  private readonly logger = new Logger(RetentionRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async purge(days: number): Promise<PurgeCounts> {
    if (!Number.isInteger(days) || days < 1) throw new RangeError('Retention days must be a positive integer.');
    const cutoff = 'now() - make_interval(days => $1::int)';
    const [{ removed: runs }] = await this.dataSource.query<RemovedRow[]>(`
      WITH deleted AS (
        DELETE FROM runs AS expired
        WHERE finished_at IS NOT NULL AND finished_at < ${cutoff}
          AND status IN (${TERMINAL})
          -- Prunes one retry generation per sweep. Long chains would need recursive pruning.
          AND NOT EXISTS (SELECT 1 FROM runs child WHERE child.retry_of = expired.id)
        RETURNING id
      )
      SELECT count(*)::int AS removed FROM deleted
    `, [days]);
    const [{ removed: auditEntries }] = await this.dataSource.query<RemovedRow[]>(`
      WITH deleted AS (DELETE FROM audit_log WHERE created_at < ${cutoff} RETURNING id)
      SELECT count(*)::int AS removed FROM deleted
    `, [days]);

    const counts = { runs, auditEntries };
    if (counts.runs || counts.auditEntries) {
      this.logger.log({ event: 'retention.purged', retentionDays: days, ...counts });
    }
    return counts;
  }
}
