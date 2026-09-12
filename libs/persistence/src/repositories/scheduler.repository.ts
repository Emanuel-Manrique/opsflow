import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { RunJobData } from '@opsflow/contracts';
import { InvalidScheduleError, nextRuns } from '@opsflow/domain';
import { createExecution } from './create-execution';
import { WorkflowEntity } from '../schema/workflow';
import type { DatabaseClock, PendingExecution } from './execution.types';
import type { WorkflowRow } from '../schema/schema.types';

const OUTBOX_CLAIM_TTL = '30 seconds';
const CLAIM_SAVEPOINT = 'scheduler_claim';

// orchestrator only: reads every tenant on purpose
export class SchedulerRepository {
  private readonly logger = new Logger(SchedulerRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async enqueueDue(traceparent?: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const [clock] = await manager.query<DatabaseClock[]>('SELECT now() AS now');
      const workflows = await manager.getRepository(WorkflowEntity)
        .createQueryBuilder('workflow')
        .where('workflow.enabled AND workflow.nextRunAt <= :now', clock)
        .orderBy('workflow.nextRunAt').addOrderBy('workflow.id')
        .take(50).setLock('pessimistic_write').setOnLocked('skip_locked')
        .getMany();

      let claimed = 0;
      for (const workflow of workflows) {
        await manager.query(`SAVEPOINT ${CLAIM_SAVEPOINT}`);
        try {
          await this.claim(manager, workflow, clock.now, traceparent);
          await manager.query(`RELEASE SAVEPOINT ${CLAIM_SAVEPOINT}`);
          claimed++;
        } catch (error) {
          await manager.query(`ROLLBACK TO SAVEPOINT ${CLAIM_SAVEPOINT}`);
          await this.abandon(manager, workflow, error);
        }
      }
      return claimed;
    });
  }

  private async claim(manager: EntityManager, workflow: WorkflowRow, now: Date, traceparent?: string): Promise<void> {
    const occurrence = workflow.nextRunAt;
    const nextRunAt = nextRuns(workflow.cronExpr, workflow.timezone, 1, now)[0];
    const runId = await createExecution(manager, workflow, occurrence, { traceparent });
    if (runId) {
      await manager.query(`
        INSERT INTO run_events (tenant_id, run_id, workflow_id, type, detail)
        VALUES ($1, $2, $3, 'scheduler.claimed', $4)
      `, [workflow.tenantId, runId, workflow.id, occurrence?.toISOString() ?? null]);
    } else {
      // The occurrence was already claimed: uq_runs_occurrence turned this insert
      // into a no-op. Recorded against the run that won, which is the only place
      // it can be seen, and the proof that two schedulers produce one run.
      await manager.query(`
        INSERT INTO run_events (tenant_id, run_id, workflow_id, type, detail)
        SELECT tenant_id, id, workflow_id, 'scheduler.skipped', $3
        FROM runs WHERE tenant_id = $1 AND workflow_id = $2 AND scheduled_for = $4
      `, [workflow.tenantId, workflow.id, occurrence?.toISOString() ?? null, occurrence]);
    }
    // one catch-up run; skipped occurrences are not backfilled (ADR-0003)
    await manager.query('UPDATE workflows SET next_run_at = $1 WHERE id = $2', [nextRunAt, workflow.id]);
  }

  private async abandon(manager: EntityManager, workflow: WorkflowRow, error: unknown): Promise<void> {
    const p1 = { workflowId: workflow.id, tenantId: workflow.tenantId };
    const errorCode = error instanceof Error ? error.name : 'Error';
    if (!(error instanceof InvalidScheduleError)) {
      this.logger.warn({ event: 'scheduler.claim.deferred', ...p1, errorCode });
      return;
    }
    await manager.query('UPDATE workflows SET enabled = false, next_run_at = NULL WHERE id = $1', [workflow.id]);
    this.logger.error({ event: 'scheduler.schedule.parked', ...p1, errorCode, detail: error.problems[0]?.message });
  }

  async publishNext(publish: (data: RunJobData) => Promise<void>): Promise<boolean> {
    const row = await this.claimNext();
    if (!row) return false;

    const p1 = { runId: row.run_id, tenantId: row.tenant_id };
    const p2 = { workflowId: row.workflow_id, queuedAt: row.created_at.toISOString() };
    const p3 = { traceparent: row.traceparent ?? undefined, requestId: row.request_id ?? undefined };
    try {
      await publish({ ...p1, ...p2, ...p3, action: row.action });
    } catch (error) {
      await this.unclaim(row.run_id);
      await this.hold(row.run_id, error);
      throw error;
    }
    await this.acknowledge(row.run_id);
    return true;
  }

  private async claimNext(): Promise<PendingExecution | undefined> {
    return this.dataSource.transaction(async (manager) => {
      const [row] = await manager.query<PendingExecution[]>(`
        SELECT outbox.run_id, outbox.tenant_id, outbox.action, outbox.created_at,
          outbox.traceparent, outbox.request_id, runs.workflow_id
        FROM execution_outbox outbox
        JOIN runs ON runs.id = outbox.run_id AND runs.tenant_id = outbox.tenant_id
        WHERE outbox.published_at IS NULL
          AND (outbox.claimed_at IS NULL OR outbox.claimed_at < now() - interval '${OUTBOX_CLAIM_TTL}')
        ORDER BY outbox.created_at, outbox.run_id
        LIMIT 1 FOR UPDATE OF outbox SKIP LOCKED
      `);
      if (!row) return undefined;
      await manager.query('UPDATE execution_outbox SET claimed_at = now() WHERE run_id = $1', [row.run_id]);
      return row;
    });
  }

  private async hold(runId: string, error: unknown): Promise<void> {
    const errorCode = error instanceof Error ? error.name : 'Error';
    try {
      await this.dataSource.query(`
        INSERT INTO run_events (tenant_id, run_id, workflow_id, type, error_code)
        SELECT r.tenant_id, r.id, r.workflow_id, 'outbox.held', $2 FROM runs r
        WHERE r.id = $1 AND NOT EXISTS (
          SELECT 1 FROM run_events e WHERE e.run_id = r.id AND e.type = 'outbox.held'
        )
      `, [runId, errorCode]);
    } catch (failure: unknown) {
      const code = failure instanceof Error ? failure.name : 'Error';
      this.logger.warn({ event: 'run.event.dropped', runId, errorCode: code });
    }
  }

  private unclaim(runId: string): Promise<unknown> {
    return this.dataSource.query(
      'UPDATE execution_outbox SET claimed_at = NULL WHERE run_id = $1 AND published_at IS NULL',
      [runId],
    );
  }

  private async acknowledge(runId: string): Promise<unknown> {
    return this.dataSource.transaction(async (manager) => {
      const published = await manager.query<unknown[]>(
        'UPDATE execution_outbox SET published_at = now() WHERE run_id = $1 AND published_at IS NULL RETURNING run_id',
        [runId],
      );
      // Only the publisher that actually flipped the row records the event, so a
      // redelivered claim cannot log the handover twice.
      if (published.length === 0) return published;
      return manager.query(`
        INSERT INTO run_events (tenant_id, run_id, workflow_id, type)
        SELECT tenant_id, id, workflow_id, 'outbox.published' FROM runs WHERE id = $1
      `, [runId]);
    });
  }
}
