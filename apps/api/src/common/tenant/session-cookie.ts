import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

export const SESSION_COOKIE = 'opsflow_session';

export function sessionToken(req: Request): string {
  const cookies = (req.headers.cookie ?? '').split(';');
  const token = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`))?.trim().slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : '';
}

export function assertSameOriginMutation(req: Request): void {
  // Custom headers require a CORS preflight. This API grants no cross-origin access.
  if (req.header('x-opsflow-request') !== '1' || req.header('sec-fetch-site') === 'cross-site') {
    throw new ForbiddenException({ type: 'forbidden', title: 'A same-origin request is required.' });
  }
}
