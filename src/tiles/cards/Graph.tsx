import { formatState, type TileEnv } from '#/tiles/actions.ts'
import { formatNumber } from '#/tiles/features/parts.tsx'
import type { TileConfig } from '#/tiles/host.tsx'
import { linePaths, numericState, useHistory, useStatistics, useTimeline, type Span } from '#/tiles/history.ts'
import { Panel } from '#/tiles/Panel.tsx'
import type { EntityState, HomeAssistant } from '#/types.ts'
import { useId } from 'react'

export type GraphConfig = TileConfig & {
  // line for the last hours of a reading, bar for its days.
  chart?: 'line' | 'bar'
  // How far back a line reaches.
  hours?: number
  // How many days of bars.
  days?: number
}

const WIDTH = 300
const HEIGHT = 96

// The states that count as on, lit on a timeline.
const ON = ['on', 'open', 'home', 'playing', 'unlocked', 'detected', 'active', 'heat', 'cool']

export const isNumeric = (entity: EntityState | undefined) =>
  !!entity &&
  (numericState(entity.state) !== null ||
    ['number', 'input_number', 'counter'].includes(entity.entity_id.split('.')[0]) ||
    typeof entity.attributes.unit_of_measurement === 'string' ||
    typeof entity.attributes.state_class === 'string')

// How a reading's days add up: one that keeps counting, like energy, by
// how much it grew each day, and any other by its average.
const counts = (entity: EntityState | undefined) =>
  entity?.attributes.state_class === 'total_increasing' || entity?.attributes.state_class === 'total'

// The history of an entity, four rows tall, the chart in the bottom right
// corner across from the name and the value now, and how far back it goes
// in the top right. A reading is a line over the last day
// with its shade, or bars for its last days. Anything else, like a door, is
// a strip lit for the times it was on.
export default function Graph({ env, config }: { env: TileEnv; config: GraphConfig }) {
  const entity = env.hass.states[config.entity!]
  const numeric = isNumeric(entity)
  const unit = typeof entity?.attributes.unit_of_measurement === 'string' ? entity.attributes.unit_of_measurement : ''
  const hours = config.hours ?? 24
  const bars = numeric && config.chart === 'bar'
  const range = bars ? `${config.days ?? 7} days` : hours % 24 === 0 && hours > 24 ? `${hours / 24} days` : `${hours} h`
  return (
    <Panel
      env={env}
      config={config}
      entity={entity}
      state={formatState(env.hass, entity)}
      controls={<span className="dio-graph-range">{range}</span>}
      className="dio-graph"
    >
      {bars ? (
        <Bars hass={env.hass} entity={entity} days={config.days ?? 7} unit={unit} />
      ) : numeric ? (
        <Line hass={env.hass} entityId={config.entity!} hours={hours} unit={unit} />
      ) : (
        <Timeline hass={env.hass} entity={entity} hours={hours} />
      )}
    </Panel>
  )
}

function Line({ hass, entityId, hours, unit }: { hass: HomeAssistant; entityId: string; hours: number; unit: string }) {
  const points = useHistory(hass, entityId, hours)
  const id = `dio-graph-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const paths = points && points.length > 1 ? linePaths(points, WIDTH, HEIGHT, false, 6) : null
  const language = hass.locale?.language ?? hass.language
  const label = (value: number) => `${formatNumber(hass, value)}${unit ? ` ${unit}` : ''}`
  if (!paths || !points) return <div className="dio-graph-chart dio-graph-empty">{points ? 'No history' : ''}</div>
  const hour = (time: number) => new Date(time).toLocaleTimeString(language, { hour: 'numeric' })
  return (
    <div className="dio-graph-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={paths.area} fill={`url(#${id})`} />
        <path d={paths.line} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="dio-graph-scale" aria-hidden="true">
        <span>{label(paths.high)}</span>
        <span>{label(paths.low)}</span>
      </div>
      <div className="dio-graph-axis" aria-hidden="true">
        <span>{hour(points[0].t)}</span>
        <span>{hour((points[0].t + points[points.length - 1].t) / 2)}</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function Bars({
  hass,
  entity,
  days,
  unit,
}: {
  hass: HomeAssistant
  entity: EntityState | undefined
  days: number
  unit: string
}) {
  const growing = counts(entity)
  const rows = useStatistics(hass, entity?.entity_id, days, 'day', growing ? ['change'] : ['mean'])
  const values = (rows ?? []).map(row => (growing ? row.change : row.mean) ?? 0)
  const high = Math.max(...values, 0)
  const low = Math.min(...values, 0)
  const language = hass.locale?.language ?? hass.language
  if (!rows || rows.length === 0)
    return <div className="dio-graph-chart dio-graph-empty">{rows ? 'No statistics yet' : ''}</div>
  return (
    <div className="dio-graph-chart">
      <div className="dio-bars">
        {rows.map((row, i) => {
          const share = high - low > 0 ? (values[i] - low) / (high - low) : 0
          const label = `${formatNumber(hass, values[i])}${unit ? ` ${unit}` : ''}`
          return (
            <div key={row.start} className="dio-bar" title={label}>
              <span className="dio-bar-fill" style={{ height: `${Math.max(share * 100, 3)}%` }} />
              <span className="dio-bar-day">
                {new Date(row.start).toLocaleDateString(language, { weekday: 'narrow' })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Timeline({ hass, entity, hours }: { hass: HomeAssistant; entity: EntityState | undefined; hours: number }) {
  const spans = useTimeline(hass, entity?.entity_id, hours)
  if (!spans || spans.length === 0)
    return <div className="dio-graph-chart dio-graph-empty">{spans ? 'No history' : ''}</div>
  const start = spans[0].from
  const end = Math.max(spans[spans.length - 1].to, start + 1)
  const language = hass.locale?.language ?? hass.language
  const hour = (time: number) => new Date(time).toLocaleTimeString(language, { hour: 'numeric' })
  const word = (span: Span) => (entity ? (hass.formatEntityState?.(entity, span.state) ?? span.state) : span.state)
  return (
    <div className="dio-graph-chart dio-timeline-chart">
      <div className="dio-timeline">
        {spans.map(span => (
          <span
            key={span.from}
            className="dio-timeline-span"
            data-on={ON.includes(span.state) || undefined}
            data-off={['unavailable', 'unknown'].includes(span.state) || undefined}
            title={word(span)}
            style={{
              left: `${((span.from - start) / (end - start)) * 100}%`,
              width: `${((span.to - span.from) / (end - start)) * 100}%`,
            }}
          />
        ))}
      </div>
      <div className="dio-graph-axis" aria-hidden="true">
        <span>{hour(start)}</span>
        <span>{hour((start + end) / 2)}</span>
        <span>Now</span>
      </div>
    </div>
  )
}
