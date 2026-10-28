import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { Element, installDom } from './dom.ts'
import { guardServices, isReadOnly, ReadOnlyError } from '../src/lib/readOnly.ts'
import type { HomeAssistant } from '../src/types.ts'

test('real tile host guards services, captures controls before local mutations and rejects child overrides', async () => {
  installDom()
  mock.module('#/host.tsx', {
    exports: {
      injectProperties: () => {},
      ReactHost: class extends Element {
        _config: unknown = null
        _hass: unknown = null
        constructor() {
          super()
          this.attachShadow()
        }
        render() {}
      },
    },
  })
  mock.module('#/tiles/features/index.tsx', { exports: { isWide: () => false, tileRows: () => 2 } })
  const { TileHost } = await import('../src/tiles/host.tsx')
  class Tile extends TileHost<{ type: string; entity: string; read_only?: boolean }> {
    protected readonly domains = ['light']
    protected view() {
      return null
    }
  }
  let sent = 0
  const hass = {
    states: {},
    areas: {},
    themes: { darkMode: true },
    callService: async () => {
      sent++
    },
  } as unknown as HomeAssistant
  const tile = new Tile()
  tile.setConfig({ type: 'custom:dio-toggle', entity: 'light.demo' })
  tile.hass = hass
  const heldCall = tile.hass.callService
  await heldCall('light', 'toggle')
  assert.equal(sent, 1)
  let local = 0
  let inspected = 0
  tile.addEventListener('diorama-inspect', () => inspected++)
  tile.addEventListener('click', () => local++)
  tile.dispatchEvent(new Event('click', { cancelable: true }))
  assert.equal(local, 1)
  tile.setConfig({ type: 'custom:dio-toggle', entity: 'light.demo', read_only: true })
  const blocked = new Event('click', { cancelable: true })
  tile.dispatchEvent(blocked)
  assert.equal(blocked.defaultPrevented, true)
  assert.equal(local, 1)
  assert.equal(inspected, 1)
  assert.equal(tile.hasAttribute('data-read-only'), true)
  const tab = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Tab' })
  tile.dispatchEvent(tab)
  assert.equal(tab.defaultPrevented, false)
  await assert.rejects(heldCall('light', 'toggle'), ReadOnlyError)
  assert.equal(sent, 1)
  tile.hass = guardServices(hass, () => true)
  tile.setConfig({ type: 'custom:dio-toggle', entity: 'light.demo', read_only: false })
  assert.equal(tile.dioramaReadOnly, true)
  await assert.rejects(tile.hass.callService('light', 'toggle'), ReadOnlyError)
  tile.hass = hass
  assert.equal(tile.dioramaReadOnly, false)
  tile.dispatchEvent(new Event('click'))
  await tile.hass.callService('light', 'toggle')
  assert.equal(local, 2)
  assert.equal(sent, 2)
})

test('real side panel revokes existing callbacks immediately and propagates policy into rebuilt children', async () => {
  const { cards } = installDom()
  const { SidePanel } = await import('../src/tiles/sidePanel.ts')
  const panel = new SidePanel()
  let sent = 0
  const hass = {
    states: {},
    areas: {},
    callService: async () => {
      sent++
    },
  } as unknown as HomeAssistant
  panel.hass = hass
  const config = {
    type: 'custom:diorama-card',
    home: { entities: ['light.demo'] },
    rooms: [],
    side_panel: true,
  }
  panel.setConfig(config)
  await new Promise(setImmediate)
  const old = cards.find(card => card.config.entity === 'light.demo')!
  const oldHass = old.hass as HomeAssistant
  const heldCall = oldHass.callService
  await heldCall('light', 'toggle')
  assert.equal(sent, 1)
  panel.setConfig({ ...config, read_only: true })
  await assert.rejects(heldCall('light', 'toggle'), ReadOnlyError)
  await new Promise(setImmediate)
  const tile = cards.filter(card => card.config.entity === 'light.demo').at(-1)!
  assert.equal(tile.config.read_only, true)
  assert.equal(isReadOnly(tile.hass as HomeAssistant), true)
  await assert.rejects((tile.hass as HomeAssistant).callService('light', 'toggle'), ReadOnlyError)
  assert.equal(sent, 1)
  const find = (element: Element): Element | undefined =>
    element.className === 'cards' ? element : element.children.map(find).find(Boolean)
  const slot = find(panel.shadowRoot as unknown as Element)!
  let local = 0
  let inspected = 0
  panel.addEventListener('diorama-inspect', event => {
    assert.equal((event as CustomEvent).detail.entityId, 'light.demo')
    inspected++
  })
  slot.addEventListener('hass-more-info', () => local++)
  const native = new CustomEvent('hass-more-info', { detail: { entityId: 'light.demo' }, cancelable: true })
  Object.defineProperty(native, 'composedPath', { value: () => [tile, slot] })
  slot.dispatchEvent(native)
  assert.equal(native.defaultPrevented, true)
  assert.equal(local, 0)
  assert.equal(inspected, 1)
  panel.setConfig({ ...config, read_only: false })
  await new Promise(setImmediate)
  const live = cards.filter(card => card.config.entity === 'light.demo').at(-1)!
  await (live.hass as HomeAssistant).callService('light', 'toggle')
  assert.equal(sent, 2)
})
