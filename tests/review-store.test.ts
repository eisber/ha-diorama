import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyReview } from '../src/review/model.ts'
import { ReviewStore, type ReviewAssistant } from '../src/review/store.ts'
import type { ReviewConfig, ReviewOperation } from '../src/review/types.ts'

const config: ReviewConfig = { id: 'synthetic', frame: 'test-frame', storage: 'test-review-store' }
function backend() {
  let state = {
    views: [{ cards: [{ type: 'markdown', review_id: config.id, diorama_review: emptyReview(config.frame) }] }],
    unrelated: 'preserved',
  }
  let saves = 0,
    loads = 0
  let race = false
  const hass: ReviewAssistant = {
    states: {},
    areas: {},
    themes: { darkMode: true },
    user: { id: 'demo', name: 'Demo', is_admin: true },
    callService: async () => {
      throw new Error('No device requests allowed')
    },
    callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
      if (message.type === 'lovelace/config') {
        loads++
        if (race && loads === 2) state.unrelated = 'concurrent writer'
        return structuredClone(state) as T
      }
      if (message.type === 'lovelace/config/save') {
        saves++
        state = structuredClone(message.config) as typeof state
        return null as T
      }
      throw new Error(`Unexpected request ${message.type}`)
    },
  }
  return {
    hass,
    get state() {
      return state
    },
    get saves() {
      return saves
    },
    set race(value: boolean) {
      race = value
    },
  }
}
const op: ReviewOperation = {
  kind: 'thread',
  thread: {
    id: 'thread-a',
    text: 'Synthetic annotation',
    anchor: { element: 'room:demo', local: [0, 0, 0], world: [0, 0, 0] },
    author: { kind: 'user', id: 'demo', name: 'Demo' },
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    status: 'open',
    replies: [],
  },
}
test('native review writes verify exact readback, preserve unrelated config and retry without duplication', async () => {
  const server = backend(),
    store = new ReviewStore(() => server.hass, config)
  await store.save(op)
  assert.equal(server.state.unrelated, 'preserved')
  assert.equal((await store.load()).threads.length, 1)
  await store.save(op)
  assert.equal(server.saves, 1)
  server.hass.user!.is_admin = false
  await assert.rejects(() => store.save(op), /administrator/)
})
test('a concurrent config change is rejected before save instead of being overwritten', async () => {
  const server = backend(),
    store = new ReviewStore(() => server.hass, config)
  server.race = true
  await assert.rejects(() => store.save(op), /changed during save/)
  assert.equal(server.saves, 0)
  assert.equal(server.state.unrelated, 'concurrent writer')
})
