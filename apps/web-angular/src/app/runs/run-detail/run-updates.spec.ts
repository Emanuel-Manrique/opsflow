import { HttpClient, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import { watchRun } from './run-updates';
import type { RunUpdatesState } from './run-updates.types';

it('preserves adjacent bigint event IDs and ignores duplicates in the same chunk, including after a malformed frame', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);
  const states: RunUpdatesState[] = [];
  const p1 = { id: 'run-1', workflowId: 'workflow-1', workflowName: 'Canary', status: 'queued' as const };
  const p2 = { attempt: 0, retryOf: null, error: null, createdAt: '2026-09-12T00:00:00Z', startedAt: null, finishedAt: null };
  const run: RunDto = { ...p1, ...p2 };
  const first: RunEventDto = { id: '9007199254740992', runId: run.id, type: 'run.started', attempt: null, traceId: null, errorCode: null, durationMs: null, detail: null, createdAt: run.createdAt };
  const second = { ...first, id: '9007199254740993', type: 'outbox.published' as const };
  const frame = (event: RunEventDto) => `event: run.event\ndata: ${JSON.stringify(event)}\n\n`;
  const snapshot = `event: run.updated\ndata: ${JSON.stringify(run)}\n\n`;
  const subscription = watchRun(TestBed.inject(HttpClient), run.id).subscribe((state) => states.push(state));
  const request = http.expectOne(`/api/runs/${run.id}/events`);
  let partialText = frame(first) + snapshot;
  request.event({ type: HttpEventType.DownloadProgress, loaded: partialText.length, partialText });
  partialText += frame(first) + frame(second) + frame(second) + snapshot;
  request.event({ type: HttpEventType.DownloadProgress, loaded: partialText.length, partialText });
  expect(states.at(-1)?.events.map((event) => event.id)).toEqual([first.id, second.id]);
  const third = { ...second, id: '9007199254740994' };
  partialText += frame(third) + 'event: run.event\ndata: invalid json\n\n';
  request.event({ type: HttpEventType.DownloadProgress, loaded: partialText.length, partialText });
  expect(states.at(-1)?.connection).toBe('reconnecting');
  await vi.waitFor(() => {
    const reconnect = http.expectOne(`/api/runs/${run.id}/events`);
    const replay = frame(first) + frame(second) + frame(third) + snapshot;
    reconnect.event({ type: HttpEventType.DownloadProgress, loaded: replay.length, partialText: replay });
  }, { timeout: 2_000 });
  expect(states.at(-1)?.events.map((event) => event.id)).toEqual([first.id, second.id, third.id]);
  subscription.unsubscribe();
  http.verify();
});
