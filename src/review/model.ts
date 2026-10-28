import type { RoomConfig } from '../types.ts'
import type { Anchor, Author, Dimension, ReviewConfig, ReviewDocument, ReviewOperation, Vec3 } from './types.ts'

export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]]),
        )
      : item,
  )

export const emptyReview = (frame: string): ReviewDocument => ({
  schemaVersion: 1,
  frame,
  sequence: 0,
  threads: [],
  measurements: [],
})
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 2000): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const vector = (value: unknown): value is Vec3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10_000)
const author = (value: unknown): value is Author =>
  object(value) &&
  ['user', 'assistant', 'system'].includes(String(value.kind)) &&
  (value.id === null || text(value.id, 128)) &&
  text(value.name, 100)
const anchor = (value: unknown): value is Anchor =>
  object(value) && text(value.element, 200) && vector(value.local) && vector(value.world)
const unique = (items: Record<string, unknown>[]) =>
  items.every(item => text(item.id, 128)) && new Set(items.map(item => item.id)).size === items.length

export function validateReview(value: unknown, frame: string): asserts value is ReviewDocument {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.frame !== frame ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 0 ||
    !Array.isArray(value.threads) ||
    value.threads.length > 100 ||
    !Array.isArray(value.measurements) ||
    value.measurements.length > 500
  )
    throw new Error('Unsupported review format or coordinate frame')
  if (
    !value.threads.every(object) ||
    !value.measurements.every(object) ||
    !unique(value.threads) ||
    !unique(value.measurements)
  )
    throw new Error('Invalid or duplicate review IDs')
  for (const thread of value.threads) {
    if (
      !anchor(thread.anchor) ||
      !text(thread.text) ||
      !author(thread.author) ||
      !date(thread.createdAt) ||
      !date(thread.updatedAt) ||
      !['open', 'resolved'].includes(String(thread.status)) ||
      !Array.isArray(thread.replies) ||
      thread.replies.length > 200 ||
      !thread.replies.every(object) ||
      !unique(thread.replies)
    )
      throw new Error('Invalid comment thread')
    for (const reply of thread.replies) {
      if (
        !text(reply.body) ||
        !date(reply.createdAt) ||
        !author(reply.author) ||
        (reply.source !== undefined && !text(reply.source, 100))
      )
        throw new Error('Invalid reply')
    }
  }
  for (const measurement of value.measurements) {
    if (
      !text(measurement.room, 128) ||
      !text(measurement.label, 200) ||
      !vector(measurement.start) ||
      !vector(measurement.end) ||
      horizontalDistance(measurement.start, measurement.end) < 0.05 ||
      typeof measurement.measuredM !== 'number' ||
      !Number.isFinite(measurement.measuredM) ||
      measurement.measuredM < 0.05 ||
      measurement.measuredM > 100 ||
      !date(measurement.updatedAt) ||
      !author(measurement.author)
    )
      throw new Error('Invalid physical measurement')
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1_048_576) throw new Error('Review exceeds 1 MiB')
}

export const horizontalDistance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])
export const sameDimension = (a: Dimension, b: Dimension) =>
  a.id === b.id &&
  a.room === b.room &&
  a.start.every((n, i) => Math.abs(n - b.start[i]) < 0.002) &&
  a.end.every((n, i) => Math.abs(n - b.end[i]) < 0.002)

export function applyOperation(document: ReviewDocument, operation: ReviewOperation): ReviewDocument {
  const next = structuredClone(document)
  if (operation.kind === 'thread') {
    const existing = next.threads.find(t => t.id === operation.thread.id)
    const root = (t: typeof operation.thread) => ({
      id: t.id,
      text: t.text,
      anchor: t.anchor,
      author: t.author,
      createdAt: t.createdAt,
    })
    if (existing && canonical(root(existing)) !== canonical(root(operation.thread)))
      throw new Error('Comment ID is already in use')
    if (existing) return next
    next.threads.push(structuredClone(operation.thread))
  } else if (operation.kind === 'measurement') {
    const index = next.measurements.findIndex(m => m.id === operation.measurement.id)
    const existing = next.measurements[index]
    if (canonical(existing ?? null) === canonical(operation.measurement)) return next
    if (canonical(existing ?? null) !== operation.expected)
      throw new Error('Measurement changed. Reload before overwriting it')
    if (existing) next.measurements[index] = structuredClone(operation.measurement)
    else next.measurements.push(structuredClone(operation.measurement))
  } else {
    const thread = next.threads.find(t => t.id === operation.threadId)
    if (!thread) throw new Error('This thread was removed. It will not be recreated')
    if (operation.kind === 'reply') {
      const existing = thread.replies.find(r => r.id === operation.reply.id)
      if (existing && canonical(existing) !== canonical(operation.reply)) throw new Error('Reply ID is already in use')
      if (existing) return next
      thread.replies.push(structuredClone(operation.reply))
      thread.status = 'open'
      thread.updatedAt = operation.reply.createdAt > thread.updatedAt ? operation.reply.createdAt : thread.updatedAt
    } else if (operation.kind === 'edit') {
      if (thread.text === operation.text && thread.updatedAt === operation.updatedAt) return next
      if (canonical(thread) !== operation.expected)
        throw new Error('Thread changed. Reload before editing the original')
      thread.text = operation.text
      thread.updatedAt = operation.updatedAt
      thread.status = 'open'
    } else {
      if (thread.status === operation.status) {
        const original = JSON.parse(operation.expected) as typeof thread
        if (canonical({ ...thread, status: original.status }) === operation.expected) return next
      }
      if (canonical(thread) !== operation.expected)
        throw new Error('Thread changed. Read the new messages before changing its status')
      thread.status = operation.status
    }
  }
  next.sequence++
  validateReview(next, document.frame)
  return next
}

export function parseMetres(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error('Enter a length in metres, for example 3.45')
  const metres = Number(normalized)
  if (metres < 0.05 || metres > 100) throw new Error('Length must be between 0.05 and 100 metres')
  return metres
}

// Pick actual polygon cross-sections, not bounding-box edges through empty space.
export function guidedDimensions(rooms: RoomConfig[], config?: ReviewConfig): Dimension[] {
  if (config?.dimensions)
    return config.dimensions.map(d => ({
      ...d,
      start: [d.start[0], 0.03, -d.start[1]],
      end: [d.end[0], 0.03, -d.end[1]],
    }))
  return rooms.flatMap(room =>
    ([0, 1] as const).flatMap(axis => {
      const other = axis === 0 ? 1 : 0
      const coords = room.points.map(p => p[other])
      const lo = Math.min(...coords),
        hi = Math.max(...coords)
      let best: { a: number; b: number; at: number } | null = null
      for (const fraction of [0.5, 0.35, 0.65]) {
        const at = lo + (hi - lo) * fraction
        const hits: number[] = []
        for (let i = 0; i < room.points.length; i++) {
          const a = room.points[i],
            b = room.points[(i + 1) % room.points.length]
          if ((a[other] <= at && b[other] > at) || (b[other] <= at && a[other] > at))
            hits.push(a[axis] + ((at - a[other]) / (b[other] - a[other])) * (b[axis] - a[axis]))
        }
        hits.sort((a, b) => a - b)
        for (let i = 0; i + 1 < hits.length; i += 2)
          if (!best || hits[i + 1] - hits[i] > best.b - best.a) best = { a: hits[i], b: hits[i + 1], at }
      }
      if (!best || best.b - best.a < 0.5) return []
      const { a, b, at } = best
      return [
        {
          id: `${room.id}:${axis === 0 ? 'width' : 'depth'}`,
          room: room.id,
          label: `${room.name ?? room.id} ${axis === 0 ? 'width' : 'depth'}`,
          start: axis === 0 ? [a, 0.03, -at] : [at, 0.03, -a],
          end: axis === 0 ? [b, 0.03, -at] : [at, 0.03, -b],
        },
      ]
    }),
  )
}
