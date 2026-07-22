import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MONITOR_PAGE_SIZES, paginate } from '../src/domain/pagination.js'

describe('monitor run pagination', () => {
  const runs = Array.from({ length: 20 }, (_, index) => index + 1)

  it('defaults to five rows on the first page', () => {
    const page = paginate(runs)
    assert.deepEqual(page.items, [1, 2, 3, 4, 5])
    assert.equal(page.page, 1)
    assert.equal(page.pageSize, 5)
    assert.equal(page.pageCount, 4)
    assert.equal(page.start, 0)
    assert.equal(page.end, 5)
  })

  it('keeps absolute indexes on later pages', () => {
    const page = paginate(runs, 4, 5)
    assert.deepEqual(page.items, [16, 17, 18, 19, 20])
    assert.equal(page.start, 15)
    assert.equal(page.end, 20)
  })

  it('supports every selectable page size', () => {
    assert.deepEqual(MONITOR_PAGE_SIZES, [5, 10, 20, 50])
    for (const pageSize of MONITOR_PAGE_SIZES) {
      assert.equal(paginate(runs, 1, pageSize).pageSize, pageSize)
    }
  })

  it('clamps invalid page inputs and falls back to five rows', () => {
    assert.equal(paginate(runs, 99, 7).page, 4)
    assert.equal(paginate(runs, Number.NaN, 7).page, 1)
    assert.equal(paginate(runs, 1, 7).pageSize, 5)
  })

  it('returns an empty first page for no runs', () => {
    const page = paginate([])
    assert.deepEqual(page.items, [])
    assert.equal(page.page, 1)
    assert.equal(page.pageCount, 1)
    assert.equal(page.start, 0)
    assert.equal(page.end, 0)
  })
})
