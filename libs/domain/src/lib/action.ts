import type { Action, ActionProblem, ActionType, HttpMethod } from './action.types';

export const ACTION_TYPES = ['webhook', 'noop'] as const satisfies readonly ActionType[];
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const satisfies readonly HttpMethod[];
export const ACTION_URL_MAX_LENGTH = 2048;

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

export function validateAction(action: Action): readonly ActionProblem[] {
  if (action.type === 'noop') return [];
  // Create-time gate: file: and user:pass must not become a persisted snapshot the worker later fetches.
  const problems: ActionProblem[] = [];
  const url = action.url.trim();
  if (!url) {
    problems.push({ field: 'url', message: 'A webhook URL is required.' });
    return problems;
  }
  if (url.length > ACTION_URL_MAX_LENGTH) {
    problems.push({ field: 'url', message: `Keep the URL to ${ACTION_URL_MAX_LENGTH} characters.` });
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      problems.push({ field: 'url', message: 'Use an http or https URL.' });
    }
    if (parsed.username || parsed.password) {
      problems.push({ field: 'url', message: 'Do not put credentials in the URL.' });
    }
  } catch {
    problems.push({ field: 'url', message: 'This is not a URL we can parse.' });
  }
  if (!isHttpMethod(action.method)) {
    problems.push({ field: 'method', message: 'Use GET, POST, PUT, PATCH or DELETE.' });
  }
  return problems;
}
