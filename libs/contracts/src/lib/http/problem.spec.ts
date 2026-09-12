import { isApiProblem, PROBLEM_TYPES } from './problem';
import type { ProblemType } from './problem.types';

describe('isApiProblem', () => {
  it.each([
    { type: 'internal', status: 500 },
    { type: 'internal', title: 123, status: 500 },
    { type: 'internal', title: 'Error', status: NaN },
    { type: 'validation_failed', title: 'Error', status: 422, errors: null },
    { type: 'validation_failed', title: 'Error', status: 422, errors: [] },
    { type: 'validation_failed', title: 'Error', status: 422, errors: { name: 5 } },
    { type: 'validation_failed', title: 'Error', status: 422, errors: { name: [5] } },
  ])('rejects malformed problem details: %j', (body) => {
    expect(isApiProblem(body)).toBe(false);
  });

  it('accepts field errors that the console can render', () => {
    const p1 = { type: 'validation_failed' as const, title: 'Invalid name', status: 422 };
    const body = { ...p1, errors: { name: ['A name is required.'] } };
    expect(isApiProblem(body)).toBe(true);
  });

  it.each(PROBLEM_TYPES)('accepts %s', (type: ProblemType) => {
    expect(isApiProblem({ type, title: 'x', status: 400 })).toBe(true);
  });

  it('rejects a type that is not on the wire', () => {
    expect(isApiProblem({ type: 'workflow_not_found_typo', title: 'x', status: 404 })).toBe(false);
  });
});
