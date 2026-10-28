import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { HomeAssistant } from '../src/types.ts'
import { hookHarness } from './hooks.ts'

test('live unavailable and blank values end numeric history with a gap', async () => {
  const harness = hookHarness()
  mock.module('react', { namedExports: harness.hooks })
  const { useHistory } = await import('../src/tiles/history.ts')
  const timers: unknown[] = []
  mock.method(globalThis, 'setInterval', (callback: unknown) => {
    timers.push(callback)
    return 0
  })
  const hass = {
    states: { 'sensor.demo': { state: 'unknown' } },
    callWS: async () => ({ 'sensor.demo': [{ s: '8', lu: 1 }, { s: '', lu: 2 }, { s: '12', lu: 3 }] }),
  } as unknown as HomeAssistant
  const read = () => harness.render(() => useHistory(hass, 'sensor.demo', 24))
  assert.equal(read(), null)
  await Promise.resolve()
  assert.deepEqual(read()!.map(p => p.v), [8, null, 12, null])
  hass.states['sensor.demo'].state = ' '
  assert.equal(read()!.at(-1)!.v, null)
  hass.states['sensor.demo'].state = '0'
  assert.equal(read()!.at(-1)!.v, 0)
  assert.ok(timers.length > 0)
})
