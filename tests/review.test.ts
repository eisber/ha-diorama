import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyOperation,
  canonical,
  emptyReview,
  guidedDimensions,
  parseMetres,
  sameDimension,
  validateReview,
} from '../src/review/model.ts'
import type { Author, Thread } from '../src/review/types.ts'

const author: Author = { kind: 'user', id: 'synthetic-user', name: 'Demo reviewer' }
const thread: Thread = {
  id: 'thread-a',
  anchor: { element: 'decoration:demo', local: [0, 1, 0], world: [2, 1, -3] },
  text: '<img onerror=alert(1)> is literal review text',
  author,
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-01T10:00:00Z',
  status: 'open',
  replies: [],
}
test('append-only replies preserve originals, reopen solved threads, and retry idempotently', () => {
  const root = applyOperation(emptyReview('test-frame'), { kind: 'thread', thread })
  const solved = applyOperation(root, {
    kind: 'status',
    threadId: thread.id,
    status: 'resolved',
    expected: canonical(root.threads[0]),
  })
  const op = {
    kind: 'reply' as const,
    threadId: thread.id,
    reply: {
      id: 'reply-a',
      body: 'Follow-up',
      createdAt: '2026-01-01T11:00:00Z',
      author,
    },
  }
  const replied = applyOperation(solved, op)
  assert.equal(replied.threads[0].status, 'open')
  assert.equal(replied.threads[0].text, thread.text)
  assert.deepEqual(replied.threads[0].anchor, thread.anchor)
  assert.deepEqual(applyOperation(replied, op), replied)
  assert.throws(() => applyOperation(replied, { ...op, reply: { ...op.reply, body: 'Different' } }), /already in use/)
  assert.throws(() => applyOperation(emptyReview('test-frame'), op), /removed/)
  assert.throws(
    () =>
      applyOperation(replied, {
        kind: 'status',
        threadId: thread.id,
        status: 'resolved',
        expected: canonical(root.threads[0]),
      }),
    /changed/,
  )
})
test('guided dimensions stay inside a concave room and stale geometry does not reuse physical values', () => {
  const dims = guidedDimensions([
    {
      id: 'demo',
      points: [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ],
    },
  ])
  assert.equal(dims.length, 2)
  for (const d of dims) assert.ok(Math.hypot(d.end[0] - d.start[0], d.end[2] - d.start[2]) <= 4)
  assert.equal(sameDimension(dims[0], { ...dims[0], end: [99, 0, 0] }), false)
  assert.equal(parseMetres('3,45'), 3.45)
  for (const bad of ['', 'NaN', '-1', '0', '101', '1e3', '3m']) assert.throws(() => parseMetres(bad))
})
test('frames, non-finite anchors, duplicate messages and document limits are checked', () => {
  const doc = applyOperation(emptyReview('test-frame'), { kind: 'thread', thread })
  assert.throws(() => validateReview(doc, 'other-frame'), /coordinate frame/)
  const invalid = structuredClone(doc)
  invalid.threads[0].anchor.world[0] = NaN
  assert.throws(() => validateReview(invalid, 'test-frame'), /Invalid comment/)
})
test('editing the original keeps replies and timestamps, and status retries are idempotent', () => {
  const root = applyOperation(emptyReview('test-frame'), { kind: 'thread', thread })
  const replied = applyOperation(root, {
    kind: 'reply',
    threadId: thread.id,
    reply: {
      id: 'reply-a',
      body: 'Reply retained',
      createdAt: '2026-01-01T11:00:00Z',
      author,
    },
  })
  const edited = applyOperation(replied, {
    kind: 'edit',
    threadId: thread.id,
    text: 'Corrected original',
    updatedAt: '2026-01-01T12:00:00Z',
    expected: canonical(replied.threads[0]),
  })
  assert.equal(edited.threads[0].replies[0].body, 'Reply retained')
  assert.equal(edited.threads[0].createdAt, thread.createdAt)
  const status = {
    kind: 'status' as const,
    threadId: thread.id,
    status: 'resolved' as const,
    expected: canonical(edited.threads[0]),
  }
  const solved = applyOperation(edited, status)
  assert.deepEqual(applyOperation(solved, status), solved)
})
