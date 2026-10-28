import type { HomeAssistant } from '#/types.ts'
import { useEffect, useState } from 'react'

// The history of a number, read from Home Assistant's recorder, for the
// line along a tile and the graph cards.

export type Point = { t: number; v: number | null }

type Compressed = { s: string; lu?: number; lc?: number }

export function numericState(state: string | undefined): number | null {
  if (state === undefined || state.trim() === '') return null
  const value = Number(state)
  return Number.isFinite(value) ? value : null
}

export function historyPoints(rows: Compressed[]): Point[] {
  return rows
    .map(row => ({ t: (row.lu ?? row.lc ?? NaN) * 1000, v: numericState(row.s) }))
    .filter(point => Number.isFinite(point.t))
}

// How often a history is read again while it shows.
const REFRESH_MS = 5 * 60_000

// The values an entity had over the last hours, oldest first, ending with
// the one it has now. Null until the first answer arrives.
export function useHistory(hass: HomeAssistant, entityId: string | undefined, hours: number) {
  const [points, setPoints] = useState<Point[] | null>(null)
  const callWS = hass.callWS
  useEffect(() => {
    if (!entityId || !callWS) return
    let live = true
    const read = () =>
      callWS<Record<string, Compressed[]>>({
        type: 'history/history_during_period',
        start_time: new Date(Date.now() - hours * 3_600_000).toISOString(),
        entity_ids: [entityId],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      })
        .then(result => {
          if (!live) return
          const rows = result[entityId] ?? []
          setPoints(historyPoints(rows))
        })
        .catch(() => live && setPoints([]))
    void read()
    const timer = setInterval(read, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [callWS, entityId, hours])
  const now = useNow(60_000)
  const value = numericState(entityId ? hass.states[entityId]?.state : undefined)
  if (!points) return null
  return [...points, { t: now, v: value }]
}

// The time, read again every so often, for what moves with it like the
// end of a graph or the position of a song.
export function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

export type Span = { from: number; to: number; state: string }

// The states an entity was in over the last hours, oldest first, each with
// when it began and ended, for one that is not a number, like a door.
export function useTimeline(hass: HomeAssistant, entityId: string | undefined, hours: number) {
  const [rows, setRows] = useState<{ t: number; s: string }[] | null>(null)
  const callWS = hass.callWS
  const changed = entityId ? hass.states[entityId]?.last_changed : undefined
  useEffect(() => {
    if (!entityId || !callWS) return
    let live = true
    callWS<Record<string, Compressed[]>>({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - hours * 3_600_000).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    })
      .then(result => {
        if (!live) return
        setRows((result[entityId] ?? []).map(row => ({ t: (row.lc ?? row.lu ?? 0) * 1000, s: row.s })))
      })
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [callWS, entityId, hours, changed])
  const now = useNow(60_000)
  if (!rows) return null
  const start = now - hours * 3_600_000
  return rows.map((row, i): Span => ({ from: Math.max(row.t, start), to: rows[i + 1]?.t ?? now, state: row.s }))
}

export type Statistic = { start: number; end: number; mean?: number; min?: number; max?: number; change?: number }

// Long-term statistics of an entity, by hour, day or month, oldest first.
export function useStatistics(
  hass: HomeAssistant,
  entityId: string | undefined,
  days: number,
  period: 'hour' | 'day' | 'week' | 'month',
  types: string[],
) {
  const [rows, setRows] = useState<Statistic[] | null>(null)
  const callWS = hass.callWS
  const typeKey = types.join(',')
  useEffect(() => {
    if (!entityId || !callWS) return
    let live = true
    const read = () =>
      callWS<Record<string, Statistic[]>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(Date.now() - days * 86_400_000).toISOString(),
        statistic_ids: [entityId],
        period,
        types: typeKey.split(','),
      })
        .then(result => live && setRows(result[entityId] ?? []))
        .catch(() => live && setRows([]))
    void read()
    const timer = setInterval(read, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [callWS, entityId, days, period, typeKey])
  return rows
}

// A line through the points, scaled to a box of the given size, and the
// same line closed down to the bottom for the shade under it.
export function linePaths(points: Point[], width: number, height: number, steps = false, pad = 2) {
  const timed = points.filter(p => Number.isFinite(p.t))
  const finite = timed.filter((p): p is Point & { v: number } => p.v !== null && Number.isFinite(p.v))
  if (finite.length === 0 || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(pad))
    return null
  const t0 = timed[0].t
  const t1 = Math.max(timed[timed.length - 1].t, t0 + 1)
  let low = Infinity
  let high = -Infinity
  for (const point of finite) {
    low = Math.min(low, point.v)
    high = Math.max(high, point.v)
  }
  if (high - low < 1e-9) {
    low -= 1
    high += 1
  }
  const x = (t: number) => ((t - t0) / (t1 - t0)) * width
  const y = (v: number) => pad + (1 - (v - low) / (high - low)) * (height - pad * 2)
  if (finite.some(point => !Number.isFinite(x(point.t)) || !Number.isFinite(y(point.v)))) return null
  // A value that holds until the next change, like a setting, steps from
  // one to the next. A reading drifts, so its line goes straight between.
  let line = ''
  let area = ''
  let segment = ''
  let start = ''
  let end = ''
  let previous: number | null = null
  const close = () => {
    if (!segment) return
    line += segment
    area += `${segment}L${end},${height}L${start},${height}Z`
    segment = ''
    previous = null
  }
  for (const point of timed) {
    if (point.v === null || !Number.isFinite(point.v)) {
      close()
      continue
    }
    end = x(point.t).toFixed(2)
    const at = `${end},${y(point.v).toFixed(2)}`
    if (!segment) {
      start = end
      segment = `M${at}`
    } else {
      if (steps && previous !== null) segment += `L${end},${y(previous).toFixed(2)}`
      segment += `L${at}`
    }
    previous = point.v
  }
  close()
  return { line, area, low, high }
}
