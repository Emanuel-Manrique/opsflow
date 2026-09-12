import { ChangeDetectionStrategy, Component } from '@angular/core';
import { computed, input, model, signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import type { ScheduleFrequency } from '@opsflow/domain';
import { describeCron, scheduleFrequency, WEEKDAYS, isValidCronExpression } from '@opsflow/domain';

let nextCronFieldId = 0;

@Component({
  selector: 'ops-cron-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cron-field.html',
  host: { class: 'grid gap-4' },
})
export class CronField implements FormValueControl<string> {
  private readonly fieldId = nextCronFieldId++;

  readonly value = model<string>('');
  readonly disabled = input<boolean>(false);
  readonly readonly = input<boolean>(false);
  readonly invalid = input<boolean>(false);

  readonly label = input<string>('Cron expression');

  protected readonly inputId = `cron-input-${this.fieldId}`;
  protected readonly summaryId = `cron-summary-${this.fieldId}`;

  protected readonly advanced = signal(false);
  protected readonly weekdays = WEEKDAYS;
  protected readonly frequency = computed(() => this.advanced() ? 'custom' : scheduleFrequency(this.value()));
  protected readonly description = computed(() => describeCron(this.value()));
  protected readonly parts = computed(() => this.value().trim().split(/\s+/));
  protected readonly time = computed(() => {
    const [minute, hour] = this.parts();
    return /^\d+$/.test(minute) && /^\d+$/.test(hour) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : '09:00';
  });

  protected setFrequency(event: Event): void {
    const frequency = (event.target as HTMLSelectElement).value as ScheduleFrequency;
    this.advanced.set(frequency === 'custom');
    const [hour, minute] = this.time().split(':').map(Number);
    const expressions = { minute: '* * * * *', interval: '*/5 * * * *', hourly: '0 * * * *', daily: `${minute} ${hour} * * *`, weekdays: `${minute} ${hour} * * 1-5`, weekly: `${minute} ${hour} * * 1`, custom: this.value() };
    this.value.set(expressions[frequency]);
  }

  protected setTime(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    const [hour, minute] = value.split(':').map(Number);
    const day = this.frequency() === 'weekdays' ? '1-5' : this.frequency() === 'weekly' ? this.parts()[4] : '*';
    this.value.set(`${minute} ${hour} * * ${day}`);
  }

  protected setMinute(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value === '' || !input.validity.valid) return;
    this.value.set(`${input.valueAsNumber} * * * *`);
  }

  protected setInterval(event: Event): void {
    this.value.set(`*/${(event.target as HTMLSelectElement).value} * * * *`);
  }

  protected setDay(event: Event): void {
    const [hour, minute] = this.time().split(':').map(Number);
    this.value.set(`${minute} ${hour} * * ${(event.target as HTMLSelectElement).value}`);
  }

  protected readonly valid = computed(() => isValidCronExpression(this.value().trim()));

  protected onInput(event: Event): void {
    this.advanced.set(true);
    this.value.set((event.target as HTMLInputElement).value);
  }
}
