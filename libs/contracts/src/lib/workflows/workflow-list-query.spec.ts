import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../http/pagination';
import { DEFAULT_WORKFLOW_SORT, WORKFLOW_SORTS } from './workflow-list-query';
import { hasActiveFilters } from './workflow-list-query';
import { parseWorkflowListQuery } from './workflow-list-query';
import { serializeWorkflowListQuery } from './workflow-list-query';

describe('parseWorkflowListQuery', () => {
  it('ignores non-string URL values instead of coercing or calling string methods', () => {
    const p1 = { q: ['one', 'two'], enabled: {}, actionType: null };
    const malformed = { ...p1, sort: ['name'], page: ['2'], pageSize: { value: '100' } };
    expect(parseWorkflowListQuery(malformed)).toEqual(parseWorkflowListQuery({}));
  });

  it('falls back to defaults for an empty url', () => {
    const p1 = { q: undefined, enabled: undefined, actionType: undefined };
    const p2 = { sort: DEFAULT_WORKFLOW_SORT, page: 1, pageSize: PAGE_SIZE_DEFAULT };
    expect(parseWorkflowListQuery({})).toEqual({ ...p1, ...p2 });
  });

  it('reads a full filter set', () => {
    const p1 = { q: 'nightly', enabled: 'false', actionType: 'webhook' };
    const query = parseWorkflowListQuery({ ...p1, sort: '-updatedAt', page: '3', pageSize: '50' });

    expect(query).toEqual({ q: 'nightly', enabled: false, actionType: 'webhook', sort: '-updatedAt', page: 3, pageSize: 50 });
  });

  it('clamps a page size a client asked to be absurd', () => {
    expect(parseWorkflowListQuery({ pageSize: '9999' }).pageSize).toBe(PAGE_SIZE_MAX);
    expect(parseWorkflowListQuery({ pageSize: '0' }).pageSize).toBe(1);
  });

  it('floors a negative page at the first one', () => {
    expect(parseWorkflowListQuery({ page: '-3' }).page).toBe(1);
  });

  it.each(['1e308', String(Number.MAX_SAFE_INTEGER)])('keeps the database offset safe for page %s', (page) => {
    const query = parseWorkflowListQuery({ page, pageSize: String(PAGE_SIZE_MAX) });
    expect(Number.isSafeInteger((query.page - 1) * query.pageSize)).toBe(true);
  });

  it('ignores a sort that is not on the whitelist, so nothing reaches ORDER BY', () => {
    expect(parseWorkflowListQuery({ sort: 'name; DROP TABLE workflows' }).sort).toBe(DEFAULT_WORKFLOW_SORT);
  });

  it('ignores an action type the domain does not know', () => {
    expect(parseWorkflowListQuery({ actionType: 'carrier-pigeon' }).actionType).toBeUndefined();
  });

  it('treats anything but true/false as no preference', () => {
    expect(parseWorkflowListQuery({ enabled: 'yes' }).enabled).toBeUndefined();
  });

  it('trims a search term and treats whitespace as no search', () => {
    expect(parseWorkflowListQuery({ q: '  nightly  ' }).q).toBe('nightly');
    expect(parseWorkflowListQuery({ q: '   ' }).q).toBeUndefined();
  });

  it('never throws, whatever the url contains', () => {
    const junk = { q: '', enabled: '1', actionType: '', sort: '', page: 'abc', pageSize: 'NaN' };

    expect(() => parseWorkflowListQuery(junk)).not.toThrow();
    expect(parseWorkflowListQuery(junk).pageSize).toBe(PAGE_SIZE_DEFAULT);
  });
});

describe('serializeWorkflowListQuery', () => {
  it('omits every value that is already the default, keeping a fresh url clean', () => {
    const query = parseWorkflowListQuery({});

    expect(serializeWorkflowListQuery(query)).toEqual({});
  });

  it('round-trips a filter set through the url and back', () => {
    const p1 = { q: 'nightly', enabled: 'false', actionType: 'noop' };
    const original = parseWorkflowListQuery({ ...p1, sort: '-name', page: '4', pageSize: '50' });

    expect(parseWorkflowListQuery(serializeWorkflowListQuery(original))).toEqual(original);
  });

  it('round-trips every sort option', () => {
    for (const sort of WORKFLOW_SORTS) {
      const original = parseWorkflowListQuery({ sort });

      expect(parseWorkflowListQuery(serializeWorkflowListQuery(original)).sort).toBe(sort);
    }
  });

  it('keeps `enabled=false`, which is a real filter and not an absent one', () => {
    const query = parseWorkflowListQuery({ enabled: 'false' });

    expect(serializeWorkflowListQuery(query)).toEqual({ enabled: 'false' });
  });
});

describe('hasActiveFilters', () => {
  it('is false for an untouched list, so the empty state offers Create', () => {
    expect(hasActiveFilters(parseWorkflowListQuery({}))).toBe(false);
  });

  it('ignores paging and sorting, which do not exclude anything', () => {
    expect(hasActiveFilters(parseWorkflowListQuery({ page: '2', sort: '-name' }))).toBe(false);
  });

  it('is true once a filter could hide rows, so the empty state offers Clear', () => {
    expect(hasActiveFilters(parseWorkflowListQuery({ q: 'nightly' }))).toBe(true);
    expect(hasActiveFilters(parseWorkflowListQuery({ enabled: 'false' }))).toBe(true);
    expect(hasActiveFilters(parseWorkflowListQuery({ actionType: 'webhook' }))).toBe(true);
  });
});
