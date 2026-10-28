import { parseArgs } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { ReviewStore, type ReviewAssistant } from '../src/review/store.ts'
import type { ReviewOperation } from '../src/review/types.ts'

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    id: { type: 'string' },
    frame: { type: 'string' },
    storage: { type: 'string' },
    operation: { type: 'string' },
    output: { type: 'string' },
  },
})
const token = process.env.DIORAMA_HA_TOKEN
if (!values.url || !values.id || !values.frame || !values.storage || !token)
  throw new Error(
    'Supply --url, --id, --frame, --storage and DIORAMA_HA_TOKEN through the environment, never a command argument',
  )
const url = new URL(values.url)
if (
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
)
  throw new Error('Use HTTPS or an authenticated loopback tunnel, without credentials or query tokens in the URL')
url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
url.pathname = '/api/websocket'
const websocket = new WebSocket(url)
let sequence = 0
const requests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('HA authentication timed out'))
      websocket.close()
    }, 15_000)
    websocket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('HA websocket connection failed'))
    })
    websocket.addEventListener('close', () => {
      clearTimeout(timer)
      reject(new Error('HA websocket closed'))
      for (const request of requests.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('HA websocket closed before confirmation'))
      }
      requests.clear()
    })
    websocket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.type === 'auth_required') websocket.send(JSON.stringify({ type: 'auth', access_token: token }))
      else if (message.type === 'auth_ok') {
        clearTimeout(timer)
        resolve()
      } else if (message.type === 'auth_invalid') {
        clearTimeout(timer)
        reject(new Error('HA authentication was rejected'))
      } else if (message.type === 'result') {
        const request = requests.get(message.id)
        if (!request) return
        requests.delete(message.id)
        clearTimeout(request.timer)
        if (message.success) request.resolve(message.result)
        else request.reject(new Error('HA rejected the review metadata request'))
      }
    })
  })
  const callWS = <T>(message: Record<string, unknown>) =>
    new Promise<T>((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        requests.delete(id)
        reject(new Error('HA request timed out; retain the operation file for an idempotent retry'))
      }, 15_000)
      requests.set(id, { resolve: value => resolve(value as T), reject, timer })
      websocket.send(JSON.stringify({ ...message, id }))
    })
  const user = await callWS<NonNullable<ReviewAssistant['user']>>({ type: 'auth/current_user' })
  const hass: ReviewAssistant = {
    user,
    states: {},
    areas: {},
    themes: { darkMode: true },
    callWS,
    callService: async () => {
      throw new Error('The review CLI never calls device services')
    },
  }
  const store = new ReviewStore(() => hass, { id: values.id, frame: values.frame, storage: values.storage })
  const document = values.operation
    ? await store.save(JSON.parse(await readFile(values.operation, 'utf8')) as ReviewOperation)
    : await store.load()
  if (values.output) await writeFile(values.output, JSON.stringify(document, null, 2), { mode: 0o600, flag: 'wx' })
  console.log(
    JSON.stringify({
      sequence: document.sequence,
      threads: document.threads.length,
      measurements: document.measurements.length,
      written: !!values.operation,
    }),
  )
} finally {
  websocket.close()
  for (const request of requests.values()) clearTimeout(request.timer)
}
