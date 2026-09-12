import { ACTION_TYPES, HTTP_METHODS, isActionType, isHttpMethod, validateAction } from './action';

describe('action', () => {
  it.each(ACTION_TYPES)('accepts action type %s', (type) => {
    expect(isActionType(type)).toBe(true);
  });

  it.each(HTTP_METHODS)('accepts HTTP method %s', (method) => {
    expect(isHttpMethod(method)).toBe(true);
  });

  it('rejects values outside the unions', () => {
    expect(isActionType('email')).toBe(false);
    expect(isHttpMethod('HEAD')).toBe(false);
  });

  it('accepts a noop without looking at a URL', () => {
    expect(validateAction({ type: 'noop' })).toEqual([]);
  });

  it('accepts an https webhook', () => {
    const action = { type: 'webhook', url: 'https://hooks.example/alerts', method: 'POST' } as const;
    expect(validateAction(action)).toEqual([]);
  });

  it('rejects a missing URL, credentials and a non-http scheme', () => {
    expect(validateAction({ type: 'webhook', url: '  ', method: 'POST' })).toEqual([{ field: 'url', message: 'A webhook URL is required.' }]);
    expect(validateAction({ type: 'webhook', url: 'https://user:pass@hooks.example', method: 'POST' })).toEqual([{ field: 'url', message: 'Do not put credentials in the URL.' }]);
    expect(validateAction({ type: 'webhook', url: 'file:///tmp/hook', method: 'POST' })).toEqual([{ field: 'url', message: 'Use an http or https URL.' }]);
  });

  it('rejects a URL that is not parseable or is too long', () => {
    expect(validateAction({ type: 'webhook', url: 'https://', method: 'POST' })).toEqual([{ field: 'url', message: 'This is not a URL we can parse.' }]);
    const url = `https://hooks.example/${'a'.repeat(2048)}`;
    expect(validateAction({ type: 'webhook', url, method: 'POST' })).toEqual([{ field: 'url', message: 'Keep the URL to 2048 characters.' }]);
  });
});
