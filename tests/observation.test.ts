import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observedLevel } from '../src/observation.ts'

test('observational geometry uses explicit ranges without inventing endpoint confirmation', () => {
  const range = { min: 0, max: 100 }
  assert.equal(observedLevel('25', range), 0.25)
  assert.equal(observedLevel('25', { ...range, invert: true }), 0.75)
  assert.equal(observedLevel('110', range), 1)
  for (const missing of ['', ' ', 'unavailable', 'unknown', undefined])
    assert.equal(observedLevel(missing, range), null)
  assert.throws(() => observedLevel('25', { min: 100, max: 0 }), /increasing/)
})
