import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { inject, provideAppInitializer } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { apiInterceptor } from './core/http/interceptors';
import { appRoutes } from './app.routes';
import { Session } from './core/session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideAppInitializer(() => inject(Session).restore()),
  ],
};
