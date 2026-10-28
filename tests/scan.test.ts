import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectGlb } from '../src/scan/glb.ts'

function glb(json: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(json))
  const length = Math.ceil(bytes.length / 4) * 4
  const buffer = new ArrayBuffer(20 + length),
    view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, length, true)
  view.setUint32(16, 0x4e4f534a, true)
  const contents = new Uint8Array(buffer, 20)
  contents.fill(32)
  contents.set(bytes)
  return buffer
}
test('self-contained GLBs stay local and external resources are rejected before parsing', () => {
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: 0 }] }
  assert.deepEqual(inspectGlb(glb(json)), json)
  for (const uri of [
    'https://example.invalid/texture.png',
    '/local/private.png',
    '../texture.png',
    'file:///private.glb',
  ]) {
    assert.throws(() => inspectGlb(glb({ asset: { version: '2.0' }, images: [{ uri }] })), /External scan resources/)
  }
  const truncated = glb(json).slice(0, 20)
  assert.throws(() => inspectGlb(truncated), /complete glTF/)
})
