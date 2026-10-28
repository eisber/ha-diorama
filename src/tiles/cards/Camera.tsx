import { entityName, formatState, moreInfo, runAction, type TileEnv } from '#/tiles/actions.ts'
import { useTileGestures } from '#/tiles/gestures.ts'
import type { TileConfig } from '#/tiles/host.tsx'
import { useEffect, useState } from 'react'

export type CameraConfig = TileConfig & {
  camera_view?: 'auto' | 'live'
  // Width to height, like 16:9. Used while the card's height follows its
  // content, which it does unless grid_options sets a number of rows.
  aspect_ratio?: string
}

type Helpers = { createCardElement: (config: Record<string, unknown>) => HTMLElement }
declare global {
  interface Window {
    loadCardHelpers?: () => Promise<Helpers>
  }
}

// Home Assistant's picture element is only loaded once a card that needs it
// is. Building a picture entity card that is never shown loads it.
export function useImageElement() {
  const [ready, setReady] = useState(() => customElements.get('hui-image') !== undefined)
  useEffect(() => {
    if (ready) return
    let live = true
    customElements.whenDefined('hui-image').then(() => live && setReady(true))
    window
      .loadCardHelpers?.()
      .then(helpers => helpers.createCardElement({ type: 'picture-entity', entity: 'camera.none' }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [ready])
  return ready
}

type Props = { env: TileEnv; config: CameraConfig }

// A camera picture, or an image entity's, that fills the tile, with its
// name and its state under it over a dark fade at the bottom. A tap or a
// hold opens it bigger.
export default function Camera({ env, config }: Props) {
  const entity = env.hass.states[config.entity!]
  const ready = useImageElement()
  const open = () => moreInfo(env.host, config.entity)
  const { pressed, handlers } = useTileGestures({
    haptics: config.haptic !== false,
    onTap: () => runAction(env, config.tap_action, open),
    onHold: () => runAction(env, config.hold_action, open),
  })
  // An image entity is a still picture that changes now and then.
  const still =
    config.entity?.startsWith('image.') && typeof entity?.attributes.entity_picture === 'string'
      ? entity.attributes.entity_picture
      : null
  const fixed = typeof config.grid_options?.rows === 'number'
  const ratio = (config.aspect_ratio ?? '16:9').replace(':', '/')
  return (
    <div
      {...handlers}
      role="button"
      tabIndex={0}
      aria-label={entityName(config, entity)}
      data-pressed={pressed || undefined}
      className="dio-tile dio-camera"
      style={fixed ? undefined : { aspectRatio: ratio, height: 'auto' }}
    >
      {ready && (
        <hui-image
          className="dio-camera-image"
          hass={env.hass}
          cameraImage={still ? undefined : config.entity}
          image={still ?? undefined}
          cameraView={config.camera_view ?? 'auto'}
          fitMode="cover"
        />
      )}
      <div className="dio-camera-overlay">
        <div className="dio-name">{entityName(config, entity)}</div>
        {entity && <div className="dio-state">{formatState(env.hass, entity)}</div>}
      </div>
    </div>
  )
}
