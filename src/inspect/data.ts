export type InspectionConfig = {
  title?: string
  entities?: string[]
  logo?: string
  telemetry?: { url: string; node: string; max_age_seconds?: number }
  archive?: { index: string; base: string; camera: string; max_offset_seconds?: number }
}
export type HostTelemetry = {
  formatVersion: 1
  status: 'ok'
  node: string
  generatedAt: number
  observedAt: number
  current: { cpu: number; memory: number; disk: number; temperature: number; uptimeSeconds: number }
  history: Record<string, [number, number | null][]>
}
export type ArchiveIndex = {
  formatVersion: 1
  camera: string
  generatedAt: number
  start: number
  end: number
  status: 'ok' | 'partial'
  frames: [number, string][]
  coverage: [number, number][]
}
export function localUrl(value: string, origin: string) {
  const url = new URL(value, origin)
  if (
    url.origin !== origin ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use a same-origin asset path without credentials, tokens or query parameters')
  return url.href
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
export function validateTelemetry(
  value: unknown,
  node: string,
  maxAge = 180,
  now = Date.now(),
): asserts value is HostTelemetry {
  if (
    !Number.isFinite(maxAge) ||
    maxAge <= 0 ||
    maxAge > 3600 ||
    !record(value) ||
    value.formatVersion !== 1 ||
    value.node !== node ||
    value.status !== 'ok' ||
    !finite(value.generatedAt) ||
    !finite(value.observedAt) ||
    value.generatedAt > now + 30_000 ||
    value.observedAt > value.generatedAt ||
    now - value.generatedAt > maxAge * 1000 ||
    now - value.observedAt > maxAge * 1000 ||
    !record(value.current) ||
    !record(value.history)
  )
    throw new Error('Telemetry is unavailable, stale or belongs to another host')
  for (const key of ['cpu', 'memory', 'disk']) {
    const n = value.current[key]
    if (!finite(n) || n < 0 || n > 100) throw new Error('Invalid host utilization')
    const rows = value.history[key]
    if (!Array.isArray(rows) || rows.length > 300) throw new Error('Invalid host history')
    let last = -Infinity
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length !== 2 ||
        !finite(row[0]) ||
        row[0] <= last ||
        row[0] > value.generatedAt ||
        (row[1] !== null && (!finite(row[1]) || row[1] < 0 || row[1] > 100))
      )
        throw new Error('Invalid host history point')
      last = row[0]
    }
  }
  if (
    !finite(value.current.temperature) ||
    value.current.temperature < -40 ||
    value.current.temperature > 150 ||
    !finite(value.current.uptimeSeconds) ||
    value.current.uptimeSeconds < 0
  )
    throw new Error('Invalid host temperature or uptime')
}
export function validateArchive(value: unknown, camera: string, now = Date.now()): asserts value is ArchiveIndex {
  if (
    !record(value) ||
    value.formatVersion !== 1 ||
    value.camera !== camera ||
    !['ok', 'partial'].includes(String(value.status)) ||
    !finite(value.generatedAt) ||
    !finite(value.start) ||
    !finite(value.end) ||
    value.start >= value.end ||
    value.end > value.generatedAt ||
    value.generatedAt > now + 120_000 ||
    value.end - value.start > 86_400_000 ||
    !Array.isArray(value.frames) ||
    value.frames.length > 2000 ||
    !Array.isArray(value.coverage) ||
    value.coverage.length > 20_000
  )
    throw new Error('Invalid camera archive index')
  let last = -Infinity
  for (const row of value.frames) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !finite(row[0]) ||
      row[0] <= last ||
      row[0] < value.start ||
      row[0] > value.end ||
      typeof row[1] !== 'string' ||
      !/^[a-zA-Z0-9_-]+\.jpg$/.test(row[1])
    )
      throw new Error('Invalid archive frame')
    last = row[0]
  }
  last = -Infinity
  for (const row of value.coverage) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !row.every(finite) ||
      row[0] < value.start ||
      row[1] > value.end ||
      row[0] < last ||
      row[1] < row[0]
    )
      throw new Error('Invalid archive coverage')
    last = row[1]
  }
}
export function chooseArchiveFrame(index: ArchiveIndex, stamp: number, maxOffsetSeconds = 90) {
  const interval = index.coverage.find(([from, to]) => stamp >= from && stamp <= to)
  if (!interval || stamp > index.end) throw new Error('No recording covers this time')
  const options = index.frames.filter(
    ([at]) => at >= interval[0] && at <= interval[1] && Math.abs(at - stamp) <= maxOffsetSeconds * 1000,
  )
  options.sort((a, b) => Math.abs(a[0] - stamp) - Math.abs(b[0] - stamp))
  if (!options.length) throw new Error('No preview near this time')
  return options[0]
}
export async function readJson(path: string, signal: AbortSignal) {
  const response = await fetch(localUrl(path, location.origin), {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  })
  if (!response.ok) throw new Error(`Data request failed: HTTP ${response.status}`)
  const text = await response.text()
  if (text.length > 1_048_576) throw new Error('Data response exceeds 1 MiB')
  return JSON.parse(text) as unknown
}
