import { DEFAULT_VEHICLE_PRESET_ID, VEHICLE_PRESETS } from '../../config'
import { evaluateVehicleSpec, sanitizeVehicleSpec, toVehiclePhysicsTuning } from '../../physics/vehicleAdapter'
import type { SliceCreator, VehicleSlice } from '../../store/types'
import {
  getDefaultVehicleSpec,
  getInitialSavedBuilds,
  getInitialVehicleSpec,
  persistActiveSpec,
  persistBuilds,
  resetVehicleSetupStorage,
} from './storage'

const initialVehicleSpec = getInitialVehicleSpec()

export const createVehicleSlice: SliceCreator<VehicleSlice> = (set, get) => ({
  vehicleSpec: initialVehicleSpec,
  vehicleSpecEvaluation: evaluateVehicleSpec(initialVehicleSpec),
  vehiclePhysicsTuning: toVehiclePhysicsTuning(initialVehicleSpec),
  selectedCarColor: initialVehicleSpec.cosmetics.bodyColor,
  savedBuilds: getInitialSavedBuilds(),
  setSelectedCarColor: (color) =>
    set((state) => {
      const nextSpec = sanitizeVehicleSpec({
        ...state.vehicleSpec,
        cosmetics: {
          ...state.vehicleSpec.cosmetics,
          bodyColor: color,
        },
      })
      persistActiveSpec(nextSpec)
      return {
        ...state,
        selectedCarColor: nextSpec.cosmetics.bodyColor,
        vehicleSpec: nextSpec,
      }
    }),
  setVehicleSpec: (vehicleSpec) =>
    set((state) => {
      const sanitized = sanitizeVehicleSpec(vehicleSpec)
      persistActiveSpec(sanitized)
      return {
        ...state,
        vehicleSpec: sanitized,
        vehicleSpecEvaluation: evaluateVehicleSpec(sanitized),
        vehiclePhysicsTuning: toVehiclePhysicsTuning(sanitized),
        selectedCarColor: sanitized.cosmetics.bodyColor,
      }
    }),
  applyVehiclePreset: (presetId) =>
    set((state) => {
      const preset = VEHICLE_PRESETS[presetId] ?? VEHICLE_PRESETS[DEFAULT_VEHICLE_PRESET_ID]
      const sanitized = sanitizeVehicleSpec(preset)
      persistActiveSpec(sanitized)
      return {
        ...state,
        vehicleSpec: sanitized,
        vehicleSpecEvaluation: evaluateVehicleSpec(sanitized),
        vehiclePhysicsTuning: toVehiclePhysicsTuning(sanitized),
        selectedCarColor: sanitized.cosmetics.bodyColor,
      }
    }),
  saveCurrentBuild: (name) => {
    const state = get()
    const timestamp = new Date().toISOString()
    const sanitized = sanitizeVehicleSpec({ ...state.vehicleSpec, name })
    const buildId = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
    const nextBuild = {
      id: buildId,
      createdAt: timestamp,
      spec: sanitized,
    }
    const nextBuilds = [nextBuild, ...state.savedBuilds].slice(0, 14)

    persistBuilds(nextBuilds)
    persistActiveSpec(sanitized)
    set({
      savedBuilds: nextBuilds,
      vehicleSpec: sanitized,
      vehicleSpecEvaluation: evaluateVehicleSpec(sanitized),
      vehiclePhysicsTuning: toVehiclePhysicsTuning(sanitized),
      selectedCarColor: sanitized.cosmetics.bodyColor,
    })
    return buildId
  },
  loadSavedBuild: (buildId) =>
    set((state) => {
      const selected = state.savedBuilds.find((build) => build.id === buildId)
      if (!selected) {
        return state
      }
      const sanitized = sanitizeVehicleSpec(selected.spec)
      persistActiveSpec(sanitized)
      return {
        ...state,
        vehicleSpec: sanitized,
        vehicleSpecEvaluation: evaluateVehicleSpec(sanitized),
        vehiclePhysicsTuning: toVehiclePhysicsTuning(sanitized),
        selectedCarColor: sanitized.cosmetics.bodyColor,
      }
    }),
  deleteSavedBuild: (buildId) =>
    set((state) => {
      const nextBuilds = state.savedBuilds.filter((build) => build.id !== buildId)
      if (nextBuilds.length === state.savedBuilds.length) {
        return state
      }
      persistBuilds(nextBuilds)
      return {
        ...state,
        savedBuilds: nextBuilds,
      }
    }),
  resetVehicleSetup: () =>
    set((state) => {
      const defaultSpec = getDefaultVehicleSpec()
      resetVehicleSetupStorage()
      return {
        ...state,
        vehicleSpec: defaultSpec,
        vehicleSpecEvaluation: evaluateVehicleSpec(defaultSpec),
        vehiclePhysicsTuning: toVehiclePhysicsTuning(defaultSpec),
        selectedCarColor: defaultSpec.cosmetics.bodyColor,
        savedBuilds: [],
      }
    }),
})
