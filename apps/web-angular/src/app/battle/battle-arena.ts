import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RunEventDto } from '@opsflow/contracts';
import type { EnemyId, HeroStance, BattleState } from './domain/battle.types';

const ENEMY_FRAMES: Record<EnemyId, number> = { 'timeout-wraith': 25, 'http-demon': 50, 'redis-outage': 75, 'duplicate-scheduler': 100 };

/** Idle bob, walking while working, a pause while backing off. */
const HERO_MOTION: Record<HeroStance, string> = {
  idle: 'animate-[bob_2.4s_ease-in-out_infinite]',
  walking: 'animate-[walk_0.6s_ease-in-out_infinite]',
  recovering: 'animate-[stagger_0.9s_ease-in-out_infinite]',
  victory: 'animate-[cheer_1.6s_ease-in-out_infinite]',
  defeated: 'opacity-60 grayscale',
  cancelled: 'opacity-50 grayscale',
};

const BANNERS: Record<string, string> = {
  'RETRYING…': 'border-warning text-warning',
  VICTORY: 'border-success text-success',
  CANCELLED: 'border-line text-muted',
  'SKIP LOCKED': 'border-success text-success',
};

@Component({
  selector: 'ops-battle-arena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './battle-arena.html',
  host: { class: 'block min-w-0' },
})
export class BattleArena {
  readonly battle = input.required<BattleState>();
  readonly schedule = input<string>();
  readonly events = input<readonly RunEventDto[]>([]);
  protected readonly position = computed(() => this.battle().status === 'succeeded' ? 76 : this.battle().status === 'queued' ? 10 : 25 + this.battle().hero.attempt * 10);
  protected readonly history = computed(() => Array.from({ length: this.battle().hero.attempt }, (_, index) => {
    const attempt = index + 1;
    const events = this.events().filter((event) => event.runId === this.battle().runId && event.attempt === attempt);
    const error = events.find((event) => event.errorCode)?.errorCode;
    const succeeded = events.some((event) => event.type === 'run.succeeded') || (attempt === this.battle().hero.attempt && this.battle().status === 'succeeded');
    const status = succeeded ? 'Succeeded' : error ? error : attempt < this.battle().hero.attempt ? 'Retried' : this.battle().status;
    return { attempt, status, succeeded };
  }));

  protected readonly attempts = computed(() => Array.from({ length: this.battle().hero.maxAttempts }, (_, index) => index + 1));
  protected readonly heroMotion = computed(() => HERO_MOTION[this.battle().hero.stance]);
  protected readonly heroPercent = computed(() => Math.round(this.battle().hero.hp * 100));
  protected readonly heroBar = computed(() => {
    const hp = this.battle().hero.hp;
    if (hp > 0.66) return 'bg-success';
    return hp > 0.33 ? 'bg-warning' : 'bg-danger';
  });

  protected readonly enemyFrame = computed(() => {
    const enemy = this.battle().enemy;
    return enemy ? ENEMY_FRAMES[enemy.id] : 0;
  });
  protected readonly enemyPercent = computed(() => Math.round((this.battle().enemy?.hp ?? 0) * 100));
  protected readonly enemyMotion = computed(() => {
    const enemy = this.battle().enemy;
    if (!enemy) return '';
    if (enemy.defeated) return 'animate-[vanish_0.8s_ease-in_forwards]';
    if (enemy.blocked) return 'animate-[float_3s_ease-in-out_infinite] opacity-80';
    return this.battle().status === 'retrying' ? 'animate-[strike_1s_ease-in-out_infinite]' : 'animate-[float_3s_ease-in-out_infinite]';
  });

  /** A blocked attack is a guarantee holding, so it is labeled in success colors. */
  protected readonly hitClass = computed(() => {
    return this.battle().enemy?.blocked ? 'border-success text-success' : 'border-danger text-danger';
  });

  protected readonly bannerClass = computed(() => {
    const banner = this.battle().banner ?? '';
    if (BANNERS[banner]) return BANNERS[banner];
    return this.battle().enemy?.blocked ? 'border-success text-success' : 'border-danger text-danger';
  });
  /** A failure with no enemy art still has to be reported, not hidden. */
  protected readonly unillustrated = computed(() => this.battle().outcome === 'defeat' && !this.battle().enemy);
}
