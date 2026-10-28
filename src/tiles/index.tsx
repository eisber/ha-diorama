import { registerIcons, tileForm, titleForm, type Extra } from '#/tiles/editor.ts'
import { stubEntity, TileHost, type GridOptions, type TileConfig } from '#/tiles/host.tsx'
import Button from '#/tiles/cards/Button.tsx'
import Camera, { type CameraConfig } from '#/tiles/cards/Camera.tsx'
import Climate from '#/tiles/cards/Climate.tsx'
import Cover, { type CoverConfig } from '#/tiles/cards/Cover.tsx'
import Entity from '#/tiles/cards/Entity.tsx'
import Lock from '#/tiles/cards/Lock.tsx'
import Media from '#/tiles/cards/Media.tsx'
import Select, { type SelectConfig } from '#/tiles/cards/Select.tsx'
import Title, { type TitleConfig } from '#/tiles/cards/Title.tsx'
import Toggle from '#/tiles/cards/Toggle.tsx'
import Vacuum, { type VacuumConfig } from '#/tiles/cards/Vacuum.tsx'
import AlarmPanel from '#/tiles/cards/AlarmPanel.tsx'
import Calendar, { type CalendarConfig } from '#/tiles/cards/Calendar.tsx'
import Dial from '#/tiles/cards/Dial.tsx'
import Gauge, { type GaugeConfig } from '#/tiles/cards/Gauge.tsx'
import Graph, { isNumeric, type GraphConfig } from '#/tiles/cards/Graph.tsx'
import MapCard, { type MapConfig } from '#/tiles/cards/Map.tsx'
import MediaControl, { MediaRemote, type MediaControlConfig } from '#/tiles/cards/MediaControl.tsx'
import Remote, { keysOf, type RemoteConfig } from '#/tiles/cards/Remote.tsx'
import Todo from '#/tiles/cards/Todo.tsx'
import Weather, { type WeatherConfig } from '#/tiles/cards/Weather.tsx'
import { FEATURES, featuresFor, isWide } from '#/tiles/features/index.tsx'
import { isReadOnly } from '#/lib/readOnly.ts'
import { MEDIA } from '#/tiles/features/media.tsx'
import { supports } from '#/tiles/features/parts.tsx'
import type { HomeAssistant } from '#/types.ts'
import type { ReactNode } from 'react'

// The Diorama tiles, shipped in the same file as the diorama card.

const TOGGLE_DOMAINS = [
  'light',
  'switch',
  'input_boolean',
  'fan',
  'humidifier',
  'siren',
  'remote',
  'automation',
  'valve',
  'media_player',
]
const BUTTON_DOMAINS = ['button', 'input_button', 'script', 'scene']
const COVER_DOMAINS = ['cover']
const VACUUM_DOMAINS = ['vacuum']
const SELECT_DOMAINS = ['select', 'input_select']
const CAMERA_DOMAINS = ['camera', 'image']
const CLIMATE_DOMAINS = ['climate', 'water_heater']
const MEDIA_DOMAINS = ['media_player']
const LOCK_DOMAINS = ['lock']
const WEATHER_DOMAINS = ['weather']
const GRAPH_DOMAINS = ['sensor', 'binary_sensor', 'input_number', 'number', 'counter', 'person', 'device_tracker']
const GAUGE_DOMAINS = ['sensor', 'input_number', 'number', 'counter']
const DIAL_DOMAINS = ['climate', 'water_heater', 'humidifier', 'light']
const MAP_DOMAINS = ['person', 'device_tracker', 'zone']

// Pause, seek, volume set, previous, next, volume step, stop and play.
const PLAYS = 1 | 2 | 4 | 16 | 32 | 1024 | 4096 | 16384

type EntityView<C extends TileConfig> = (props: {
  env: { hass: HomeAssistant; host: HTMLElement; entityId?: string }
  config: C
}) => ReactNode

// One class per card, which only names its domains and its view. A wide
// card starts wide in the card picker, to show its controls.
function entityCard<C extends TileConfig>(
  domains: string[] | 'any',
  View: EntityView<C>,
  extras: Extra[] = [],
  wide = false,
  panel = false,
) {
  return class extends TileHost<C> {
    protected readonly domains = domains

    static getConfigForm() {
      return tileForm(domains, extras, panel)
    }

    static getStubConfig(hass?: HomeAssistant) {
      const named = domains === 'any' ? ['sensor'] : domains
      return { entity: stubEntity(hass, named) ?? `${named[0]}.example`, ...(wide && { size: 'wide' }) }
    }

    protected view() {
      if (!this._hass) return null
      const env = { hass: this._hass, host: this, entityId: this._config!.entity }
      // Discard pending sliders, confirmations and optimistic tile state
      // when the policy changes, rather than replaying them in live mode.
      return <View key={String(isReadOnly(this._hass))} env={env} config={this._config!} />
    }
  }
}

class TitleCard extends TileHost<TitleConfig & TileConfig> {
  protected readonly domains = null

  static getStubConfig() {
    return { title: 'Living Room' }
  }

  static getConfigForm() {
    return titleForm()
  }

  getCardSize() {
    return 1
  }

  getGridOptions(): GridOptions {
    return { columns: 'full', rows: 1 }
  }

  protected view() {
    return <Title hass={this._hass} config={this._config!} area={this.area()} />
  }
}

class CameraCard extends entityCard<CameraConfig>(CAMERA_DOMAINS, Camera, ['camera']) {
  getCardSize() {
    return 4
  }

  getGridOptions(): GridOptions {
    return { columns: 12, rows: 'auto' }
  }
}

class WeatherCard extends entityCard<WeatherConfig>(WEATHER_DOMAINS, Weather, ['forecast']) {
  getCardSize() {
    const size = this._config?.size
    return size === 'large' ? 6 : size === 'small' ? 2 : 3
  }

  getGridOptions(): GridOptions {
    const size = this._config?.size
    return { columns: size === 'small' ? 6 : 'full', rows: size === 'large' ? 6 : size === 'small' ? 2 : 3 }
  }
}

// A card bigger than a tile, like the calendar, as wide and as tall as the
// grid says, whatever size its config names, or as its config makes it.
function panelCard<C extends TileConfig>(
  domains: string[],
  View: EntityView<C>,
  grid: GridOptions | ((config: C | null) => GridOptions),
  size: number,
  extras: Extra[] = [],
) {
  return class extends entityCard<C>(domains, View, extras, false, true) {
    getCardSize() {
      return size
    }

    getGridOptions(): GridOptions {
      return typeof grid === 'function' ? grid(this._config) : grid
    }
  }
}

// The remote, offered for one whose keys it knows, the remote itself first.
class RemoteCard extends panelCard<RemoteConfig>(
  ['remote', 'media_player'],
  Remote,
  // Four rows across the whole width, or six half as wide, where its keys
  // stand one over the other.
  config => {
    const columns = config?.grid_options?.columns
    const half = typeof columns === 'number' && columns <= 6
    return half
      ? { columns: 6, rows: 6, min_columns: 6, min_rows: 6 }
      : { columns: 'full', rows: 4, min_columns: 12, min_rows: 4 }
  },
  4,
  ['remote'],
) {
  static getStubConfig(hass?: HomeAssistant) {
    const ids = Object.keys(hass?.states ?? {}).sort((a, b) => +b.startsWith('remote.') - +a.startsWith('remote.'))
    const found = ids.map(id => keysOf(hass!, id)).find(Boolean)
    return found ? { entity: found.entity } : super.getStubConfig(hass)
  }
}

type Card = {
  type: string
  element: CustomElementConstructor
  name: string
  description: string
  // The entity domains it shows, any for every one, none for no entity.
  domains: string[] | 'any' | null
  // Wide, it shows its controls, and small it does not.
  wide?: boolean
  // A card of its own for a few domains, like the alarm panel, offered
  // beside the tile of the domain rather than in its place.
  extra?: boolean
  // Whether it can act only on a second tap.
  twice?: boolean
  // The domains it is offered for only that way, and only for an entity
  // that can be turned on and off, beside the card made for them, like a
  // TV's player.
  twiceOnly?: string[]
  // What a wide tile adds, named after with, for a tile with controls.
  controls?: string
  // The features the card picker leaves out, since they only repeat what
  // the tile with no control already does.
  repeats?: string[]
  // The suggestions in place of the ones made from twice, controls and the
  // features.
  suggest?: (hass: HomeAssistant, entityId: string) => Suggestion[] | null
  // The names of those suggestions past the first, each offered as a card
  // of its own in the card picker's list.
  variants?: string[]
}

// A way to set up a card, named for Home Assistant's card picker by what
// sets it apart, after the card's name, as in Diorama Toggle - Color, and
// for ours by a name of its own, as in Toggle with Color.
type Suggestion = { label?: string; name?: string; config: Record<string, unknown> }

const CARDS: Card[] = [
  {
    type: 'dio-title',
    element: TitleCard,
    domains: null,
    name: 'Diorama Room Title',
    description: 'Section heading that follows the room filter',
  },
  {
    type: 'dio-toggle',
    element: entityCard(TOGGLE_DOMAINS, Toggle, ['confirm']),
    domains: TOGGLE_DOMAINS,
    name: 'Diorama Toggle',
    twice: true,
    twiceOnly: ['media_player'],
    description: 'Light, switch, fan, valve or anything else on or off',
  },
  {
    type: 'dio-button',
    element: entityCard(BUTTON_DOMAINS, Button, ['confirm']),
    domains: BUTTON_DOMAINS,
    name: 'Diorama Button',
    repeats: ['button'],
    twice: true,
    description: 'Button, script or scene widget',
  },
  {
    type: 'dio-cover',
    element: entityCard<CoverConfig>(COVER_DOMAINS, Cover, ['invert'], true),
    wide: true,
    domains: COVER_DOMAINS,
    name: 'Diorama Cover',
    repeats: ['open-close'],
    controls: 'Buttons',
    description: 'Blind or screen widget with up, stop and down',
  },
  {
    type: 'dio-vacuum',
    element: entityCard<VacuumConfig>(VACUUM_DOMAINS, Vacuum, ['battery_entity'], true),
    wide: true,
    domains: VACUUM_DOMAINS,
    name: 'Diorama Vacuum',
    repeats: ['commands'],
    controls: 'Buttons',
    description: 'Robot vacuum widget',
  },
  {
    type: 'dio-select',
    element: entityCard<SelectConfig>(SELECT_DOMAINS, Select, ['tap_behavior']),
    domains: SELECT_DOMAINS,
    name: 'Diorama Option List',
    repeats: ['select-options'],
    description: 'Option widget with a menu',
  },
  {
    type: 'dio-climate',
    element: entityCard(CLIMATE_DOMAINS, Climate, [], true),
    wide: true,
    domains: CLIMATE_DOMAINS,
    name: 'Diorama Thermostat',
    controls: 'Temperature and Modes',
    description: 'Thermostat or water heater widget with its temperature and modes',
  },
  {
    type: 'dio-media',
    element: entityCard(MEDIA_DOMAINS, Media, [], true),
    wide: true,
    domains: MEDIA_DOMAINS,
    name: 'Diorama Media Player',
    repeats: ['playback'],
    controls: 'Buttons',
    description: 'Speaker or TV widget with play, pause and tracks',
  },
  {
    type: 'dio-lock',
    element: entityCard(LOCK_DOMAINS, Lock),
    name: 'Diorama Lock',
    description: 'Lock widget',
    domains: LOCK_DOMAINS,
  },
  {
    type: 'dio-entity',
    element: entityCard('any', Entity),
    domains: 'any',
    name: 'Diorama Any Entity',
    description: 'Any entity, like a sensor, with its state',
  },
  {
    type: 'dio-weather',
    element: WeatherCard,
    domains: WEATHER_DOMAINS,
    name: 'Diorama Weather',
    description: 'The weather now and the next hours',
    variants: ['Hourly Weather', 'Daily Weather', 'Small Weather', 'Large Weather'],
    suggest: (hass, entityId) => {
      const features = Number(hass.states[entityId]?.attributes.supported_features ?? 0)
      const config = { type: 'custom:dio-weather', entity: entityId }
      const small = { label: 'Small', name: 'Small Weather', config: { ...config, size: 'small' } }
      // A large tile lists the days, under the hours when there are any.
      const sized =
        features & 1
          ? [small, { label: 'Large', name: 'Large Weather', config: { ...config, size: 'large' } }]
          : [small]
      // Both forecasts offered, one suggestion each, the hours first.
      if (!(features & 1) || !(features & 2)) return [{ config }, ...sized]
      return [
        { label: 'Hourly', name: 'Hourly Weather', config: { ...config, forecast_type: 'hourly' } },
        { label: 'Daily', name: 'Daily Weather', config: { ...config, forecast_type: 'daily' } },
        ...sized,
      ]
    },
  },
  {
    type: 'dio-camera',
    element: CameraCard,
    name: 'Diorama Camera',
    description: 'Camera or image picture widget',
    domains: CAMERA_DOMAINS,
  },
  {
    type: 'dio-alarm-panel',
    element: panelCard(['alarm_control_panel'], AlarmPanel, { columns: 'full', rows: 5 }, 5),
    extra: true,
    domains: ['alarm_control_panel'],
    name: 'Diorama Alarm Keypad',
    description: 'The alarm with a button for each mode and a keypad for its code',
  },
  {
    type: 'dio-dial',
    element: panelCard<TileConfig>(
      DIAL_DOMAINS,
      Dial,
      // A light has nothing in the top right corner, so its ring reaches up
      // there and the card is a row shorter.
      config => ({ columns: 12, rows: config?.entity?.startsWith('light.') ? 4 : 5 }),
      5,
    ),
    extra: true,
    domains: DIAL_DOMAINS,
    name: 'Diorama Big Dial',
    description: 'A thermostat, water heater, humidifier or light on a big ring you drag',
    suggest: (hass, entityId) => {
      const entity = hass.states[entityId]
      const domain = entityId.split('.')[0]
      if (domain === 'light' && !featuresFor(entity).some(feature => feature.id === 'brightness')) return null
      return [{ config: { type: 'custom:dio-dial', entity: entityId } }]
    },
  },
  {
    type: 'dio-media-control',
    element: panelCard<MediaControlConfig>(
      MEDIA_DOMAINS,
      MediaControl,
      // Four rows tall, or two half as wide, whatever it shows.
      config => {
        const columns = config?.grid_options?.columns
        const half = typeof columns === 'number' && columns <= 6
        return { columns: 'full', rows: half ? 2 : 4, min_columns: 6, min_rows: 2 }
      },
      4,
      ['art'],
    ),
    extra: true,
    domains: MEDIA_DOMAINS,
    name: 'Diorama Now Playing',
    description: 'What is playing, with its art, how far in it is, its buttons and volume',
    variants: ['Now Playing with Art as Icon'],
    // Only for a player that plays, pauses, skips or changes its volume,
    // since one that only browses or searches would show next to nothing.
    suggest: (hass, entityId) =>
      !supports(hass.states[entityId], PLAYS)
        ? []
        : [
            { config: { type: 'custom:dio-media-control', entity: entityId } },
            {
              label: 'Art as Icon',
              name: 'Now Playing with Art as Icon',
              config: { type: 'custom:dio-media-control', entity: entityId, art: 'icon' },
            },
          ],
  },
  {
    type: 'dio-media-remote',
    element: panelCard<MediaControlConfig>(
      MEDIA_DOMAINS,
      MediaRemote,
      // Always across the whole width, two rows tall while it is off, and
      // as tall as the remote under it makes it once on.
      { columns: 'full', rows: 'auto', min_columns: 12, max_columns: 12, fixed: true },
      2,
      ['remote'],
    ),
    extra: true,
    domains: MEDIA_DOMAINS,
    name: 'Diorama Media and Remote',
    description: 'What is playing and its buttons, with the remote under them while it is on',
    // Only for a player that plays and whose remote keys it knows.
    suggest: (hass, entityId) =>
      supports(hass.states[entityId], PLAYS) && keysOf(hass, entityId)
        ? [{ config: { type: 'custom:dio-media-remote', entity: entityId } }]
        : [],
  },
  {
    type: 'dio-remote',
    element: RemoteCard,
    extra: true,
    domains: ['remote', 'media_player'],
    name: 'Diorama TV Remote',
    description: 'Arrows, OK, back, home, mute and volume for a TV or a streaming box',
    // Only for a TV or a box whose keys it knows, by its own integration or
    // another on the same device.
    suggest: (hass, entityId) =>
      keysOf(hass, entityId) ? [{ config: { type: 'custom:dio-remote', entity: entityId } }] : [],
  },
  {
    type: 'dio-calendar',
    element: panelCard<CalendarConfig>(['calendar'], Calendar, { columns: 'full', rows: 6 }, 6, ['calendar']),
    extra: true,
    domains: ['calendar'],
    name: 'Diorama Calendar',
    description: 'The coming events of one calendar or more, day by day',
    variants: ["Today's Calendar"],
    suggest: (_, entityId) => [
      { config: { type: 'custom:dio-calendar', entity: entityId } },
      { label: 'Today', name: "Today's Calendar", config: { type: 'custom:dio-calendar', entity: entityId, days: 1 } },
    ],
  },
  {
    type: 'dio-todo',
    element: panelCard(['todo'], Todo, { columns: 'full', rows: 'auto' }, 5),
    extra: true,
    domains: ['todo'],
    name: 'Diorama To-do List',
    description: 'A list to add to and tick off',
  },
  {
    type: 'dio-graph',
    element: panelCard<GraphConfig>(GRAPH_DOMAINS, Graph, { columns: 12, rows: 4 }, 4, ['graph']),
    extra: true,
    domains: GRAPH_DOMAINS,
    name: 'Diorama History Graph',
    description: 'The history of a reading, or the times something was on',
    variants: ['Daily Bar Graph'],
    suggest: (hass, entityId) => {
      const entity = hass.states[entityId]
      const config = { type: 'custom:dio-graph', entity: entityId }
      const numeric = isNumeric(entity)
      const daily = numeric && typeof entity?.attributes.state_class === 'string'
      return [
        // A strip of on and off needs less height than a line.
        { config: numeric ? config : { ...config, grid_options: { columns: 12, rows: 2 } } },
        ...(daily ? [{ label: 'Daily Bars', name: 'Daily Bar Graph', config: { ...config, chart: 'bar' } }] : []),
      ]
    },
  },
  {
    type: 'dio-gauge',
    element: panelCard<GaugeConfig>(GAUGE_DOMAINS, Gauge, { columns: 6, rows: 2 }, 2, ['gauge']),
    extra: true,
    domains: GAUGE_DOMAINS,
    name: 'Diorama Ring Gauge',
    description: 'A reading on a ring',
    suggest: (hass, entityId) =>
      isNumeric(hass.states[entityId]) ? [{ config: { type: 'custom:dio-gauge', entity: entityId } }] : null,
  },
  {
    type: 'dio-map',
    element: panelCard<MapConfig>(MAP_DOMAINS, MapCard, { columns: 12, rows: 4 }, 4, ['map']),
    extra: true,
    domains: MAP_DOMAINS,
    name: 'Diorama Map',
    description: 'Where a person, a tracker or a zone is',
    variants: ['Map on Top'],
    suggest: (_, entityId) => [
      { config: { type: 'custom:dio-map', entity: entityId } },
      { label: 'On Top', name: 'Map on Top', config: { type: 'custom:dio-map', entity: entityId, layout: 'top' } },
    ],
  },
]

export function registerTiles() {
  registerIcons()
  window.customCards = window.customCards ?? []
  for (const card of CARDS) {
    if (!customElements.get(card.type)) customElements.define(card.type, card.element)
    // The name the tile had before the card was renamed, so a dashboard
    // written then still finds it. It is left out of the card picker.
    const old = card.type.replace(/^dio-/, 'fp-')
    if (!customElements.get(old)) customElements.define(old, class extends card.element {})
    if (!window.customCards.some(c => c.type === card.type))
      window.customCards.push({
        type: card.type,
        name: card.name,
        description: card.description,
        preview: true,
        getEntitySuggestion: (hass, entityId) =>
          suggestions(card, hass, entityId)?.map(({ label, config }) => ({ label, config })) ?? null,
      })
    for (const name of variantNames(card)) registerVariant(card, name)
  }
}

// Every way a card can be set up past the plain one, by name, whatever the
// entity: acting on a second tap, wide with its controls, and with each
// control it can show beside its icon.
function variantNames(card: Card): string[] {
  if (card.suggest) return card.variants ?? []
  const name = shortName(card)
  const features = card.extra
    ? []
    : FEATURES.filter(
        feature => !card.repeats?.includes(feature.id) && feature.domains.some(domain => shows(card, `${domain}.any`)),
      )
  return [
    ...new Set([
      ...(card.twice ? [`Double Tap ${name}`] : []),
      ...(card.controls ? [`${name} with ${card.controls}`] : []),
      ...features.map(feature => `${name} with ${feature.name}`),
    ]),
  ]
}

// A way to set up a card offered as a card of its own in the card picker's
// list, as in Diorama Toggle with Color. It goes by a name of its own there,
// but picking it adds the card itself, set up that way for the first entity
// that can be, so nothing but the card's own name ever reaches the YAML.
function registerVariant(card: Card, name: string) {
  const type = `${card.type}-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`
  if (customElements.get(type)) return
  const element = card.element as CustomElementConstructor & {
    getStubConfig?: (hass?: HomeAssistant) => Record<string, unknown>
  }
  customElements.define(
    type,
    class extends element {
      static getStubConfig(hass?: HomeAssistant) {
        const ids = Object.keys(hass?.states ?? {})
        for (const id of ids) {
          const found = suggestions(card, hass!, id)?.find(suggestion => suggestion.name === name)
          if (found) return found.config
        }
        return { ...element.getStubConfig?.(hass), type: `custom:${card.type}` }
      }
    },
  )
  window.customCards!.push({ type, name: `Diorama ${name}`, description: card.description, preview: true })
}

// The suggestions of a card for an entity picked in Home Assistant's card
// picker: the tile, then set to act on a second tap, then wide with its
// controls for a tile with them, then the tile with each control it can
// show beside its icon, as Home Assistant offers its own tile with each of
// its features.
function suggestions(card: Card, hass: HomeAssistant, entityId: string): Suggestion[] | null {
  if (!shows(card, entityId)) return null
  if (card.suggest) return card.suggest(hass, entityId)
  const config = { type: `custom:${card.type}`, entity: entityId }
  const name = shortName(card)
  if (card.twiceOnly?.includes(entityId.split('.')[0]))
    return supports(hass.states[entityId], MEDIA.turnOn) && supports(hass.states[entityId], MEDIA.turnOff)
      ? [{ label: 'Double Tap', name: `Double Tap ${name}`, config: { ...config, confirm: true } }]
      : null
  // A tile with controls comes small, with them only when they fit, and
  // wide with them.
  const base: Suggestion[] = [
    { config },
    ...(card.twice ? [{ label: 'Double Tap', name: `Double Tap ${name}`, config: { ...config, confirm: true } }] : []),
    ...(card.controls
      ? [{ label: card.controls, name: `${name} with ${card.controls}`, config: { ...config, size: 'wide' } }]
      : []),
  ]
  if (card.extra) return base
  const features = featuresFor(hass.states[entityId])
    .filter(feature => !card.repeats?.includes(feature.id))
    .map(feature => {
      const featured = { ...config, feature: feature.id }
      return {
        label: feature.name,
        name: `${name} with ${feature.name}`,
        config: isWide(featured, hass.states[entityId]) ? { ...featured, size: 'wide' } : featured,
      }
    })
  return [...base, ...features]
}

// A card's name without ours before it, as in Toggle.
const shortName = (card: Card) => card.name.replace(/^Diorama (Any )?/, '')

// Domains whose state alone says nothing, like a calendar's on or off, so
// Diorama Entity is never offered for them.
const SAYS_NOTHING = ['calendar']

// Whether a card is the one to offer for an entity picked in Home
// Assistant's card picker. Diorama Entity is offered only for an entity
// no other tile is made for, like a sensor.
function shows(card: Card, entityId: string) {
  const domain = entityId.split('.')[0]
  if (card.domains === 'any' && SAYS_NOTHING.includes(domain)) return false
  if (card.domains === 'any')
    return !CARDS.some(other => !other.extra && Array.isArray(other.domains) && other.domains.includes(domain))
  return !!card.domains?.includes(domain)
}

export type TileOption = { name: string; config: Record<string, unknown> }

// Every card of ours an entity can be shown as in the side panel, with
// each way each one can be set up, the card made for its domain first.
// Diorama Entity is offered for any entity, as its state.
export function tileOptions(hass: HomeAssistant, entityId: string): TileOption[] {
  const domain = entityId.split('.')[0]
  const fits = (card: Card) =>
    card.domains === 'any' ? !SAYS_NOTHING.includes(domain) : !!card.domains?.includes(domain)
  const made = (card: Card) =>
    !card.extra && !card.twiceOnly?.includes(domain) && Array.isArray(card.domains) && card.domains.includes(domain)
  const ranked = [...CARDS.filter(made), ...CARDS.filter(card => fits(card) && !made(card))]
  return ranked.flatMap(card => {
    const own: Suggestion[] =
      card.domains === 'any' && !shows(card, entityId)
        ? [{ config: { type: `custom:${card.type}`, entity: entityId } }]
        : (suggestions(card, hass, entityId) ?? [])
    return own.map(suggestion => ({ name: suggestion.name ?? shortName(card), config: suggestion.config }))
  })
}
