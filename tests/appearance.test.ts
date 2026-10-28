import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lightingFor } from '../src/scene/appearance.ts'
import { autoGroups } from '../src/tiles/auto.ts'
import type { CardConfig } from '../src/types.ts'

test('illustrated lighting stays readable through night and ignores the dashboard brightness boost', () => {
  for (const day of [0, 0.1, 0.5, 1]) {
    const dark = lightingFor('illustrated', day, 0)
    assert.deepEqual(dark, lightingFor('illustrated', day, 1))
    assert.ok(dark.ambient > lightingFor('standard', day, 0).ambient)
    assert.ok(dark.hemisphere > lightingFor('standard', day, 0).hemisphere)
  }
  const night = lightingFor('standard', 0, 0)
  const day = lightingFor('standard', 1, 0)
  const dusk = lightingFor('standard', 0.5, 0)
  for (const key of ['ambient', 'hemisphere', 'sun'] as const) {
    assert.equal(dusk[key], night[key] + (day[key] - night[key]) * 0.5)
  }
  assert.ok(lightingFor('standard', 1, 1).ambient > day.ambient)
})

test('illustrated sensor bubbles preserve chosen controls, explicit sizes and read-only policy without mutating config', () => {
  const config: CardConfig = {
    type: 'custom:diorama-card',
    appearance: 'illustrated',
    read_only: true,
    home: {
      entities: ['sensor.temperature', 'climate.room', 'sensor.sized', 'sensor.feature', 'sensor.alternative'],
      tiles: {
        'sensor.sized': { type: 'custom:dio-entity', grid_options: { columns: 6, rows: 2 } },
        'sensor.feature': { type: 'custom:dio-entity', feature: 'numeric-input' },
        'sensor.alternative': { type: 'custom:other-card' },
      },
    },
  }
  const before = structuredClone(config)
  const cards = autoGroups(config).flatMap(group => group.cards)
  const byEntity = (entity: string) => cards.find(card => card.entity === entity)!
  assert.equal(byEntity('sensor.temperature').layout, 'bubble')
  assert.deepEqual(byEntity('sensor.temperature').grid_options, { columns: 12, rows: 1 })
  for (const id of ['climate.room', 'sensor.sized', 'sensor.feature', 'sensor.alternative'])
    assert.equal(byEntity(id).layout, undefined)
  assert.deepEqual(byEntity('sensor.sized').grid_options, { columns: 6, rows: 2 })
  assert.ok(cards.every(card => card.read_only === true))
  assert.deepEqual(config, before)
  assert.ok(
    autoGroups({ ...config, appearance: 'standard' })
      .flatMap(group => group.cards)
      .every(card => card.layout === undefined),
  )
})
