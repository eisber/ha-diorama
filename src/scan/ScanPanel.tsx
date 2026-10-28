import { reviewButton } from '../lib/workshop.ts'
import type { ScanTransform } from './local.ts'
import type { ScanState } from './useLocalScan.ts'

export default function ScanPanel({ scan }: { scan: ScanState }) {
  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-24px)] text-xs text-white">
      <button className={reviewButton} onClick={() => scan.setOpen(!scan.open)}>
        Scan reference {scan.scan ? '●' : '+'}
      </button>
      {scan.open && (
        <section
          data-scan-panel
          className="mt-2 max-h-80 w-72 overflow-auto rounded-2xl border border-white/15 bg-slate-950/95 p-4 shadow-xl"
        >
          <p className="mb-3">
            Open a self-contained Scaniverse GLB locally. Nothing is uploaded or placed in the card configuration.
            Nominal metres are not surveyed dimensions.
          </p>
          <input
            type="file"
            accept=".glb"
            aria-label="Local Scaniverse GLB"
            disabled={scan.busy}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) void scan.pick(file)
              e.target.value = ''
            }}
          />
          {scan.busy && <p>Reading local scan…</p>}
          {scan.scan && (
            <>
              <p className="my-2 opacity-60">
                Reference {scan.scan.hash.slice(0, 10)}. Align it explicitly; no automatic scaling.
              </p>
              <label className="mb-2 block">
                <input type="checkbox" checked={scan.visible} onChange={e => scan.setVisible(e.target.checked)} /> Show
                overlay
              </label>
              <label className="mb-3 block">
                <input
                  type="checkbox"
                  checked={scan.remember}
                  disabled={scan.remembering}
                  onChange={e => void scan.retain(e.target.checked)}
                />{' '}
                Remember on this browser only
              </label>
              {scan.cacheStatus === 'saving' && (
                <p className="mb-2 opacity-60" role="status">
                  Saving local reference…
                </p>
              )}
              {scan.remember && scan.cacheStatus === 'saved' && (
                <p className="mb-2 opacity-60" role="status">
                  Saved in this browser.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'z', 'yaw', 'scale', 'opacity'] as (keyof ScanTransform)[]).map(key => (
                  <label key={key}>
                    {key === 'yaw'
                      ? 'Rotation °'
                      : key === 'scale'
                        ? 'Scale'
                        : key === 'opacity'
                          ? 'Opacity'
                          : `${key.toUpperCase()} metres`}
                    <input
                      type="number"
                      step={key === 'yaw' ? 1 : 0.01}
                      aria-label={`Scan ${key}`}
                      value={scan.scan!.transform[key]}
                      className="mt-1 w-full rounded-md bg-white/10 p-2"
                      onChange={e => {
                        if (e.target.value !== '')
                          void scan.transform({ ...scan.scan!.transform, [key]: Number(e.target.value) })
                      }}
                    />
                  </label>
                ))}
              </div>
              <button className={`${reviewButton} mt-3`} onClick={() => void scan.remove()}>
                Remove local reference
              </button>
            </>
          )}
          {scan.error && (
            <p role="alert" className="mt-2 text-amber-300">
              {scan.error}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
