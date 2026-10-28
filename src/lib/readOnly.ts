import type { HomeAssistant } from '#/types.ts'

const policies = new WeakMap<HomeAssistant, () => boolean>()

export class ReadOnlyError extends Error {
  constructor(domain: string, service: string) {
    super(`Read only: ${domain}.${service} was not sent`)
    this.name = 'ReadOnlyError'
  }
}

export function isReadOnly(hass: HomeAssistant | null | undefined): boolean {
  return !!hass && (policies.get(hass)?.() ?? false)
}

// Evaluate at dispatch, not at render or pointer-down. A child cannot undo
// an enclosing card's policy. Telemetry and explicit review metadata writes
// through callWS remain available. This is a UI guard, not HA authorization.
export function guardServices(hass: HomeAssistant, readOnly: () => boolean): HomeAssistant {
  const blocked = () => readOnly() || isReadOnly(hass)
  const callService: HomeAssistant['callService'] = (...args) =>
    blocked() ? Promise.reject(new ReadOnlyError(args[0], args[1])) : hass.callService(...args)
  const guarded = new Proxy(hass, {
    get(target, key, receiver) {
      return key === 'callService' ? callService : Reflect.get(target, key, receiver)
    },
  })
  policies.set(guarded, blocked)
  return guarded
}

export function inspectEntity(host: EventTarget, entityId: string | undefined) {
  if (!entityId) return
  host.dispatchEvent(new CustomEvent('diorama-inspect', { detail: { entityId }, bubbles: true, composed: true }))
}

export function readOnlyHost(host: HTMLElement): boolean {
  return (host as HTMLElement & { readonly dioramaReadOnly?: boolean }).dioramaReadOnly === true
}

// Capture before generated controls can set optimistic local state. The
// service boundary remains guarded too, including callbacks already in flight.
export const CONTROL_EVENTS = [
  'pointerdown',
  'pointerup',
  'click',
  'dblclick',
  'keydown',
  'keyup',
  'input',
  'change',
  'submit',
  'contextmenu',
  'hass-more-info',
] as const
