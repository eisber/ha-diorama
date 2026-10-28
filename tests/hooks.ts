// A synchronous hook harness for shallow boundary tests, without a DOM or WebGL.
export function hookHarness() {
  const slots: unknown[] = []
  const cleanups = new Map<number, () => unknown>()
  let index = 0
  let effects: (() => unknown)[] = []
  const hooks = {
    useState<T>(initial: T | (() => T)) {
      const at = index++
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [
        slots[at] as T,
        (next: T | ((previous: T) => T)) => {
          slots[at] = typeof next === 'function' ? (next as (previous: T) => T)(slots[at] as T) : next
        },
      ] as const
    },
    useRef<T>(initial: T) {
      const at = index++
      return (slots[at] ??= { current: initial }) as { current: T }
    },
    useEffect(effect: () => unknown, deps?: unknown[]) {
      const at = index++
      const before = slots[at] as unknown[] | undefined
      if (!deps || !before || deps.some((value, i) => value !== before[i])) {
        slots[at] = deps
        effects.push(() => {
          cleanups.get(at)?.()
          cleanups.delete(at)
          const cleanup = effect()
          if (typeof cleanup === 'function') cleanups.set(at, cleanup as () => unknown)
        })
      }
    },
  }
  return {
    hooks: { ...hooks, useLayoutEffect: hooks.useEffect },
    render<T>(view: () => T) {
      index = 0
      const result = view()
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      return result
    },
    dispose() {
      for (const cleanup of cleanups.values()) cleanup()
      cleanups.clear()
    },
  }
}
