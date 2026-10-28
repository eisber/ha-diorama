import type { EntityState, HomeAssistant } from '#/types.ts'
import { inspectEntity, isReadOnly, readOnlyHost } from '#/lib/readOnly.ts'

// What a tap or a hold on a tile does, in the format Home Assistant's own
// cards use for tap_action and hold_action. `default` keeps the tile's own.
export type ActionConfig = {
  action: 'default' | 'toggle' | 'more-info' | 'navigate' | 'url' | 'perform-action' | 'call-service' | 'none'
  entity?: string
  navigation_path?: string
  navigation_replace?: boolean
  url_path?: string
  perform_action?: string
  service?: string
  data?: Record<string, unknown>
  service_data?: Record<string, unknown>
  target?: Record<string, unknown>
  confirmation?: boolean | { text?: string }
}

export type TileEnv = { hass: HomeAssistant; host: HTMLElement; entityId?: string }

export function entityName(config: { name?: string; entity?: string }, entity: EntityState | undefined) {
  return config.name ?? (entity?.attributes.friendly_name as string | undefined) ?? config.entity ?? ''
}

export function moreInfo(host: HTMLElement, entityId: string | undefined) {
  if (!entityId) return
  if (readOnlyHost(host)) return inspectEntity(host, entityId)
  host.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }))
}

// The companion app turns this into a short vibration.
export function haptic(kind: 'light' | 'medium' | 'selection' = 'light') {
  window.dispatchEvent(new CustomEvent('haptic', { detail: kind }))
}

// A failure is only logged, not shown as an error toast, since a device that
// misses one press, like a TV still waking up, is no news to whoever pressed.
export function callService(hass: HomeAssistant, action: string, data?: Record<string, unknown>) {
  const [domain, service] = action.split('.', 2)
  return hass.callService(domain, service, data, undefined, false).then(
    () => true,
    error => {
      console.error(`Diorama tiles: ${action} was not sent or confirmed`, error)
      return false
    },
  )
}

function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace } }))
}

// Runs an action from the config, or the tile's own when there is none.
export function runAction(env: TileEnv, action: ActionConfig | undefined, fallback: () => void) {
  if (
    (isReadOnly(env.hass) || readOnlyHost(env.host)) &&
    !['navigate', 'url', 'none'].includes(action?.action ?? 'default')
  )
    return inspectEntity(env.host, action?.entity ?? env.entityId)
  if (!action || action.action === 'default') return fallback()
  if (action.action === 'none') return
  if (action.confirmation) {
    const text = typeof action.confirmation === 'object' ? action.confirmation.text : undefined
    if (!confirm(text ?? 'Are you sure?')) return
  }
  const entityId = action.entity ?? env.entityId
  switch (action.action) {
    case 'toggle':
      if (entityId) callService(env.hass, 'homeassistant.toggle', { entity_id: entityId })
      return
    case 'more-info':
      return moreInfo(env.host, entityId)
    case 'navigate':
      if (action.navigation_path) navigate(action.navigation_path, action.navigation_replace)
      return
    case 'url':
      if (action.url_path) window.open(action.url_path, '_blank', 'noopener')
      return
    case 'perform-action':
    case 'call-service': {
      const name = action.perform_action ?? action.service
      if (!name?.includes('.')) return console.warn('Diorama tiles: an action needs perform_action as domain.service')
      const [domain, service] = name.split('.', 2)
      env.hass
        .callService(domain, service, action.data ?? action.service_data, action.target)
        .catch(error => console.error(`Diorama tiles: ${name}`, error))
    }
  }
}

// The state as Home Assistant words it, translated and with its unit.
export function formatState(hass: HomeAssistant, entity: EntityState | undefined) {
  if (!entity) return ''
  if (hass.formatEntityState) return hass.formatEntityState(entity)
  const unit = entity.attributes.unit_of_measurement
  return typeof unit === 'string' ? `${entity.state} ${unit}` : entity.state
}

// An attribute as Home Assistant words it, like a temperature with its unit.
export function formatAttribute(hass: HomeAssistant, entity: EntityState, attribute: string) {
  return hass.formatEntityAttributeValue?.(entity, attribute) ?? String(entity.attributes[attribute])
}
