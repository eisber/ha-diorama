export const MAX_SCAN_BYTES = 100 * 1024 * 1024

// Inspect the JSON before GLTFLoader can request an external buffer or image.
export function inspectGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_SCAN_BYTES)
    throw new Error('Choose a GLB between 20 bytes and 100 MiB')
  const view = new DataView(buffer)
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('A complete glTF 2.0 binary GLB is required')
  const length = view.getUint32(12, true)
  if (length % 4 !== 0 || 20 + length > buffer.byteLength) throw new Error('Invalid GLB JSON chunk')
  const json: unknown = JSON.parse(
    new TextDecoder()
      .decode(new Uint8Array(buffer, 20, length))
      .replace(/\0+$/, '')
      .trim(),
  )
  let nodes = 0
  const visit = (value: unknown) => {
    if (++nodes > 1_000_000) throw new Error('Scan metadata is too complex')
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'uri' && (typeof child !== 'string' || !child.startsWith('data:')))
          throw new Error('External scan resources are not allowed. Export a self-contained GLB')
        visit(child)
      }
    }
  }
  visit(json)
  return json
}
