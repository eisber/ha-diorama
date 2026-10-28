import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Object3D, Raycaster, Vector2, Vector3 } from 'three'
import { horizontalDistance, sameDimension } from './model.ts'
import type { Anchor, Vec3 } from './types.ts'
import type { ReviewState } from './useReview.ts'
import { reviewButton } from '../lib/workshop.ts'

function Anchored({
  anchor,
  position,
  children,
}: {
  anchor?: Anchor
  position?: Vec3
  children: (missing: boolean) => ReactNode
}) {
  const scene = useThree(state => state.scene)
  const group = useRef<Object3D>(null)
  const [missing, setMissing] = useState(false)
  const last = useRef(false)
  useFrame(() => {
    const object = anchor ? scene.getObjectByName(anchor.element) : null
    const absent = !!anchor && !object
    if (absent !== last.current) {
      last.current = absent
      setMissing(absent)
    }
    if (group.current)
      group.current.position.copy(
        object && anchor
          ? object.localToWorld(new Vector3(...anchor.local))
          : new Vector3(...(anchor?.world ?? position ?? [0, 0, 0])),
      )
  })
  return (
    <group ref={group} position={anchor?.world ?? position}>
      {children(missing)}
    </group>
  )
}
export default function ReviewLayer({ review }: { review: ReviewState }) {
  const { gl, scene, camera, invalidate } = useThree()
  const { mode, pick } = review
  const editor = useRef<HTMLElement>(null)
  const clampPosition = (
    object: Object3D,
    camera: Parameters<Vector3['project']>[0],
    size: { width: number; height: number },
  ) => {
    const p = object.getWorldPosition(new Vector3()).project(camera)
    const width = editor.current?.offsetWidth ?? 288,
      height = editor.current?.offsetHeight ?? 360
    return [
      Math.max(8, Math.min(size.width - width - 8, ((p.x + 1) * size.width) / 2 + 12)),
      Math.max(55, Math.min(size.height - height - 8, ((1 - p.y) * size.height) / 2)),
    ]
  }
  useEffect(() => {
    invalidate()
  }, [review.document, review.point, review.mode, review.dimension, invalidate])
  useEffect(() => {
    if (mode !== 'comment') return
    const canvas = gl.domElement
    const raycaster = new Raycaster()
    let down: { x: number; y: number; id: number } | null = null
    const start = (e: PointerEvent) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const end = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        down = null
        return
      }
      down = null
      const rect = canvas.getBoundingClientRect()
      raycaster.setFromCamera(
        new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      )
      raycaster.layers.mask = camera.layers.mask
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        let object: Object3D | null = hit.object,
          named: Object3D | null = null,
          visible = true
        while (object) {
          if (!object.visible || !camera.layers.test(object.layers)) visible = false
          if (!named && /^(decoration:|room:|scan:)/.test(object.name)) named = object
          object = object.parent
        }
        if (!named || !visible) continue
        pick({
          element: named.name,
          local: named.worldToLocal(hit.point.clone()).toArray() as Vec3,
          world: hit.point.toArray() as Vec3,
        })
        break
      }
    }
    canvas.addEventListener('pointerdown', start, true)
    canvas.addEventListener('pointerup', end, true)
    return () => {
      canvas.removeEventListener('pointerdown', start, true)
      canvas.removeEventListener('pointerup', end, true)
    }
  }, [mode, pick, gl, scene, camera])
  const thread = review.document?.threads.find(t => t.id === review.selected)
  const anchor = review.point ?? thread?.anchor
  const editorPoint: Vec3 | undefined = review.dimension
    ? [
        (review.dimension.start[0] + review.dimension.end[0]) / 2,
        (review.dimension.start[1] + review.dimension.end[1]) / 2,
        (review.dimension.start[2] + review.dimension.end[2]) / 2,
      ]
    : undefined
  return (
    <>
      {review.document?.threads
        .filter(t => t.status !== 'resolved' || (review.mode === 'comment' && review.showResolved))
        .map(t => {
          return (
            <Anchored key={t.id} anchor={t.anchor}>
              {missing => (
                <Html center zIndexRange={[8, 0]}>
                  <button
                    className={reviewButton}
                    aria-label={`Open ${t.status} comment`}
                    data-review-thread={t.id}
                    data-anchor-missing={missing}
                    style={{ borderColor: missing ? '#fbbf24' : t.status === 'resolved' ? '#34d399' : '#a78bfa' }}
                    onClick={e => {
                      e.stopPropagation()
                      review.openThread(t)
                    }}
                  >
                    {' '}
                    {t.status === 'resolved' ? '✓' : '●'}{' '}
                  </button>
                </Html>
              )}
            </Anchored>
          )
        })}
      {review.mode === 'measure' &&
        review.dimensions.map((d, index) => {
          const saved = review.document?.measurements.find(m => m.id === d.id)
          const measured = saved && sameDimension(saved, d)
          const color = measured ? '#34d399' : '#c4b5fd'
          return (
            <group key={d.id}>
              <Line
                points={[d.start, d.end]}
                color={color}
                lineWidth={2}
                dashed={!measured}
                dashSize={0.12}
                gapSize={0.08}
              />
              <Html
                position={new Vector3(...d.start).lerp(new Vector3(...d.end), 0.5)}
                center
                zIndexRange={[7, 0]}
                calculatePosition={(object, camera, size) => {
                  const p = object.getWorldPosition(new Vector3()).project(camera)
                  return [((p.x + 1) * size.width) / 2, ((1 - p.y) * size.height) / 2 + (index % 2 ? 20 : -20)]
                }}
              >
                <button
                  className={`${reviewButton} whitespace-nowrap`}
                  data-review-dimension={d.id}
                  aria-label={`Measure ${d.label}`}
                  onClick={e => {
                    e.stopPropagation()
                    review.openDimension(d)
                  }}
                >
                  {d.label}:{' '}
                  {measured
                    ? `${saved.measuredM.toFixed(2)} m ✓`
                    : saved
                      ? 'Recheck changed span'
                      : `${horizontalDistance(d.start, d.end).toFixed(2)} m model`}
                </button>
              </Html>
            </group>
          )
        })}
      {(editorPoint || anchor) && (
        <Anchored anchor={anchor} position={editorPoint}>
          {missing => (
            <Html calculatePosition={clampPosition} zIndexRange={[30, 20]}>
              <section
                ref={editor}
                className="max-h-[65vh] w-[min(288px,calc(100vw-24px))] overflow-auto rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-xs text-white shadow-2xl backdrop-blur-xl"
                data-review-editor
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <header className="mb-3 flex items-center justify-between gap-2 font-semibold">
                  <span>{review.dimension?.label ?? (thread ? 'Review conversation' : 'New anchored comment')}</span>
                  <button aria-label="Close review editor" onClick={review.close}>
                    ×
                  </button>
                </header>
                {missing && (
                  <p className="mb-2 text-amber-300">
                    Original object is missing. Showing the saved world position; review the anchor.
                  </p>
                )}
                {thread && (
                  <div className="mb-3 max-h-44 overflow-auto" data-review-messages>
                    {[
                      { id: 'root', body: thread.text, author: thread.author, createdAt: thread.createdAt },
                      ...thread.replies,
                    ].map(message => (
                      <article key={message.id} className="mb-2 border-b border-white/10 pb-2">
                        <strong>{message.author.name}</strong>{' '}
                        <time className="opacity-50" dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleString()}
                        </time>
                        <p className="mt-1 break-words whitespace-pre-wrap">{message.body}</p>
                      </article>
                    ))}
                  </div>
                )}
                {review.dimension && (
                  <p className="mb-2 opacity-70">
                    Model: {horizontalDistance(review.dimension.start, review.dimension.end).toFixed(3)} m. Enter the
                    actual inside wall-to-wall length. This never rescales the model.
                  </p>
                )}
                <form
                  onSubmit={e => {
                    e.preventDefault()
                    void review.submit()
                  }}
                >
                  {review.dimension ? (
                    <input
                      aria-label="Physical length in metres"
                      inputMode="decimal"
                      value={review.draft}
                      disabled={review.retrying}
                      className="mb-3 w-full rounded-lg bg-white/10 p-2"
                      onChange={e => review.setDraft(e.target.value)}
                    />
                  ) : (
                    <textarea
                      aria-label={review.editing ? 'Original comment' : thread ? 'Reply' : 'Comment'}
                      maxLength={2000}
                      rows={3}
                      value={review.draft}
                      disabled={review.retrying}
                      className="mb-3 w-full rounded-lg bg-white/10 p-2"
                      onChange={e => review.setDraft(e.target.value)}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={reviewButton} disabled={review.busy || !review.canWrite}>
                      {review.busy
                        ? 'Saving…'
                        : review.retrying
                          ? 'Retry unconfirmed save'
                          : review.dimension
                            ? 'Save measurement'
                            : review.editing
                              ? 'Save original'
                              : thread
                                ? 'Send reply'
                                : 'Save comment'}
                    </button>
                    {thread && (
                      <button
                        type="button"
                        className={reviewButton}
                        disabled={review.busy || !review.canWrite}
                        onClick={() => void review.changeStatus(thread)}
                      >
                        {thread.status === 'resolved' ? 'Reopen' : 'Mark solved'}
                      </button>
                    )}
                    {thread && !review.editing && (
                      <button
                        type="button"
                        className={reviewButton}
                        disabled={review.busy || review.retrying || !review.canWrite}
                        onClick={() => review.editOriginal(thread)}
                      >
                        Edit original
                      </button>
                    )}
                  </div>
                  {review.error && (
                    <p role="alert" className="mt-2 text-amber-300">
                      {review.error}
                    </p>
                  )}
                  {review.retrying && (
                    <p className="mt-2 opacity-60">
                      The original operation ID and text are retained until its save is confirmed.
                    </p>
                  )}
                  {review.retrying && !review.busy && (
                    <button type="button" className={`${reviewButton} mt-2`} onClick={review.discardRetry}>
                      Discard local retry
                    </button>
                  )}
                </form>
              </section>
            </Html>
          )}
        </Anchored>
      )}
    </>
  )
}
