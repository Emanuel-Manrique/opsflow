export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export function clampPageSize(value: number): number {
  if (!Number.isFinite(value)) {
    return PAGE_SIZE_DEFAULT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), PAGE_SIZE_MAX);
}

export function clampPage(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  const maxPage = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE_MAX);
  return Math.min(Math.max(Math.trunc(value), 1), maxPage);
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.ceil(total / pageSize);
}
