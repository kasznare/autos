import { DEFAULT_VEHICLE_PRESET_ID, VEHICLE_PRESETS } from '../../config'
import { sanitizeVehicleSpec } from '../../physics/vehicleAdapter'
import type { SavedVehicleBuild, VehicleSpec } from '../../types'

const BUILD_STORAGE_KEY = 'autos.vehicleBuilds.v1'
const ACTIVE_BUILD_KEY = 'autos.activeBuild.v1'

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

export const getDefaultVehicleSpec = (): VehicleSpec => sanitizeVehicleSpec(VEHICLE_PRESETS[DEFAULT_VEHICLE_PRESET_ID])

export const getInitialVehicleSpec = (): VehicleSpec => {
  if (typeof window === 'undefined') {
    return getDefaultVehicleSpec()
  }
  const parsed = safeParse<VehicleSpec>(window.localStorage.getItem(ACTIVE_BUILD_KEY))
  if (!parsed) {
    return getDefaultVehicleSpec()
  }
  return sanitizeVehicleSpec(parsed)
}

export const getInitialSavedBuilds = (): SavedVehicleBuild[] => {
  if (typeof window === 'undefined') {
    return []
  }
  const parsed = safeParse<SavedVehicleBuild[]>(window.localStorage.getItem(BUILD_STORAGE_KEY))
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter((entry) => Boolean(entry && typeof entry.id === 'string' && typeof entry.createdAt === 'string' && entry.spec))
    .map((entry) => ({ ...entry, spec: sanitizeVehicleSpec(entry.spec) }))
}

export const persistBuilds = (builds: SavedVehicleBuild[]) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(builds))
}

export const persistActiveSpec = (spec: VehicleSpec) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(ACTIVE_BUILD_KEY, JSON.stringify(spec))
}

export const resetVehicleSetupStorage = () => {
  persistBuilds([])
  persistActiveSpec(getDefaultVehicleSpec())
}
