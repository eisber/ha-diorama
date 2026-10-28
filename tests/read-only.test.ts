import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { guardServices, isReadOnly, ReadOnlyError } from '../src/lib/readOnly.ts'
import { callService, moreInfo, runAction } from '../src/tiles/actions.ts'
import { autoGroups } from '../src/tiles/auto.ts'
import type { CardConfig, HomeAssistant } from '../src/types.ts'

function fixture() {
  const sent: unknown[][] = []
  const messages: unknown[] = []
  const hass = {
    states: { 'light.demo': { entity_id: 'light.demo', state: 'off', attributes: {} } },
    areas: {},
    callService: async (...args: unknown[]) => {
      sent.push(args)
      return 'confirmed'
    },
    callWS: async (message: unknown) => {
      messages.push(message)
      return 'saved'
    },
  } as unknown as HomeAssistant
  return { hass, sent, messages }
}

test('typed service boundary defaults live and checks the current inherited policy at dispatch', async () => {
  const { hass, sent, messages } = fixture()
  let observing = false
  const parent = guardServices(hass, () => observing)
  const child = guardServices(parent, () => false)
  const pending = child.callService
  await pending('light', 'turn_on', { entity_id: 'light.demo' }, { area_id: 'demo' }, false)
  assert.equal(sent.length, 1)
  assert.equal(isReadOnly(child), false)
  observing = true
  await assert.rejects(pending('light', 'turn_off'), ReadOnlyError)
  assert.equal(isReadOnly(child), true)
  assert.equal(sent.length, 1)
  assert.equal(child.states, hass.states)
  assert.equal(await child.callWS!({ type: 'lovelace/config/save', config: { synthetic: true } }), 'saved')
  assert.equal(messages.length, 1)
  assert.equal(await hass.callService('light', 'turn_off'), 'confirmed')
  observing = false
  await pending('light', 'toggle')
  assert.equal(sent.length, 3)
})

test('tile actions do not run fallback, confirmations or native controls in read-only mode', async () => {
  const { hass, sent } = fixture()
  const host = Object.assign(new EventTarget(), { dioramaReadOnly: true }) as unknown as HTMLElement
  const events: string[] = []
  host.addEventListener('diorama-inspect', event => {
    const detail = (event as CustomEvent).detail
    assert.equal(detail.entityId, 'light.demo')
    assert.equal(event.bubbles, true)
    assert.equal(event.composed, true)
    events.push(event.type)
  })
  host.addEventListener('hass-more-info', () => assert.fail('native controls exposed'))
  const env = { hass: guardServices(hass, () => true), host, entityId: 'light.demo' }
  for (const action of [
    undefined,
    { action: 'default' },
    { action: 'toggle' },
    { action: 'more-info' },
    { action: 'perform-action', perform_action: 'light.turn_on', confirmation: true },
    { action: 'call-service', service: 'light.turn_off' },
  ] as Parameters<typeof runAction>[1][]) {
    runAction(env, action, () => assert.fail('read-only action ran its fallback'))
  }
  moreInfo(host, 'light.demo')
  assert.equal(events.length, 7)
  const errors = mock.method(console, 'error', () => {})
  assert.equal(await callService(env.hass, 'light.toggle'), false)
  assert.equal(errors.mock.callCount(), 1)
  assert.equal(sent.length, 0)
  assert.equal(await callService(hass, 'light.toggle'), true)
  assert.equal(sent.length, 1)
  errors.mock.restore()
})

test('live tile actions and native inspection still work by default', async () => {
  const { hass, sent } = fixture()
  const host = new EventTarget() as HTMLElement
  let opened = 0
  let fallback = 0
  host.addEventListener('hass-more-info', () => opened++)
  const env = { hass, host, entityId: 'light.demo' }
  runAction(env, undefined, () => fallback++)
  runAction(env, { action: 'toggle' }, () => assert.fail())
  runAction(env, { action: 'more-info' }, () => assert.fail())
  await Promise.resolve()
  assert.equal(fallback, 1)
  assert.equal(opened, 1)
  assert.equal(sent.length, 1)
})

test('all generated panel cards inherit read-only after custom choices, including attempted false overrides', () => {
  const config = {
    type: 'custom:diorama-card',
    read_only: true,
    home: { entities: ['light.demo'], tiles: { 'light.demo': { type: 'custom:dio-toggle', read_only: false } } },
    rooms: [
      {
        id: 'demo',
        points: [],
        entities: ['cover.demo'],
        tiles: { 'cover.demo': { type: 'custom:dio-cover', read_only: false } },
      },
    ],
  } as CardConfig
  const groups = autoGroups(config)
  assert.equal(groups.length, 2)
  for (const card of groups.flatMap(group => group.cards)) assert.equal(card.read_only, true)
  const live = autoGroups({ ...config, read_only: undefined })
  assert.equal(live[0].cards[1].read_only, false)
})
