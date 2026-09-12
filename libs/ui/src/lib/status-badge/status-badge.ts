import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RunStatus } from '@opsflow/domain';
import { isTerminalRun } from '@opsflow/domain';
import type { BadgeTone } from './status-badge.types';

/** Written out rather than composed, because Tailwind only ships classes it can find as literals. */
const BADGE: Record<BadgeTone, string> = {
  neutral: 'border-line bg-raised text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
};

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const TONES: Record<RunStatus, BadgeTone> = {
  queued: 'neutral',
  running: 'accent',
  retrying: 'warning',
  cancelling: 'warning',
  cancelled: 'neutral',
  succeeded: 'success',
  failed: 'danger',
};

@Component({
  selector: 'ops-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.html',
  host: { class: 'inline-flex' },
})
export class StatusBadge {
  readonly status = input.required<RunStatus>();

  protected readonly tone = computed(() => TONES[this.status()]);
  protected readonly badgeClass = computed(() => BADGE[this.tone()]);
  protected readonly dotClass = computed(() => DOT[this.tone()]);
  /** A run still in flight pulses; a finished one holds steady. */
  protected readonly live = computed(() => !isTerminalRun(this.status()));
}
