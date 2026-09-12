import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { computed, effect, inject, input, signal } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { required, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import type { Subscription } from 'rxjs';
import type { ApiProblem, CreateWorkflowRequest, WorkflowDto } from '@opsflow/contracts';
import type { WebhookActionInput } from '@opsflow/contracts';
import { RUN_ATTEMPTS, WORKFLOW_LIMITS } from '@opsflow/contracts';
import { ACTION_TYPES, HTTP_METHODS, validateAction } from '@opsflow/domain';
import { isValidCronExpression, isValidTimezone } from '@opsflow/domain';
import { describeCron, nextRuns } from '@opsflow/domain';
import { CronField } from './cron-field';
import { toProblem } from '../../core/http/interceptors';
import { WorkflowsApi } from '../data/workflows-api';
import type { WorkflowFormModel } from './workflow-editor.types';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const b1 = { name: '', enabled: false, cronExpr: '0 3 * * *' };
const b2 = { timezone, actionType: 'noop' as const, webhookUrl: '', webhookMethod: 'POST' as const };
const BLANK: WorkflowFormModel = { ...b1, ...b2 };

@Component({
  selector: 'ops-workflow-editor',
  imports: [CronField, FormField, KeyValuePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workflow-editor.html',
})
export class WorkflowEditor {
  private readonly api = inject(WorkflowsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryCount = signal(0);
  private readonly cancelSave = new Subject<void>();

  readonly id = input<string | undefined>();

  protected readonly maxAttempts = RUN_ATTEMPTS;
  protected readonly describeCron = describeCron;
  protected readonly timezones = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
  protected readonly actionTypes = ACTION_TYPES;
  protected readonly httpMethods = HTTP_METHODS;
  protected readonly model = signal<WorkflowFormModel>({ ...BLANK });
  protected readonly timezoneOptions = computed(() => {
    const current = this.model().timezone;
    return current && !this.timezones.includes(current) ? [current, ...this.timezones] : this.timezones;
  });
  protected readonly actionCopy = computed(() => this.actionSummary(this.model()));
  protected readonly enabledCopy = computed(() => this.model().enabled ? 'On · starts without clicking Run now' : 'Paused · manual runs only');
  protected formatOccurrence(date: Date): string {
    const p1 = { timeZone: this.model().timezone, weekday: 'short' as const, month: 'short' as const, day: 'numeric' as const };
    const p2 = { hour: '2-digit' as const, minute: '2-digit' as const, hour12: true, timeZoneName: 'short' as const };
    return new Intl.DateTimeFormat('en-US', { ...p1, ...p2 }).format(date);
  }
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly pendingDelete = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly problem = signal<ApiProblem | undefined>(undefined);
  protected readonly isEditing = computed(() => Boolean(this.id()));

  protected readonly form = form(this.model, (path) => {
    validate(path.name, ({ value }) => value().trim() ? undefined : { kind: 'required', message: 'Give the workflow a name.' });
    maxLength(path.name, WORKFLOW_LIMITS.nameMaxLength, {
      message: `Keep the name under ${WORKFLOW_LIMITS.nameMaxLength} characters.`,
    });

    validate(path.cronExpr, ({ value }) => {
      if (!value().trim()) {
        return { kind: 'required', message: 'A schedule is required.' };
      }

      const message = 'Use five fields, for example 0 3 * * *.';
      return isValidCronExpression(value()) ? undefined : { kind: 'cron', message };
    });

    validate(path.timezone, ({ value }) => {
      const message = 'Unknown timezone.';
      return isValidTimezone(value()) ? undefined : { kind: 'timezone', message };
    });

    required(path.webhookUrl, {
      message: 'A webhook needs a URL to call.',
      when: ({ valueOf }) => valueOf(path.actionType) === 'webhook',
    });

    validate(path.webhookUrl, ({ value, valueOf }) => {
      if (valueOf(path.actionType) !== 'webhook' || !value().trim()) return undefined;
      const action = { type: 'webhook' as const, url: value().trim(), method: valueOf(path.webhookMethod) };
      const problem = validateAction(action).find((row) => row.field === 'url');
      if (!problem) return undefined;
      return { kind: 'url', message: problem.message };
    });
  });

  protected readonly upcomingRuns = computed<readonly Date[]>(() => {
    const { cronExpr, timezone } = this.model();

    try {
      return nextRuns(cronExpr, timezone, 3);
    } catch {
      return [];
    }
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.retryCount();
      onCleanup(() => this.cancelSave.next());

      if (id) {
        const request = this.load(id);
        onCleanup(() => request.unsubscribe());
      } else {
        this.prepareCreate();
      }
    });
  }

  protected retry(): void {
    this.retryCount.update((count) => count + 1);
  }

  protected askDelete(): void {
    this.pendingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const id = this.id();
    if (!id || this.deleting() || this.saving()) return;
    this.deleting.set(true);
    this.problem.set(undefined);
    try {
      const pending = this.api.remove(id).pipe(takeUntil(this.cancelSave), takeUntilDestroyed(this.destroyRef));
      await firstValueFrom(pending, { defaultValue: undefined });
      if (this.destroyRef.destroyed || this.id() !== id) return;
      await this.router.navigate(['/workflows']);
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed && this.id() === id) this.problem.set(toProblem(error));
    } finally {
      if (!this.destroyRef.destroyed) this.deleting.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const id = this.id();
    this.problem.set(undefined);
    this.saving.set(true);

    try {
      await submit(this.form, async () => {
        const body = this.toRequest();
        const request = id ? this.api.update(id, body) : this.api.create(body);
        const pending = request.pipe(takeUntil(this.cancelSave), takeUntilDestroyed(this.destroyRef));
        const saved = await firstValueFrom(pending, { defaultValue: undefined });
        if (!saved || this.destroyRef.destroyed || this.id() !== id) return;
        const queryParams = { q: saved.name };

        await this.router.navigate(['/workflows'], { queryParams });
      });
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed && this.id() === id) this.problem.set(toProblem(error));
    } finally {
      if (!this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  private prepareCreate(): void {
    this.form().reset({ ...BLANK });
    this.problem.set(undefined);
    this.loaded.set(true);
    this.loading.set(false);
  }

  private load(id: string): Subscription {
    this.loading.set(true);
    this.loaded.set(false);
    this.problem.set(undefined);

    const next = (workflow: WorkflowDto) => {
      const isWebhook = workflow.action.type === 'webhook';
      const p1 = { name: workflow.name, enabled: workflow.enabled, cronExpr: workflow.cronExpr };
      const p2 = { timezone: workflow.timezone, actionType: workflow.action.type };
      const p3 = { webhookUrl: isWebhook ? workflow.action.url : '', webhookMethod: isWebhook ? workflow.action.method : 'POST' as const };
      this.form().reset({ ...p1, ...p2, ...p3 });
      this.loaded.set(true);
      this.loading.set(false);
    };
    const error = (error: unknown) => {
      this.problem.set(toProblem(error));
      this.loading.set(false);
    };
    return this.api.findById(id).subscribe({ next, error });
  }

  private toRequest(): CreateWorkflowRequest {
    const value = this.model();
    const p1 = { name: value.name.trim(), enabled: value.enabled, cronExpr: value.cronExpr.trim() };
    const p2 = { timezone: value.timezone.trim(), actionType: value.actionType, webhook: this.toWebhook(value) };
    return { ...p1, ...p2 };
  }

  private actionSummary(value: WorkflowFormModel): string {
    if (value.actionType === 'noop') return 'Test run · verifies the scheduler, queue and worker';
    const target = value.webhookUrl.trim() || 'Add a webhook URL';
    return `${value.webhookMethod} ${target}`;
  }

  private toWebhook(value: WorkflowFormModel): WebhookActionInput | undefined {
    if (value.actionType !== 'webhook') {
      return undefined;
    }

    return { url: value.webhookUrl.trim(), method: value.webhookMethod };
  }
}
