import assert from 'node:assert/strict'
import * as React from 'react'
import { mock, test } from 'node:test'
import { Vector3 } from 'three'
import { hookHarness } from './hooks.ts'
import type { CardConfig, HomeAssistant } from '../src/types.ts'

test('real scene handlers revoke clicks, direct and pass drags after rerender without optimistic leaks', async () => {
  const harness = hookHarness()
  mock.module('react', { exports: { ...React, ...harness.hooks } })
  const canvas = new EventTarget()
  mock.module('@react-three/fiber', {
    exports: {
      useThree: (select: (state: unknown) => unknown) => select({ gl: { domElement: canvas }, get: () => ({}) }),
    },
  })
  mock.module('#/scene/decor/DecorationModel.tsx', { exports: { default: () => null } })
  mock.module('#/tiles/apps.ts', { exports: { appOf: () => null, PACKAGE: {} } })
  const { default: Devices } = await import('../src/scene/Devices.tsx')
  const { grabs } = await import('../src/scene/drags.ts')
  const sent: unknown[][] = []
  const hass = {
    states: {
      'light.demo': { entity_id: 'light.demo', state: 'off', attributes: {} },
      'cover.demo': {
        entity_id: 'cover.demo',
        state: 'open',
        attributes: { current_position: 30, supported_features: 4 },
      },
      'button.demo': { entity_id: 'button.demo', state: '2026-01-01T00:00:00Z', attributes: {} },
    },
    areas: {},
    callService: async (...args: unknown[]) => {
      sent.push(args)
    },
  } as unknown as HomeAssistant
  const config: CardConfig = {
    type: 'custom:diorama-card',
    rooms: [
      {
        id: 'demo',
        points: [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
      },
    ],
    decorations: [
      { id: 'lamp', kind: 'light_ceiling', room: 'demo', position: [1, 1] },
      { id: 'blind', kind: 'blind', room: 'demo', position: [2, 0] },
      { id: 'window', kind: 'window', room: 'demo', position: [2, 0] },
      { id: 'button', kind: 'doorbell', room: 'demo', position: [3, 0] },
    ],
    devices: [
      { entity_id: 'light.demo', room: 'demo', decorations: ['lamp'] },
      { entity_id: 'cover.demo', room: 'demo', decorations: ['blind'] },
      { entity_id: 'button.demo', room: 'demo', decorations: ['button'] },
    ],
  }
  const inspections: string[] = []
  let native = 0
  canvas.addEventListener('diorama-inspect', event => inspections.push((event as CustomEvent).detail.entityId))
  canvas.addEventListener('hass-more-info', () => native++)
  type Model = React.ReactElement<{
    item: { id: string }
    state: { on: boolean; presses?: number; level?: number }
    onClick?: () => void
    onOpen?: () => void
    onDrag?: { may: () => boolean; drop: (level: number) => void }
    passDrag?: (down: PointerEvent, at: Vector3) => void
  }>
  let readOnly: boolean | undefined
  let trials: ((id: string) => void) | undefined
  let roomFirst: (() => boolean) | undefined
  const render = () => {
    const tree = harness.render(() =>
      Devices({ hass, config: { ...config, read_only: readOnly }, onTry: trials, roomFirst }),
    )
    const children = (tree as React.ReactElement<{ children: Model[] }>).props.children
    return new Map(children.map(child => [child.props.item.id, child.props]))
  }
  let models = render()
  models.get('lamp')!.onClick!()
  assert.equal(sent.length, 1)
  models = render()
  assert.equal(models.get('lamp')!.state.on, true)
  const oldDrag = models.get('blind')!.onDrag!
  const oldPass = models.get('window')!.passDrag!
  assert.equal(oldDrag.may(), true)
  oldDrag.drop(0.7)
  assert.equal(sent.length, 2)
  assert.equal((sent[1][2] as { position: number }).position, 70)
  let grabsStarted = 0
  grabs.set('blind', () => grabsStarted++)
  oldPass({} as PointerEvent, new Vector3(2, 0, 0))
  assert.equal(grabsStarted, 1)
  models.get('button')!.onClick!()
  assert.equal(sent.length, 3)
  assert.equal(render().get('button')!.state.presses, 1)

  readOnly = true
  models = render()
  assert.equal(models.get('lamp')!.state.on, false)
  assert.equal(models.get('blind')!.state.level, 0.3)
  assert.equal(models.get('blind')!.onDrag, undefined)
  assert.equal(oldDrag.may(), false)
  oldDrag.drop(0.9)
  oldPass({} as PointerEvent, new Vector3(2, 0, 0))
  models.get('lamp')!.onClick!()
  models.get('button')!.onClick!()
  models.get('blind')!.onOpen!()
  assert.equal(sent.length, 3)
  assert.equal(grabsStarted, 1)
  assert.equal(native, 0)
  assert.deepEqual(inspections, ['light.demo', 'button.demo', 'cover.demo'])
  models = render()
  assert.equal(models.get('lamp')!.state.on, false)
  assert.equal(models.get('button')!.state.presses, 1)
  hass.states['button.demo'].state = '2026-01-01T00:01:00Z'
  assert.equal(render().get('button')!.state.presses, 2)
  hass.states['light.demo'].state = 'on'
  assert.equal(render().get('lamp')!.state.on, true)
  readOnly = false
  assert.equal(render().get('lamp')!.state.on, true)

  readOnly = true
  let navigated = 0
  roomFirst = () => {
    navigated++
    return true
  }
  render().get('lamp')!.onClick!()
  assert.equal(navigated, 1)
  assert.equal(inspections.length, 3)
  roomFirst = undefined
  const tried: string[] = []
  trials = id => tried.push(id)
  models = render()
  models.get('lamp')!.onClick!()
  assert.deepEqual(tried, ['lamp'])
  assert.equal(sent.length, 3)
  grabs.delete('blind')
  harness.dispose()
})
