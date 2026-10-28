import { createContext } from 'react'
import type { Appearance } from '#/types.ts'
import {
  DAY_AMBIENT_INTENSITY,
  DAY_HEMISPHERE_INTENSITY,
  DAY_SUN_INTENSITY,
  LIGHT_BACKDROP_AMBIENT_BOOST,
  LIGHT_BACKDROP_HEMISPHERE_BOOST,
  NIGHT_AMBIENT_INTENSITY,
  NIGHT_HEMISPHERE_INTENSITY,
  NIGHT_SUN_INTENSITY,
} from '#/theme.ts'

export const AppearanceContext = createContext<Appearance>('standard')

export function lightingFor(appearance: Appearance, day: number, backdrop: number) {
  const between = (night: number, light: number) => night + (light - night) * day
  if (appearance === 'illustrated')
    return {
      ambient: between(0.8, 0.92),
      hemisphere: between(1.55, 1.75),
      sun: between(1.6, 2.3),
    }
  const raised = (boost: number) => 1 + (boost - 1) * backdrop
  return {
    ambient: between(NIGHT_AMBIENT_INTENSITY, DAY_AMBIENT_INTENSITY) * raised(LIGHT_BACKDROP_AMBIENT_BOOST),
    hemisphere: between(NIGHT_HEMISPHERE_INTENSITY, DAY_HEMISPHERE_INTENSITY) * raised(LIGHT_BACKDROP_HEMISPHERE_BOOST),
    sun: between(NIGHT_SUN_INTENSITY, DAY_SUN_INTENSITY),
  }
}
