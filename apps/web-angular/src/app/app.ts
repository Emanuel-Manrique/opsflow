import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Session } from './core/session';
import { DemoSession } from './session/demo-session';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'ops-root',
  imports: [DemoSession, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  host: { class: 'block min-h-dvh' },
})
export class App {
  // Nav mirrors the routes that exist. A section lands here with its feature, never before it.
  protected readonly sections = [
    { path: '/battle', label: 'Battle View' },
    { path: '/workflows', label: 'Workflows' },
    { path: '/runs', label: 'Runs' },
  ] as const;
  protected readonly session = inject(Session);
}
