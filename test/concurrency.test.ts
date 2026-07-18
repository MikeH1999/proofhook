import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapWithConcurrency } from '../src/monitoring/concurrency.js'

describe('scheduled monitor concurrency', () => {
  it('preserves order while bounding active checks', async () => {
    let active = 0
    let maximum = 0
    const values = Array.from({ length: 63 }, (_, index) => index)
    const results = await mapWithConcurrency(values, 6, async (value) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return value * 2
    })
    assert.equal(maximum, 6)
    assert.deepEqual(results, values.map((value) => value * 2))
  })
})
