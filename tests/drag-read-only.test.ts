import assert from 'node:assert/strict'
import * as React from 'react'
import { mock, test } from 'node:test'
import { Group, OrthographicCamera } from 'three'
import { hookHarness } from './hooks.ts'

test('cover hook checks permission again on movement and release, before any sent ghost', async () => {
  const harness = hookHarness()
  mock.module('react', { exports: { ...React, ...harness.hooks } })
  const page = new EventTarget()
  const view = new EventTarget()
  Object.assign(globalThis, { document: Object.assign(page, { body: { style: { cursor: '' } } }), window: view })
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 5
  camera.updateMatrixWorld()
  const domElement = {
    ownerDocument: Object.assign(page, { defaultView: view }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
  }
  mock.module('@react-three/fiber', {
    exports: {
      useThree: (select: (state: unknown) => unknown) => select({ camera, gl: { domElement } }),
      useFrame: () => {},
    },
  })
  mock.module('@react-three/drei', { exports: { Html: () => null } })
  const { useDrag } = await import('../src/scene/decor/drag.tsx')
  let allowed = true
  const sent: number[] = []
  const action = {
    may: () => allowed,
    drop: (level: number) => {
      sent.push(level)
    },
  }
  let currentAction: typeof action | undefined = action
  const travel = { shut: [0, 0, 0], open: [0, 1, 0], span: [1, 0, 0] } as const
  const render = () =>
    harness.render(() => useDrag(travel as unknown as Parameters<typeof useDrag>[0], 0, 'open', currentAction))
  const event = (type: string, y: number) =>
    Object.assign(new Event(type), {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: y,
    }) as PointerEvent
  let drag = render()
  drag.frame.current = new Group()
  drag.start!(event('pointerdown', 100))
  page.dispatchEvent(event('pointermove', 60))
  assert.ok(render().dragged !== null)
  allowed = false
  page.dispatchEvent(event('pointerup', 50))
  drag = render()
  assert.equal(drag.sent, null)
  assert.equal(drag.dragged, null)
  assert.deepEqual(sent, [])

  allowed = true
  render().start!(event('pointerdown', 100))
  page.dispatchEvent(event('pointermove', 60))
  currentAction = undefined
  assert.equal(render().dragged, null)
  currentAction = action
  render()
  page.dispatchEvent(event('pointerup', 50))
  assert.deepEqual(sent, [])

  allowed = true
  drag.start!(event('pointerdown', 100))
  page.dispatchEvent(event('pointermove', 60))
  allowed = false
  page.dispatchEvent(event('pointermove', 50))
  page.dispatchEvent(event('pointerup', 50))
  assert.equal(render().dragged, null)
  assert.deepEqual(sent, [])

  allowed = true
  render().start!(event('pointerdown', 100))
  page.dispatchEvent(event('pointermove', 60))
  page.dispatchEvent(event('pointerup', 50))
  assert.deepEqual(sent, [0.5])
  assert.equal(render().sent, 0.5)
  currentAction = undefined
  assert.equal(render().sent, null)
  currentAction = action
  assert.equal(render().sent, null)
  harness.dispose()
})
