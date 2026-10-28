import { useEffect, useState } from 'react'
import type { HomeAssistant } from '../types.ts'
import { useHistory, useNow, linePaths } from '../tiles/history.ts'
import { useImageElement } from '../tiles/cards/Camera.tsx'
import { reviewButton } from '../lib/workshop.ts'
import {
  chooseArchiveFrame,
  localUrl,
  readJson,
  validateArchive,
  validateTelemetry,
  type ArchiveIndex,
  type HostTelemetry,
  type InspectionConfig,
} from './data.ts'

function History({ hass, entity }: { hass: HomeAssistant; entity: string }) {
  const points = useHistory(hass, entity, 24)
  const paths = points ? linePaths(points, 280, 65) : null
  const state = hass.states[entity]
  return (
    <div className="mb-3">
      <div className="flex justify-between gap-2">
        <span>{String(state?.attributes.friendly_name ?? entity)}</span>
        <strong>
          {state?.state ?? 'unavailable'} {String(state?.attributes.unit_of_measurement ?? '')}
        </strong>
      </div>
      {!/^(sensor|number|input_number|counter)\./.test(entity) ? null : paths ? (
        <svg viewBox="0 0 280 65" className="mt-1 h-16 w-full" aria-label={`${entity} 24 hour history`}>
          <path d={paths.area} fill="#a78bfa" opacity="0.1" />
          <path d={paths.line} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
        </svg>
      ) : (
        <p className="mt-1 opacity-50">{points === null ? 'Loading history…' : 'No numeric history'}</p>
      )}
    </div>
  )
}

function LiveCamera({ hass, entity }: { hass: HomeAssistant; entity: string }) {
  const ready = useImageElement()
  return (
    <section className="my-3">
      <strong>Live camera</strong>
      {ready ? (
        <hui-image
          style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', marginTop: '0.5rem' }}
          hass={hass}
          cameraImage={entity}
          cameraView="auto"
          fitMode="cover"
        />
      ) : (
        <p>Loading native camera view…</p>
      )}
    </section>
  )
}

function Telemetry({ config }: { config: NonNullable<InspectionConfig['telemetry']> }) {
  const [value, setValue] = useState<HostTelemetry | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let active = true
    const abort = new AbortController()
    const read = async () => {
      try {
        const next = await readJson(config.url, abort.signal)
        validateTelemetry(next, config.node, config.max_age_seconds ?? 180)
        if (active) {
          setValue(next)
          setError('')
          setNow(Date.now())
        }
      } catch (e) {
        if (active) {
          setValue(null)
          setError(e instanceof Error ? e.message : 'Telemetry request failed')
        }
      }
    }
    void read()
    const timer = setInterval(read, 30_000)
    return () => {
      active = false
      abort.abort()
      clearInterval(timer)
    }
  }, [config.url, config.node, config.max_age_seconds])
  if (!value)
    return (
      <p role={error ? 'alert' : undefined} className="my-3 text-amber-200">
        {error || 'Loading host telemetry…'}
      </p>
    )
  return (
    <section className="my-3 rounded-xl bg-white/5 p-3" data-host-telemetry>
      <header className="mb-3 opacity-60">
        {value.node} · observed {Math.max(0, Math.round((now - value.observedAt) / 1000))} s ago
      </header>
      <div className="grid grid-cols-3 gap-3">
        {(['cpu', 'memory', 'disk'] as const).map(key => {
          const paths = linePaths(
            value.history[key].map(([t, v]) => ({ t, v: v ?? NaN })),
            100,
            40,
          )
          return (
            <div key={key}>
              <span className="uppercase opacity-60">{key}</span>
              <strong className="block text-lg">{value.current[key].toFixed(1)}%</strong>
              {paths && (
                <svg viewBox="0 0 100 40" className="mt-1 w-full">
                  <path d={paths.line} fill="none" stroke="#34d399" strokeWidth="1.4" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
      <footer className="mt-2 opacity-60">
        {value.current.temperature.toFixed(1)} °C · uptime {(value.current.uptimeSeconds / 86400).toFixed(1)} days
      </footer>
    </section>
  )
}

function Archive({ config }: { config: NonNullable<InspectionConfig['archive']> }) {
  const now = useNow(60_000)
  const [index, setIndex] = useState<ArchiveIndex | null>(null)
  const [stamp, setStamp] = useState<number | null>(null)
  const [picture, setPicture] = useState<{ url: string; actual: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const abort = new AbortController()
    const read = async () => {
      try {
        const value = await readJson(config.index, abort.signal)
        validateArchive(value, config.camera)
        if (active) {
          setIndex(value)
          setError('')
        }
      } catch (e) {
        if (active) {
          setIndex(null)
          setError(e instanceof Error ? e.message : 'Archive index unavailable')
        }
      }
    }
    void read()
    const timer = setInterval(read, 60_000)
    return () => {
      active = false
      abort.abort()
      clearInterval(timer)
    }
  }, [config.index, config.camera])
  useEffect(() => {
    let active = true,
      objectUrl: string | null = null
    const abort = new AbortController()
    const show = async () => {
      setPicture(null)
      if (!index || stamp === null) return
      try {
        const [actual, filename] = chooseArchiveFrame(index, stamp, config.max_offset_seconds ?? 90)
        const base = localUrl(config.base.endsWith('/') ? config.base : `${config.base}/`, location.origin)
        const response = await fetch(new URL(filename, base), {
          credentials: 'same-origin',
          cache: 'force-cache',
          signal: abort.signal,
        })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg'))
          throw new Error('Archive preview is not an available JPEG')
        const blob = await response.blob()
        if (blob.size < 1000 || blob.size > 500_000) throw new Error('Archive preview size is invalid')
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        const image = new Image()
        image.src = objectUrl
        await image.decode()
        if (active) {
          setPicture({ url: objectUrl, actual })
          setError('')
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Archive frame unavailable')
      }
    }
    const timer = setTimeout(() => void show(), 70)
    return () => {
      active = false
      clearTimeout(timer)
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [index, stamp, config.base, config.max_offset_seconds])
  return (
    <section className="mt-4 border-t border-white/10 pt-3" data-camera-archive>
      <header className="mb-2 flex justify-between">
        <strong>Recording timeline</strong>
        {index && now - index.generatedAt > 300_000 && <span className="text-amber-300">Index is old</span>}
      </header>
      {index && (
        <>
          <input
            type="range"
            min={index.start}
            max={index.end}
            step={1000}
            value={stamp ?? index.end}
            aria-label="Recording time"
            className="w-full"
            onChange={e => setStamp(Number(e.target.value))}
          />
          <div className="my-2 flex justify-between opacity-60">
            <span>{new Date(index.start).toLocaleTimeString()}</span>
            <span>{new Date(index.end).toLocaleTimeString()}</span>
          </div>
          <svg viewBox="0 0 300 5" className="mb-2 h-1 w-full" aria-label="Recording coverage">
            {index.coverage.map(([a, b]) => (
              <rect
                key={a}
                x={((a - index.start) / (index.end - index.start)) * 300}
                width={((b - a) / (index.end - index.start)) * 300}
                height={5}
                fill="#34d399"
              />
            ))}
          </svg>
          <button className={reviewButton} onClick={() => setStamp(index.end)}>
            Latest archived frame
          </button>
        </>
      )}
      {picture && (
        <figure className="mt-3">
          <img
            src={picture.url}
            alt={`Archived camera frame ${new Date(picture.actual).toLocaleString()}`}
            className="aspect-video w-full rounded-xl object-cover"
          />
          <figcaption className="mt-2 opacity-60">
            Recorded {new Date(picture.actual).toLocaleString()} · offset{' '}
            {Math.round((picture.actual - (stamp ?? picture.actual)) / 1000)} s
          </figcaption>
        </figure>
      )}
      {error && (
        <p role="alert" className="mt-2 text-amber-300">
          {error}
        </p>
      )}
    </section>
  )
}

export default function InspectionPanel({
  hass,
  entity,
  config,
  close,
}: {
  hass: HomeAssistant | null
  entity: string | null
  config?: InspectionConfig
  close: () => void
}) {
  if (!entity || !hass) return null
  const state = hass.states[entity]
  let logo: string | undefined
  if (config?.logo) {
    try {
      logo = localUrl(config.logo, location.origin)
    } catch (e) {
      console.error('Diorama inspection logo rejected', e)
    }
  }
  return (
    <section
      data-diorama-inspection
      className="absolute right-3 bottom-3 z-30 max-h-[85%] w-[min(360px,calc(100%-24px))] overflow-auto rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-xs text-white shadow-2xl backdrop-blur-xl"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        {logo && <img src={logo} className="max-h-8 max-w-24" alt="" />}
        <strong className="text-sm">{config?.title ?? String(state?.attributes.friendly_name ?? entity)}</strong>
        <button aria-label="Close inspection" onClick={close}>
          ×
        </button>
      </header>
      <p className="mb-3 text-emerald-300">Inspection only. No device controls.</p>
      {state ? (
        <History key={entity} hass={hass} entity={entity} />
      ) : (
        !config?.telemetry && <p className="opacity-60">Entity is unavailable</p>
      )}
      {entity.startsWith('camera.') && <LiveCamera hass={hass} entity={entity} />}
      {config?.entities
        ?.slice(0, 8)
        .filter(id => id !== entity)
        .map(id => (
          <History key={id} hass={hass} entity={id} />
        ))}
      {config?.telemetry && (
        <Telemetry key={`${config.telemetry.url}:${config.telemetry.node}`} config={config.telemetry} />
      )}
      {config?.archive && <Archive key={`${config.archive.index}:${config.archive.camera}`} config={config.archive} />}
    </section>
  )
}
