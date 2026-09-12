import { DEFAULT_RUN_SORT, hasActiveRunFilters, parseRunListQuery, serializeRunListQuery } from './run-list-query';

describe('parseRunListQuery', () => {
  it('defaults to newest first without inventing a status filter', () => {
    expect(parseRunListQuery({})).toEqual({ status: undefined, workflowId: undefined, sort: DEFAULT_RUN_SORT, page: 1, pageSize: 20 });
  });

  it('accepts a known status and a uuid workflow, and ignores the rest', () => {
    const workflowId = '00000000-0000-4000-8000-0000000000a1';
    const query = parseRunListQuery({ status: 'failed', workflowId, sort: 'createdAt', page: '2' });
    expect(query.status).toBe('failed');
    expect(query.workflowId).toBe(workflowId);
    expect(query.sort).toBe('createdAt');
    expect(query.page).toBe(2);
    expect(parseRunListQuery({ status: 'pending', workflowId: 'not-a-uuid' }).status).toBeUndefined();
    expect(parseRunListQuery({ status: 'pending', workflowId: 'not-a-uuid' }).workflowId).toBeUndefined();
  });

  it('round-trips through the url', () => {
    const original = parseRunListQuery({ status: 'running', sort: 'createdAt', page: '3', pageSize: '50' });
    expect(parseRunListQuery(serializeRunListQuery(original))).toEqual(original);
    expect(hasActiveRunFilters(parseRunListQuery({}))).toBe(false);
    expect(hasActiveRunFilters(original)).toBe(true);
  });
});
