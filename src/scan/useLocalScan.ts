import { useCallback, useEffect, useRef, useState } from 'react'
import { Mesh, type Group, type Material } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { inspectGlb } from './glb.ts'
import { defaultTransform, scanCache, type LocalScan, type ScanTransform } from './local.ts'

function disposeScene(scene: Group) {
  const materials = new Set<Material>()
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  const textures = new Set<{ dispose: () => void }>()
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) texture.dispose()
}

export function useLocalScan(key: string | undefined) {
  const [heldScan, setHeldScan] = useState<{ key: string | undefined; value: LocalScan | null } | null>(null)
  const scan = heldScan?.key === key ? (heldScan?.value ?? null) : null
  const setScan = useCallback((value: LocalScan | null) => setHeldScan({ key, value }), [key])
  const buffer = scan?.buffer
  const [loadedScene, setLoadedScene] = useState<{ buffer: ArrayBuffer; value: Group } | null>(null)
  const scene = loadedScene?.buffer === buffer ? (loadedScene?.value ?? null) : null
  const setScene = useCallback(
    (value: Group | null) => setLoadedScene(value && buffer ? { buffer, value } : null),
    [buffer],
  )
  const [remembered, setRemembered] = useState<{ key: string | undefined; value: boolean } | null>(null)
  const remember = remembered?.key === key && remembered?.value === true
  const setRemember = useCallback((value: boolean) => setRemembered({ key, value }), [key])
  const [remembering, setRemembering] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [visible, setVisible] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const cancelRead = useCallback(() => {
    generation.current++
  }, [])
  const cacheWrites = useRef<Promise<unknown>>(Promise.resolve())
  const writeVersion = useRef(0)
  const activeWrites = useRef(0)
  const persist = (value: LocalScan | null) => {
    if (!key) return Promise.resolve(null)
    const version = ++writeVersion.current
    activeWrites.current++
    setCacheStatus('saving')
    const write = () => scanCache(key, value)
    const next = cacheWrites.current.then(write, write).then(
      value => {
        activeWrites.current--
        if (version === writeVersion.current) setCacheStatus('saved')
        return value
      },
      error => {
        activeWrites.current--
        if (version === writeVersion.current) setCacheStatus('error')
        throw error
      },
    )
    cacheWrites.current = next
    return next
  }
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (activeWrites.current > 0) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])
  useEffect(() => {
    let active = true
    const version = generation.current
    if (key)
      void scanCache(key)
        .then(value => {
          if (active && version === generation.current && value) {
            setScan(value)
            setRemember(true)
          }
        })
        .catch(e => {
          if (active) setError(`Local scan storage: ${e instanceof Error ? e.message : 'unavailable'}`)
        })
    return () => {
      active = false
      cancelRead()
    }
  }, [key, setScan, setRemember, cancelRead])
  useEffect(() => {
    let active = true,
      loaded: Group | null = null
    if (!buffer) return
    const load = async () => {
      try {
        inspectGlb(buffer)
        const gltf = await new GLTFLoader().parseAsync(buffer.slice(0), '')
        loaded = gltf.scene
        let vertices = 0
        loaded.traverse(object => {
          if (object instanceof Mesh) vertices += object.geometry.attributes.position?.count ?? 0
        })
        if (vertices > 3_000_000) throw new Error('Scan exceeds the 3 million vertex interactive reference limit')
        if (active) {
          setScene(loaded)
          setError('')
        } else disposeScene(loaded)
      } catch (e) {
        if (loaded) {
          disposeScene(loaded)
          loaded = null
        }
        if (active) setError(e instanceof Error ? e.message : 'Scan could not be read')
      }
    }
    void load()
    return () => {
      active = false
      if (loaded) disposeScene(loaded)
    }
  }, [buffer, setScene])
  const pick = async (file: File) => {
    const id = ++generation.current
    setBusy(true)
    setError('')
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('Scan exceeds 100 MiB')
      const buffer = await file.arrayBuffer()
      inspectGlb(buffer)
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')
      if (id !== generation.current) return
      const next = { buffer, hash, transform: { ...defaultTransform } }
      if (key && remember) await persist(next)
      if (id === generation.current) {
        setScan(next)
        setVisible(true)
      }
    } catch (e) {
      if (id === generation.current) setError(e instanceof Error ? e.message : 'Scan could not be loaded')
    } finally {
      if (id === generation.current) setBusy(false)
    }
  }
  const transform = async (next: ScanTransform) => {
    if (!scan) return
    if (
      !Object.values(next).every(Number.isFinite) ||
      next.scale < 0.01 ||
      next.scale > 100 ||
      next.opacity < 0.05 ||
      next.opacity > 1
    ) {
      setError('Invalid scan alignment')
      return
    }
    const value = { ...scan, transform: next }
    setScan(value)
    if (remember && key) {
      try {
        await persist(value)
      } catch (e) {
        setError(`Alignment is not persisted: ${e instanceof Error ? e.message : 'storage error'}`)
      }
    }
  }
  const retain = async (on: boolean) => {
    if (!key) return
    const before = remember
    setRemember(on)
    setRemembering(true)
    try {
      await persist(on ? scan : null)
      setError('')
    } catch (e) {
      setRemember(before)
      setError(e instanceof Error ? e.message : 'Local storage unavailable')
    } finally {
      setRemembering(false)
    }
  }
  const remove = async () => {
    if (key) {
      try {
        await persist(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove local scan')
        return
      }
    }
    generation.current++
    setScan(null)
    setRemember(false)
    setScene(null)
  }
  return {
    scan,
    scene,
    visible,
    setVisible,
    open,
    setOpen,
    error,
    busy,
    pick,
    transform,
    remember,
    remembering,
    cacheStatus,
    retain,
    remove,
  }
}
export type ScanState = ReturnType<typeof useLocalScan>
