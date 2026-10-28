import '#/main.tsx'
import type { CardConfig, EntityState } from '#/types.ts'
import type { ReviewConfig } from '#/review/types.ts'
import type { InspectionConfig } from '#/inspect/data.ts'
import type { ReviewAssistant } from '#/review/store.ts'
import { emptyReview } from '#/review/model.ts'

// Entirely synthetic. This page never connects to Home Assistant.
const config: CardConfig & { review: ReviewConfig; inspections: Record<string, InspectionConfig> } = {
  type: 'custom:diorama-card',
  aspect_ratio: '16:10',
  aspect_ratio_mobile: '3:4',
  read_only: true,
  rooms: [
    {
      id: 'demo',
      name: 'Workshop',
      points: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
    },
  ],
  decorations: [
    { id: 'demo-host', kind: 'pc_tower', room: 'demo', position: [1, 2] },
    { id: 'demo-door', kind: 'garage_door', room: 'demo', position: [3, 3.8], params: { width: 2, height: 2 } },
  ],
  devices: [
    { entity_id: 'sensor.demo_cpu', room: 'demo', position: [1, 2], decorations: ['demo-host'] },
    { entity_id: 'cover.demo_door', room: 'demo', position: [3, 3.8], decorations: ['demo-door'] },
  ],
  review: { id: 'synthetic-workshop', frame: 'synthetic-metres-v1', storage: 'demo-review-store' },
  inspections: {
    'sensor.demo_cpu': { title: 'Synthetic host', telemetry: { url: '/diorama-demo/host.json', node: 'demo-host' } },
    'cover.demo_door': {
      title: 'Synthetic door and camera',
      entities: ['sensor.demo_temperature'],
      archive: { index: '/diorama-demo/index.json', base: '/diorama-demo/', camera: 'demo-camera' },
    },
  },
}
const now = new Date().toISOString()
const entity = (id: string, state: string, attributes = {}): EntityState => ({
  entity_id: id,
  state,
  attributes,
  last_changed: now,
  last_updated: now,
})
const states = {
  'sensor.demo_cpu': entity('sensor.demo_cpu', '25', { unit_of_measurement: '%', friendly_name: 'Demo CPU' }),
  'sensor.demo_temperature': entity('sensor.demo_temperature', '22.4', {
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
  'cover.demo_door': entity('cover.demo_door', 'closed', { current_position: 0, supported_features: 4 }),
}
const initial = emptyReview(config.review.frame)
initial.threads.push({
  id: 'demo-thread',
  text: 'Please check this surface.',
  createdAt: now,
  updatedAt: now,
  author: { kind: 'user', id: 'demo-user', name: 'Demo reviewer' },
  status: 'open',
  replies: [],
  anchor: { element: 'room:demo', local: [3, 0.02, -2], world: [3, 0.02, -2] },
})
const key = 'diorama-synthetic-workshop-v1'
let document = JSON.parse(
  localStorage.getItem(key) ??
    JSON.stringify({
      views: [{ cards: [{ type: 'markdown', review_id: config.review.id, diorama_review: initial }] }],
    }),
)
let serviceCalls = 0
const hass: ReviewAssistant = {
  user: { id: 'demo-user', name: 'Demo reviewer', is_admin: true },
  states,
  areas: {},
  themes: { darkMode: true },
  callService: async () => {
    serviceCalls++
    throw new Error('Synthetic workshop must never send a device service')
  },
  callWS: async <T,>(message: Record<string, unknown>): Promise<T> => {
    if (message.type === 'lovelace/config') return structuredClone(document) as T
    if (message.type === 'lovelace/config/save') {
      document = structuredClone(message.config)
      localStorage.setItem(key, JSON.stringify(document))
      return null as T
    }
    if (message.type === 'history/history_during_period') {
      const time = Date.now() / 1000,
        ids = message.entity_ids as string[]
      return Object.fromEntries(
        ids.map(id => [
          id,
          [
            { lu: time - 86_400, s: '20' },
            { lu: time - 43_200, s: 'unavailable' },
            { lu: time - 21_600, s: '22' },
            { lu: time, s: states[id as keyof typeof states]?.state ?? 'unknown' },
          ],
        ]),
      ) as T
    }
    throw new Error(`Unsupported synthetic websocket operation: ${message.type}`)
  },
}
const originalFetch = window.fetch.bind(window)
const preview = documentCanvas()
function documentCanvas() {
  const canvas = window.document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 640, 360)
  gradient.addColorStop(0, '#334155')
  gradient.addColorStop(1, '#065f46')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 640, 360)
  ctx.fillStyle = '#d1fae5'
  ctx.font = '32px sans-serif'
  ctx.fillText('Synthetic camera preview', 95, 190)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Synthetic JPEG failed'))), 'image/jpeg', 0.85),
  )
}
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  if (url.origin !== location.origin || !url.pathname.startsWith('/diorama-demo/')) return originalFetch(input, init)
  const time = Math.floor(Date.now() / 60_000) * 60_000
  if (url.pathname.endsWith('.jpg')) return new Response(await preview, { headers: { 'Content-Type': 'image/jpeg' } })
  if (url.pathname.endsWith('host.json'))
    return Response.json({
      formatVersion: 1,
      status: 'ok',
      node: 'demo-host',
      generatedAt: time,
      observedAt: time,
      current: { cpu: 25, memory: 38, disk: 52, temperature: 46, uptimeSeconds: 864_000 },
      history: Object.fromEntries(
        ['cpu', 'memory', 'disk'].map((key, i) => [
          key,
          [
            [time - 300_000, 20 + i * 10],
            [time, 25 + i * 10],
          ],
        ]),
      ),
    })
  if (url.pathname.endsWith('index.json'))
    return Response.json({
      formatVersion: 1,
      camera: 'demo-camera',
      status: 'partial',
      generatedAt: time,
      start: time - 86_400_000,
      end: time,
      frames: [
        [time - 86_400_000, 'early.jpg'],
        [time - 60_000, 'recent.jpg'],
        [time, 'latest.jpg'],
      ],
      coverage: [
        [time - 86_400_000, time - 86_340_000],
        [time - 120_000, time],
      ],
    })
  return new Response('Not found', { status: 404 })
}
type CardElement = HTMLElement & { setConfig: (config: CardConfig) => void; hass: ReviewAssistant }
const card = window.document.createElement('diorama-card') as CardElement
card.style.cssText = 'display:block;width:min(1100px,100vw);margin:auto'
card.setConfig(config)
card.hass = hass
window.document.body.append(card)
Object.assign(window, {
  dioramaDemo: {
    config,
    card,
    hass,
    get serviceCalls() {
      return serviceCalls
    },
    get review() {
      return structuredClone(document)
    },
    inspect: (id: string) =>
      card.dispatchEvent(
        new CustomEvent('diorama-inspect', { detail: { entityId: id }, bubbles: true, composed: true }),
      ),
  },
})
