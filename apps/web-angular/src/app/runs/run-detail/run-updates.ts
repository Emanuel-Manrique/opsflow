import { HttpEventType } from '@angular/common/http';
import type { HttpClient } from '@angular/common/http';
import { EMPTY, catchError, concat, concatMap, defer, map, of, repeat } from 'rxjs';
import { takeWhile, timeout } from 'rxjs';
import type { Observable } from 'rxjs';
import { isRunDto, isRunEventDto, RUN_EVENT_APPENDED, RUN_UPDATED_EVENT } from '@opsflow/contracts';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import { isTerminalRun } from '@opsflow/domain';
import { toProblem } from '../../core/http/interceptors';
import type { RunUpdatesState } from './run-updates.types';

export function watchRun(http: HttpClient, id: string): Observable<RunUpdatesState> {
  return defer(() => {
    let latest: RunDto | undefined;
    // Survives reconnects: the stream replays from the start, and anything already
    // held is dropped by id rather than shown twice.
    let history: readonly RunEventDto[] = [];
    let lastEventId = 0n;
    let interrupted = false;
    return defer(() => {
      let consumed = 0;
      const p1 = { observe: 'events' as const, responseType: 'text' as const };
      const options = { ...p1, reportProgress: true };
      const stream = http.get(`/api/runs/${id}/events`, options).pipe(
        timeout({ each: 15_000 }),
        concatMap((event) => {
          let text = '';
          if (event.type === HttpEventType.DownloadProgress) text = event.partialText ?? '';
          if (event.type === HttpEventType.Response) text = event.body ?? '';
          const updates: RunDto[] = [];
          const appended: RunEventDto[] = [];
          let eventCursor = lastEventId;
          // Frames arrive LF-delimited, one JSON data line each.
          let end = text.indexOf('\n\n', consumed);
          while (end !== -1) {
            const frame = text.slice(consumed, end);
            consumed = end + 2;
            const lines = frame.split('\n');
            const type = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
            const payload = lines.find((line) => line.startsWith('data:'))?.slice(5);
            if (type === 'error') throw new Error('Run stream interrupted.');
            if (type === RUN_UPDATED_EVENT) {
              const run: unknown = JSON.parse(payload ?? 'null');
              if (!isRunDto(run) || run.id !== id) throw new Error('Invalid run update.');
              updates.push(run);
            }
            if (type === RUN_EVENT_APPENDED) {
              const entry: unknown = JSON.parse(payload ?? 'null');
              if (!isRunEventDto(entry) || entry.runId !== id) throw new Error('Invalid run event.');
              const eventId = BigInt(entry.id);
              if (eventId > eventCursor) {
                appended.push(entry);
                eventCursor = eventId;
              }
            }
            end = text.indexOf('\n\n', consumed);
          }
          if (appended.length) {
            history = [...history, ...appended];
            lastEventId = eventCursor;
          }
          return updates;
        }),
        map((run): RunUpdatesState => {
          latest = run;
          interrupted = false;
          return { connection: 'live', run, events: history };
        }),
        catchError((error: unknown) => {
          const problem = toProblem(error);
          const permanent = problem.status >= 400 && problem.status < 500;
          const connection = permanent ? 'failed' as const : 'reconnecting' as const;
          interrupted = true;
          return of<RunUpdatesState>({ connection, run: latest, events: history, problem });
        }),
      );
      const opening = defer<Observable<RunUpdatesState>>(() => {
        if (!latest) return of({ connection: 'connecting' as const, run: undefined, events: history });
        if (interrupted) return of({ connection: 'reconnecting' as const, run: latest, events: history });
        return EMPTY;
      });

      return concat(opening, stream);
    }).pipe(
      repeat({ delay: 1_000 }),
      takeWhile((state) => state.connection !== 'failed' && !(state.run && isTerminalRun(state.run.status)), true),
    );
  });
}
