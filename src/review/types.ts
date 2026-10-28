import type { Point } from '../types.ts'

export type Vec3 = [number, number, number]
export type Anchor = { element: string; local: Vec3; world: Vec3 }
export type Author = { kind: 'user' | 'assistant' | 'system'; id: string | null; name: string }
export type Message = { id: string; body: string; createdAt: string; author: Author; source?: string }
export type Thread = {
  id: string
  anchor: Anchor
  text: string
  author: Author
  createdAt: string
  updatedAt: string
  status: 'open' | 'resolved'
  replies: Message[]
}
export type Dimension = { id: string; room: string; label: string; start: Vec3; end: Vec3 }
export type Measurement = Dimension & { measuredM: number; updatedAt: string; author: Author }
export type ReviewDocument = {
  schemaVersion: 1
  frame: string
  sequence: number
  threads: Thread[]
  measurements: Measurement[]
}
export type ReviewConfig = {
  id: string
  frame: string
  storage: string
  dimensions?: { id: string; room: string; label: string; start: Point; end: Point }[]
}
export type ReviewOperation =
  | { kind: 'thread'; thread: Thread }
  | { kind: 'reply'; threadId: string; reply: Message }
  | { kind: 'edit'; threadId: string; text: string; updatedAt: string; expected: string }
  | { kind: 'status'; threadId: string; status: Thread['status']; expected: string }
  | { kind: 'measurement'; measurement: Measurement; expected: string }
