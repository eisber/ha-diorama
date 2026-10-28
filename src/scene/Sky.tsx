import {
  DAYLIGHT_EASE_S,
  SUN_DIRECTION_DEG,
  SUN_ELEVATION_DEG,
  SUN_SHADOW_MAP_PX,
  SUN_SHADOW_RADIUS,
} from '#/constants.ts'
import { backdropLightness } from '#/scene/backdrop.ts'
import { daylight, sunElevation } from '#/scene/daylight.ts'
import { planBounds } from '#/scene/framing.ts'
import { AppearanceContext, lightingFor, lightingOf } from '#/scene/appearance.ts'
import {
  DAY_AMBIENT_INTENSITY,
  DAY_GROUND_COLOR,
  DAY_HEMISPHERE_INTENSITY,
  DAY_SKY_COLOR,
  DAY_SUN_COLOR,
  DAY_SUN_INTENSITY,
  HORIZON_GROUND_COLOR,
  HORIZON_SKY_COLOR,
  HORIZON_SUN_COLOR,
  NIGHT_GROUND_COLOR,
  NIGHT_SKY_COLOR,
  NIGHT_SUN_COLOR,
} from '#/theme.ts'
import { lean as isLean, useDevSettings } from '#/lib/devSettings.ts'
import type { HomeAssistant, Lighting, RoomConfig } from '#/types.ts'
import { useFrame, useThree } from '@react-three/fiber'
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, Object3D, type AmbientLight, type DirectionalLight, type HemisphereLight } from 'three'

// What the room is lit as: whatever the sun at the home says, or an hour of
// a plain day, which is what the editor's time of day slider picks.
export type SkyMode = 'auto' | number

// The light the room sits in, which follows the sun at the user's home. It
// is one soft warm wash: a sky above and a floor bounce below, with a gentle
// sun on top of them whose shadows are blurred wide rather than cut sharp.
// At night the wash drops to a dim warm glow and the lamps carry the room.
export default function Sky({
  hass,
  rooms = [],
  mode = 'auto',
  direction = SUN_DIRECTION_DEG,
  lighting,
}: {
  hass: HomeAssistant | null
  rooms?: RoomConfig[]
  mode?: SkyMode
  // Compass bearing the sun comes from, clockwise from the top of the plan.
  direction?: number
  lighting?: Lighting
}) {
  const appearance = useContext(AppearanceContext)
  const bright = lightingOf(appearance, lighting) === 'bright'
  const lean = isLean(useDevSettings())
  const target = daylight(sunElevation(hass, mode === 'auto' ? undefined : mode))
  const level = useRef(target.level)
  const height = useRef(target.height)
  const ambient = useRef<AmbientLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)

  // The sun stands over the middle of the flat and covers exactly it, so its
  // shadow map stays fine enough not to speckle a tabletop.
  const { center, reach } = useMemo(() => planBounds(rooms), [rooms])
  const aim = useMemo(() => new Object3D(), [])
  const extent = Math.max(reach * 1.2 + 1, 3)
  // The shadow camera's edges are set as props, and three only rebuilds its
  // projection when told, so a plan that grew kept the old, smaller map.
  useLayoutEffect(() => {
    sun.current?.shadow.camera.updateProjectionMatrix()
  }, [extent])
  // The sun stands on its bearing, at the height it keeps all day, far
  // enough out that its shadow camera clears the flat.
  const where = useMemo(() => {
    const bearing = MathUtils.degToRad(direction)
    const climb = MathUtils.degToRad(SUN_ELEVATION_DEG)
    const away = Math.max(reach * 2 + 8, 14)
    const flat = Math.cos(climb) * away
    return [center[0] + Math.sin(bearing) * flat, Math.sin(climb) * away, center[2] - Math.cos(bearing) * flat] as [
      number,
      number,
      number,
    ]
  }, [center, reach, direction])

  // Night, the horizon and overhead. The light blends along the sun's climb
  // first, from golden to near white, and then fades from night into that.
  const colors = useMemo(
    () => ({
      sky: [new Color(NIGHT_SKY_COLOR), new Color(HORIZON_SKY_COLOR), new Color(DAY_SKY_COLOR)],
      ground: [new Color(NIGHT_GROUND_COLOR), new Color(HORIZON_GROUND_COLOR), new Color(DAY_GROUND_COLOR)],
      sun: [new Color(NIGHT_SUN_COLOR), new Color(HORIZON_SUN_COLOR), new Color(DAY_SUN_COLOR)],
      lit: new Color(),
      mix: new Color(),
    }),
    [],
  )

  // Eased, so sunset arrives as a fade and not as a switch. Frames are
  // drawn on request, so the sun moving asks for one, and the fade asks
  // for the next until it has arrived.
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    invalidate()
  }, [target.level, target.height, invalidate])

  // How light the dashboard behind the card is, read again whenever Home
  // Assistant changes theme. The fill is raised with it, see theme.ts.
  const canvas = useThree(state => state.gl.domElement)
  const themes = hass?.themes
  const backdrop = useMemo(() => backdropLightness(canvas, themes?.darkMode ?? false), [canvas, themes])
  // Starts where the dashboard is, so the card never opens with a fade.
  const lift = useRef(backdrop)
  const settled = useRef(false)
  useEffect(() => {
    settled.current = false
    invalidate()
  }, [backdrop, appearance, lighting, invalidate])

  useFrame((_, delta) => {
    // Once the light has arrived it is left alone until the sun moves.
    const arrived =
      Math.abs(target.level - level.current) < 1e-4 &&
      Math.abs(target.height - height.current) < 1e-4 &&
      Math.abs(backdrop - lift.current) < 1e-4
    if (arrived && settled.current) return
    settled.current = arrived
    if (!arrived) invalidate()
    const k = 1 - Math.exp(-delta / DAYLIGHT_EASE_S)
    level.current += (target.level - level.current) * k
    height.current += (target.height - height.current) * k
    lift.current += (backdrop - lift.current) * k
    const illumination = lightingFor(appearance, level.current, lift.current, lighting)
    const day = bright ? 0.8 + level.current * 0.2 : level.current
    const up = bright ? 0.7 + height.current * 0.3 : height.current
    // Golden along the horizon, near white overhead, then faded toward the
    // night wash as the sun goes down.
    const tint = (set: Color[]) => colors.mix.lerpColors(set[0], colors.lit.lerpColors(set[1], set[2], up), day)
    if (ambient.current) {
      ambient.current.intensity = illumination.ambient
      ambient.current.color.copy(tint(colors.sky))
    }
    if (hemi.current) {
      hemi.current.intensity = illumination.hemisphere
      hemi.current.color.copy(tint(colors.sky))
      hemi.current.groundColor.copy(tint(colors.ground))
    }
    if (sun.current) {
      sun.current.intensity = illumination.sun
      sun.current.color.copy(tint(colors.sun))
    }
  })
  // The light is aimed at the middle of the flat rather than at the
  // scene's origin, which a flat drawn off to one side is not.
  useLayoutEffect(() => {
    aim.position.set(center[0], center[1], center[2])
    aim.updateMatrixWorld()
    if (sun.current) sun.current.target = aim
  }, [aim, center])

  return (
    <>
      <ambientLight ref={ambient} intensity={DAY_AMBIENT_INTENSITY} color={DAY_SKY_COLOR} />
      <hemisphereLight
        ref={hemi}
        intensity={DAY_HEMISPHERE_INTENSITY}
        color={DAY_SKY_COLOR}
        groundColor={DAY_GROUND_COLOR}
      />
      <directionalLight
        ref={sun}
        position={where}
        intensity={DAY_SUN_INTENSITY}
        color={DAY_SUN_COLOR}
        // Performance mode, on a phone or tablet, leaves the sun without one.
        castShadow={!lean}
        // The map is fitted to the flat and kept coarse on purpose, which is
        // what softens daylight: a piece gets a soft pool under it rather
        // than a hard outline of itself.
        shadow-mapSize={[SUN_SHADOW_MAP_PX, SUN_SHADOW_MAP_PX]}
        shadow-radius={SUN_SHADOW_RADIUS}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={0.5}
        shadow-camera-far={extent * 2 + 24}
      />
    </>
  )
}
