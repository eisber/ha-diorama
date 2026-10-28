import assert from 'node:assert/strict'
import { test } from 'node:test'
import { historyPoints, linePaths, numericState } from '../src/tiles/history.ts'

test('recorder values keep unknown, unavailable and blank samples as gaps, not zeros', () => {
  const points = historyPoints([
    { s: '12', lu: 1 },
    { s: 'unavailable', lu: 2 },
    { s: 'unknown', lc: 3 },
    { s: '', lu: 4 },
    { s: '   ', lu: 5 },
    { s: '0', lu: 6 },
    { s: '-4.5', lu: 7 },
    { s: 'Infinity', lu: 8 },
    { s: '9' },
  ])
  assert.deepEqual(points.map(p => p.v), [12, null, null, null, null, 0, -4.5, null])
  assert.deepEqual(points.map(p => p.t), [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])
  assert.equal(numericState(undefined), null)
  assert.equal(numericState('NaN'), null)
})

test('line and fill each restart after every gap, with one finite scale for all segments', () => {
  const points = historyPoints([
    { s: '', lu: 0 },
    { s: '2', lu: 1 },
    { s: '4', lu: 2 },
    { s: 'unknown', lu: 3 },
    { s: '8', lu: 4 },
    { s: '6', lu: 5 },
    { s: 'unavailable', lu: 6 },
  ])
  for (const steps of [false, true]) {
    const paths = linePaths(points, 60, 20, steps, 1)!
    assert.equal(paths.low, 2)
    assert.equal(paths.high, 8)
    assert.equal(paths.line.match(/M/g)?.length, 2)
    assert.equal(paths.area.match(/M/g)?.length, 2)
    assert.equal(paths.area.match(/Z/g)?.length, 2)
    assert.ok(paths.line.startsWith('M10.00,19.00'))
    assert.ok(paths.area.includes('L20.00,20L10.00,20Z'))
    assert.ok(paths.area.endsWith('L50.00,20L40.00,20Z'))
    assert.doesNotMatch(paths.line + paths.area, /NaN|Infinity/)
  }
})

test('empty, missing, singleton, constant and invalid numeric samples produce safe SVG', () => {
  assert.equal(linePaths([], 100, 30), null)
  assert.equal(linePaths([{ t: 1, v: null }], 100, 30), null)
  assert.equal(linePaths([{ t: NaN, v: 4 }], 100, 30), null)
  assert.equal(linePaths([{ t: 1, v: 4 }], NaN, 30), null)
  const singleton = linePaths([{ t: 1, v: 4 }], 100, 30)!
  assert.equal(singleton.low, 3)
  assert.equal(singleton.high, 5)
  assert.doesNotMatch(singleton.line + singleton.area, /NaN|Infinity/)
  const paths = linePaths([
    { t: 1, v: 4 }, { t: 2, v: NaN }, { t: 3, v: Infinity }, { t: 4, v: 4 },
  ], 100, 30)!
  assert.equal(paths.line.match(/M/g)?.length, 2)
  assert.doesNotMatch(paths.line + paths.area, /NaN|Infinity/)
})
