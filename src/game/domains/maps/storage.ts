import { MAP_ORDER } from '../../maps'
import type { MapId } from '../../maps'

const MAP_SETUP_KEY = 'autos.mapSetup.v1'

type PersistedMapSetup = {
  selectedMapId: MapId
  proceduralMapSeed: number
}

export const DEFAULT_MAP_SETUP: PersistedMapSetup = {
  selectedMapId: 'gaia',
  proceduralMapSeed: 1,
}

const safeParse = <T,>(value: string | null): T | null => {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const sanitizeSeed = (value: number) => {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.max(1, Math.floor(value))
}

const isMapId = (value: unknown): value is MapId => typeof value === 'string' && MAP_ORDER.includes(value as MapId)

export const getInitialMapSetup = (): PersistedMapSetup => {
  if (typeof window === 'undefined') {
    return DEFAULT_MAP_SETUP
  }
  const parsed = safeParse<PersistedMapSetup>(window.localStorage.getItem(MAP_SETUP_KEY))
  if (!parsed || !isMapId(parsed.selectedMapId)) {
    return DEFAULT_MAP_SETUP
  }
  return {
    selectedMapId: parsed.selectedMapId,
    proceduralMapSeed: sanitizeSeed(parsed.proceduralMapSeed),
  }
}

export const persistMapSetup = (setup: PersistedMapSetup) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    MAP_SETUP_KEY,
    JSON.stringify({
      selectedMapId: setup.selectedMapId,
      proceduralMapSeed: sanitizeSeed(setup.proceduralMapSeed),
    }),
  )
}

export const resetMapSetupStorage = () => {
  persistMapSetup(DEFAULT_MAP_SETUP)
}
