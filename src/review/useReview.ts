import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RoomConfig } from '../types.ts'
import { canonical, guidedDimensions, parseMetres, sameDimension } from './model.ts'
import { ReviewStore, type ReviewAssistant } from './store.ts'
import type { Anchor, Author, Dimension, ReviewConfig, ReviewDocument, ReviewOperation, Thread } from './types.ts'

export function useReview(hass: ReviewAssistant | null, config: ReviewConfig | undefined, rooms: RoomConfig[]) {
  const liveHass = useRef<ReviewAssistant | null>(hass)
  useLayoutEffect(() => {
    liveHass.current = hass
  }, [hass])
  const getHass = useCallback(() => liveHass.current, [])
  const id = config?.id,
    frame = config?.frame,
    storage = config?.storage
  const makeStore = useCallback(
    () => (id && frame && storage ? new ReviewStore(getHass, { id, frame, storage }) : null),
    [id, frame, storage, getHass],
  )
  const scope = `${id}:${frame}:${storage}`
  const [loaded, setLoaded] = useState<{ scope: string; value: ReviewDocument } | null>(null)
  const document = loaded?.scope === scope ? loaded.value : null
  const setDocument = useCallback((value: ReviewDocument) => setLoaded({ scope, value }), [scope])
  const [selectionScope, setSelectionScope] = useState(scope)
  const [mode, setMode] = useState<'inspect' | 'comment' | 'measure'>('inspect')
  const [selected, setSelected] = useState<string | null>(null)
  const [point, setPoint] = useState<Anchor | null>(null)
  const [dimension, setDimension] = useState<Dimension | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [editing, setEditing] = useState(false)
  const saving = useRef(false)
  const pending = useRef<ReviewOperation | null>(null)
  const pendingScope = useRef<string | null>(null)
  const activity = useRef(0)
  const draftRef = useRef(draft)
  useLayoutEffect(() => {
    draftRef.current = draft
  }, [draft])
  const load = async () => {
    const store = makeStore()
    if (!store || saving.current) return
    try {
      setDocument(await store.load())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review could not be loaded')
    }
  }
  useEffect(() => {
    let active = true
    const store = makeStore()
    if (!store) return
    const read = async () => {
      if (saving.current || pending.current || draftRef.current) return
      const version = activity.current
      try {
        const next = await store.load()
        if (active && !saving.current && version === activity.current) {
          setDocument(next)
          setError('')
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Review could not be loaded')
      }
    }
    void read()
    const timer = setInterval(read, 20_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [makeStore, setDocument])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (draftRef.current || saving.current || pending.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])
  const leave = () => {
    if (pending.current) {
      setError('Confirm or explicitly discard the local retry before leaving this conversation')
      return false
    }
    return !draft || window.confirm('Discard this unsent draft?')
  }
  const chooseMode = (next: typeof mode) => {
    if (!leave()) return
    setMode(next)
    setSelectionScope(scope)
    setSelected(null)
    setPoint(null)
    setDimension(null)
    setDraft('')
  }
  const pick = (anchor: Anchor) => {
    if (mode !== 'comment' || !document || !leave()) return
    setSelectionScope(scope)
    setSelected(null)
    setDimension(null)
    setPoint(anchor)
    setDraft('')
  }
  const openThread = (thread: Thread) => {
    if (!leave()) return
    setSelectionScope(scope)
    setDimension(null)
    setPoint(null)
    setSelected(thread.id)
    setDraft('')
    setEditing(false)
  }
  const openDimension = (next: Dimension) => {
    if (!leave()) return
    setSelectionScope(scope)
    const previous = document?.measurements.find(m => m.id === next.id)
    setPoint(null)
    setSelected(null)
    setDimension(next)
    setDraft(previous && sameDimension(previous, next) ? String(previous.measuredM) : '')
  }
  const author = (): Author => {
    const user = liveHass.current?.user
    if (!user?.is_admin) throw new Error('Review writes require a signed-in HA administrator')
    return { kind: 'user', id: user.id, name: user.name }
  }
  const write = async (operation: ReviewOperation) => {
    const store = makeStore()
    if (!store || saving.current) return
    if (pendingScope.current && pendingScope.current !== scope) {
      setError(
        'The review coordinate frame or store changed. Discard the local retry and review the new frame before writing',
      )
      return
    }
    saving.current = true
    activity.current++
    setBusy(true)
    setError('')
    setRetrying(true)
    pending.current = operation
    pendingScope.current = scope
    try {
      const next = await store.save(operation)
      setDocument(next)
      setDraft('')
      setPoint(null)
      setDimension(null)
      setEditing(false)
      if (operation.kind === 'thread') setSelected(operation.thread.id)
      pending.current = null
      pendingScope.current = null
      setRetrying(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review save failed. Your draft is retained')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const submit = async () => {
    try {
      if (pending.current) return await write(pending.current)
      if (selectionScope !== scope)
        throw new Error('Review frame or store changed. Discard the old draft before selecting a new anchor')
      if (!document) throw new Error('Load or initialize review storage first')
      const now = new Date().toISOString(),
        by = author()
      if (dimension) {
        await write({
          kind: 'measurement',
          measurement: {
            ...dimension,
            measuredM: parseMetres(draft),
            updatedAt: now,
            author: by,
          },
          expected: canonical(document.measurements.find(m => m.id === dimension.id) ?? null),
        })
      } else {
        const body = draft.trim()
        if (!body || body.length > 2000) throw new Error('Enter between 1 and 2000 characters')
        const thread = document.threads.find(t => t.id === selected)
        if (selected && editing && thread)
          await write({
            kind: 'edit',
            threadId: selected,
            text: body,
            updatedAt: now,
            expected: canonical(thread),
          })
        else if (selected)
          await write({
            kind: 'reply',
            threadId: selected,
            reply: {
              id: crypto.randomUUID(),
              body,
              createdAt: now,
              author: by,
            },
          })
        else if (point)
          await write({
            kind: 'thread',
            thread: {
              id: crypto.randomUUID(),
              anchor: point,
              text: body,
              author: by,
              createdAt: now,
              updatedAt: now,
              status: 'open',
              replies: [],
            },
          })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review save failed')
    }
  }
  const changeStatus = async (thread: Thread) => {
    if (pending.current) {
      setError('Retry the unconfirmed save before changing status')
      return
    }
    if (draft.trim()) {
      setError('Send or discard the draft before changing status')
      return
    }
    await write({
      kind: 'status',
      threadId: thread.id,
      status: thread.status === 'resolved' ? 'open' : 'resolved',
      expected: canonical(thread),
    })
  }
  const initialize = async () => {
    const store = makeStore()
    if (!store || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      setDocument(await store.initialize())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review initialization failed')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const dimensions = guidedDimensions(rooms, config)
  const measured = dimensions.filter(d => document?.measurements.some(m => sameDimension(d, m))).length
  return {
    enabled: !!config,
    document,
    mode,
    chooseMode,
    selected: selectionScope === scope ? selected : null,
    point: selectionScope === scope ? point : null,
    dimension: selectionScope === scope ? dimension : null,
    draft,
    setDraft,
    error,
    busy,
    showResolved,
    setShowResolved,
    load,
    initialize,
    pick,
    openThread,
    openDimension,
    submit,
    changeStatus,
    dimensions,
    measured,
    canWrite: hass?.user?.is_admin === true,
    retrying,
    editing,
    discardRetry: () => {
      if (
        !saving.current &&
        window.confirm(
          'Discard this local retry? This does not remove anything already saved on the server. Reload and review its state.',
        )
      ) {
        pending.current = null
        pendingScope.current = null
        setRetrying(false)
        setDraft('')
        void load()
      }
    },
    editOriginal: (thread: Thread) => {
      if (!pending.current && leave()) {
        setEditing(true)
        setDraft(thread.text)
      }
    },
    close: () => {
      if (leave()) {
        setPoint(null)
        setSelected(null)
        setDimension(null)
        setDraft('')
      }
    },
  }
}
export type ReviewState = ReturnType<typeof useReview>
