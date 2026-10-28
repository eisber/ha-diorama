import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  chooseArchiveFrame,
  localUrl,
  validateArchive,
  validateTelemetry,
  type ArchiveIndex,
} from '../src/inspect/data.ts'

test('inspection assets reject credentials, remote resources and query tokens', () => {
  assert.equal(localUrl('/local/demo.json', 'https://example.invalid'), 'https://example.invalid/local/demo.json')
  for (const path of [
    'https://remote.invalid/data',
    '/data?token=x',
    'file:///private',
    'https://name:password@example.invalid/data',
  ])
    assert.throws(() => localUrl(path, 'https://example.invalid'), /same-origin/)
})
test('camera selection respects coverage holes and reports the actual frame', () => {
  const index: ArchiveIndex = {
    formatVersion: 1,
    status: 'partial',
    camera: 'synthetic',
    generatedAt: 500,
    start: 100,
    end: 400,
    frames: [
      [110, 'first.jpg'],
      [310, 'second.jpg'],
    ],
    coverage: [
      [100, 150],
      [300, 400],
    ],
  }
  validateArchive(index, 'synthetic', 500)
  assert.equal(chooseArchiveFrame(index, 120)[0], 110)
  assert.throws(() => chooseArchiveFrame(index, 200), /No recording/)
  assert.throws(
    () => validateArchive({ ...index, frames: [[110, '../private.jpg']] }, 'synthetic', 500),
    /Invalid archive frame/,
  )
})
test('host identity, observation age and source error are never shown as healthy defaults', () => {
  const value = {
    formatVersion: 1,
    status: 'ok',
    node: 'demo-host',
    generatedAt: 1000,
    observedAt: 900,
    current: { cpu: 20, memory: 30, disk: 40, temperature: 45, uptimeSeconds: 100 },
    history: { cpu: [[900, 20]], memory: [[900, 30]], disk: [[900, 40]] },
  }
  validateTelemetry(value, 'demo-host', 180, 1100)
  assert.throws(() => validateTelemetry(value, 'other-host', 180, 1100), /another host/)
  assert.throws(() => validateTelemetry(value, 'demo-host', 180, 190_000), /stale/)
  assert.throws(() => validateTelemetry({ ...value, status: 'error' }, 'demo-host', 180, 1100), /unavailable/)
})
