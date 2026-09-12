import type { FailureKind, RunStatus } from '@opsflow/domain';

export type HeroStance = 'idle' | 'walking' | 'recovering' | 'victory' | 'defeated' | 'cancelled';

export type BattleOutcome = 'pending' | 'fighting' | 'victory' | 'defeat' | 'cancelled';

/** Only the enemies that have been implemented end to end appear here. */
export type EnemyId = 'http-demon' | 'timeout-wraith' | 'redis-outage' | 'duplicate-scheduler';

export interface BattleHero {
  readonly name: string;
  readonly stance: HeroStance;
  /** Attempts the worker has started, straight off the run. */
  readonly attempt: number;
  readonly maxAttempts: number;
  /** Attempts already burned by a failure. */
  readonly spentAttempts: number;
  /** Remaining attempts as a 0..1 fraction. HP means attempts left, and nothing else. */
  readonly hp: number;
}

export interface BattleEnemy {
  readonly id: EnemyId;
  readonly name: string;
  readonly kind: FailureKind;
  readonly hp: number;
  readonly defeated: boolean;
  /** Short label drawn over the enemy, e.g. `HTTP 500`. */
  readonly hit: string;
  /**
   * True when the system stopped the attack outright rather than suffering it: a
   * duplicate occurrence refused by the unique constraint, for instance. A blocked
   * enemy is a safety guarantee on display, not a failure.
   */
  readonly blocked: boolean;
}

/** Conditions the arena can only know from outside the run's own row. */
export interface BattleEnvironment {
  /** False when the queue could not be reached at all. */
  readonly queueReachable: boolean;
  /** Executions the outbox is still holding. */
  readonly outboxPending: number;
}

export interface BattleState {
  readonly runId: string;
  readonly status: RunStatus;
  readonly hero: BattleHero;
  /** Null when the run has not failed, or failed in a way with no enemy behind it yet. */
  readonly enemy: BattleEnemy | null;
  readonly outcome: BattleOutcome;
  readonly banner: string | null;
}
