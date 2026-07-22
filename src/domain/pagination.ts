export const MONITOR_PAGE_SIZES = [5, 10, 20, 50] as const

export interface PageSlice<T> {
  items: T[]
  page: number
  pageSize: number
  pageCount: number
  start: number
  end: number
  total: number
}

export function paginate<T>(
  items: readonly T[],
  requestedPage = 1,
  requestedPageSize: number = MONITOR_PAGE_SIZES[0]
): PageSlice<T> {
  const pageSize = MONITOR_PAGE_SIZES.includes(requestedPageSize as (typeof MONITOR_PAGE_SIZES)[number])
    ? requestedPageSize
    : MONITOR_PAGE_SIZES[0]
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(1, normalizedPage), pageCount)
  const start = (page - 1) * pageSize
  const end = Math.min(start + pageSize, items.length)

  return {
    items: items.slice(start, end),
    page,
    pageSize,
    pageCount,
    start,
    end,
    total: items.length,
  }
}
