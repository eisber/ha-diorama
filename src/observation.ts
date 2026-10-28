export function observedLevel(state: string | undefined, range: { min: number; max: number; invert?: boolean }) {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min)
    throw new Error('An observation range needs finite increasing limits')
  if (!state?.trim()) return null
  const raw = Number(state)
  if (!Number.isFinite(raw)) return null
  const level = Math.max(0, Math.min(1, (raw - range.min) / (range.max - range.min)))
  return range.invert ? 1 - level : level
}
