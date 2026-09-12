import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import { BattleArena } from '../battle/battle-arena';
import { projectBattle } from '../battle/domain/battle-projection';
import { Session } from '../core/session';
import type { DemoRoleCard, PreviewMetric } from './demo-session.types';

const PREVIEW_AT = '2026-09-12T03:00:00.000Z';

function previewRun(): RunDto {
  const p1 = { id: 'preview-run', workflowId: 'preview-wf', workflowName: 'Chaos / HTTP 500' };
  const p2 = { status: 'failed' as const, attempt: 3, retryOf: null, error: 'Webhook returned HTTP 500.' };
  const p3 = { createdAt: PREVIEW_AT, startedAt: PREVIEW_AT, finishedAt: '2026-09-12T03:00:35.000Z' };
  return { ...p1, ...p2, ...p3 };
}

function previewEvent(attempt: number): RunEventDto {
  const p1 = { id: String(attempt), runId: 'preview-run', type: 'http.failed' as const, attempt };
  const p2 = { traceId: 'edd5420fd6aecc14', errorCode: 'HTTP_500', durationMs: 180 };
  return { ...p1, ...p2, detail: 'POST /hooks/chaos', createdAt: PREVIEW_AT };
}

@Component({
  selector: 'ops-demo-session',
  imports: [BattleArena],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './demo-session.html',
  host: { class: 'block' },
})
export class DemoSession {
  protected readonly session = inject(Session);
  protected readonly cards: readonly DemoRoleCard[] = [
    { role: 'admin', title: 'Admin', description: 'Manage workflows and settings.', permissions: ['Manage', 'Configure', 'Full access'] },
    { role: 'operator', title: 'Operator', description: 'Run, retry, cancel and inspect.', permissions: ['Execute', 'Retry', 'Cancel'] },
    { role: 'viewer', title: 'Viewer', description: 'Read-only access and observability.', permissions: ['Read', 'Observe', 'No changes'] },
  ];
  protected readonly metrics: readonly PreviewMetric[] = [
    { label: 'Success rate', value: '98.7%', hint: 'Last 24h across the demo tenant' },
    { label: 'Retries', value: '12', hint: 'Recovered before the attempt budget ran out' },
    { label: 'Queue lag', value: '1.2s', hint: 'Outbox → Redis → worker' },
    { label: 'Live traces', value: '24', hint: 'OpenTelemetry spans on the last window' },
  ];
  protected readonly preview = projectBattle(previewRun(), [previewEvent(1), previewEvent(2), previewEvent(3)]);
  protected readonly previewEvents = [previewEvent(1), previewEvent(2), previewEvent(3)];
}
