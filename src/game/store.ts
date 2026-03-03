import { create } from 'zustand'
import { DEFAULT_VEHICLE_PRESET_ID, VEHICLE_PRESETS } from './config'
import { evaluateVehicleSpec, sanitizeVehicleSpec, toVehiclePhysicsTuning } from './physics/vehicleAdapter'
import { createInputState } from './keys'
import type { MapId } from './maps'
import type { DriveInputState } from './keys'
import type { SavedVehicleBuild, VehiclePhysicsTuning, VehicleSpec, VehicleSpecEvaluation } from './types'

type GameStatus = 'running' | 'lost'
type BatterySaverMode = 'auto' | 'on' | 'off'
type MissionType = 'collect_stars' | 'collect_parts' | 'pass_gates' | 'clean_drive'

const MAX_DAMAGE = 100
const BUILD_STORAGE_KEY = 'autos.vehicleBuilds.v1'
const ACTIVE_BUILD_KEY = 'autos.activeBuild.v1'

export type ActiveMission = {
  id: number
  type: MissionType
  label: string
  target: number
  progress: number
  reward: number
}

const MISSION_TEMPLATES: Array<Omit<ActiveMission, 'id' | 'progress'>> = [
  { type: 'collect_stars', label: 'Collect Stars', target: 5, reward: 90 },
  { type: 'pass_gates', label: 'Drive Through Gates', target: 4, reward: 105 },
  { type: 'collect_parts', label: 'Find Spare Parts', target: 3, reward: 120 },
  { type: 'clean_drive', label: 'Clean Drive Time', target: 20, reward: 130 },
]

const buildMission = (index: number): ActiveMission => {
  const template = MISSION_TEMPLATES[index % MISSION_TEMPLATES.length]
  return {
    id: index,
    type: template.type,
    label: template.label,
    target: template.target,
    reward: template.reward,
    progress: 0,
  }
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

const getInitialVehicleSpec = (): VehicleSpec => {
  if (typeof window === 'undefined') {
    return sanitizeVehicleSpec(VEHICLE_PRESETS[DEFAULT_VEHICLE_PRESET_ID])
  }
  const parsed = safeParse<VehicleSpec>(window.localStorage.getItem(ACTIVE_BUILD_KEY))
  if (!parsed) {
    return sanitizeVehicleSpec(VEHICLE_PRESETS[DEFAULT_VEHICLE_PRESET_ID])
  }
  return sanitizeVehicleSpec(parsed)
}

const getInitialSavedBuilds = (): SavedVehicleBuild[] => {
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

const persistBuilds = (builds: SavedVehicleBuild[]) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(builds))
}

const persistActiveSpec = (spec: VehicleSpec) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(ACTIVE_BUILD_KEY, JSON.stringify(spec))
}

type GameState = {
  damage: number
  score: number
  bestScore: number
  speedKph: number
  steeringDeg: number
  status: GameStatus
  restartToken: number
  engineMuted: boolean
  batterySaverMode: BatterySaverMode
  selectedMapId: MapId
  proceduralMapSeed: number
  vehicleSpec: VehicleSpec
  vehicleSpecEvaluation: VehicleSpecEvaluation
  vehiclePhysicsTuning: VehiclePhysicsTuning
  selectedCarColor: string
  mission: ActiveMission
  gamepadConnected: boolean
  keyboardInput: DriveInputState
  savedBuilds: SavedVehicleBuild[]
  hitFxToken: number
  hitFxStrength: number
  lastHitLabel: string
  addDamage: (amount: number) => void
  addScore: (amount: number) => void
  repair: (amount: number) => void
  toggleEngineMuted: () => void
  setBatterySaverMode: (mode: BatterySaverMode) => void
  setSelectedMapId: (mapId: MapId) => void
  rerollProceduralMap: () => void
  setSelectedCarColor: (color: string) => void
  setVehicleSpec: (vehicleSpec: VehicleSpec) => void
  applyVehiclePreset: (presetId: keyof typeof VEHICLE_PRESETS) => void
  saveCurrentBuild: (name: string) => string
  loadSavedBuild: (buildId: string) => void
  deleteSavedBuild: (buildId: string) => void
  setKeyboardInput: (key: keyof DriveInputState, active: boolean) => void
  setGamepadConnected: (connected: boolean) => void
  triggerHitFx: (strength: number, label?: string) => void
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  advanceMission: (event: MissionType, amount?: number) => void
  setMissionProgress: (event: MissionType, progress: number) => void
  restartRun: () => void
}

const initialVehicleSpec = getInitialVehicleSpec()

export const useGameStore = create<GameState>((set, get) => ({
  damage: 0,
  score: 0,
  bestScore: 0,
  speedKph: 0,
  steeringDeg: 0,
  status: 'running',
  restartToken: 0,
  engineMuted: true,
  batterySaverMode: 'auto',
  selectedMapId: 'city',
  proceduralMapSeed: 1,
  vehicleSpec: initialVehicleSpec,
  vehicleSpecEvaluation: evaluateVehicleSpec(initialVehicleSpec),
  vehiclePhysicsTuning: toVehiclePhysicsTuning(initialVehicleSpec),
  selectedCarColor: initialVehicleSpec.cosmetics.bodyColor,
  mission: buildMission(0),
  gamepadConnected: false,
  keyboardInput: createInputState(),
  savedBuilds: getInitialSavedBuilds(),
  hitFxToken: 0,
  hitFxStrength: 0,
  lastHitLabel: '',
  addDamage: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      const nextDamage = Math.min(MAX_DAMAGE, state.damage + amount)
      return {
        ...state,
        damage: nextDamage,
        status: nextDamage >= MAX_DAMAGE ? 'lost' : 'running',
      }
    }),
  addScore: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      const nextScore = state.score + amount
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
      }
    }),
  repair: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      return {
        ...state,
        damage: Math.max(0, state.damage - amount),
      }
    }),
  toggleEngineMuted: () =>
    set((state) => ({
      ...state,
      engineMuted: !state.engineMuted,
    })),
  setBatterySaverMode: (mode) =>
    set((state) => ({
      ...state,
      batterySaverMode: mode,
    })),
  setSelectedMapId: (mapId) =>
    set((state) => ({
      ...state,
      selectedMapId: mapId,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
      speedKph: 0,
      steeringDeg: 0,
      mission: buildMission(0),
      proceduralMapSeed: mapId === 'procedural' ? state.proceduralMapSeed + 1 : state.proceduralMapSeed,
    })),
  rerollProceduralMap: () =>
    set((state) => ({
      ...state,
      proceduralMapSeed: state.proceduralMapSeed + 1,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
      speedKph: 0,
      steeringDeg: 0,
      mission: buildMission(0),
    })),
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
      const preset = VEHICLE_PRESETS[presetId]
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
    const nextBuild: SavedVehicleBuild = {
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
  setKeyboardInput: (key, active) =>
    set((state) => ({
      ...state,
      keyboardInput: { ...state.keyboardInput, [key]: active },
    })),
  setGamepadConnected: (connected) =>
    set((state) => ({
      ...state,
      gamepadConnected: connected,
    })),
  triggerHitFx: (strength, label = '') =>
    set((state) => ({
      ...state,
      hitFxToken: state.hitFxToken + 1,
      hitFxStrength: Math.max(0.15, Math.min(1, strength)),
      lastHitLabel: label,
    })),
  setTelemetry: (speedKph, steeringDeg) =>
    set((state) => ({
      ...state,
      speedKph,
      steeringDeg,
    })),
  advanceMission: (event, amount = 1) =>
    set((state) => {
      if (state.status === 'lost' || state.mission.type !== event) {
        return state
      }
      const nextProgress = Math.min(state.mission.target, state.mission.progress + Math.max(0, amount))
      if (nextProgress < state.mission.target) {
        return {
          ...state,
          mission: { ...state.mission, progress: nextProgress },
        }
      }
      const nextMission = buildMission(state.mission.id + 1)
      const reward = state.mission.reward
      const nextScore = state.score + reward
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
        mission: nextMission,
        hitFxToken: state.hitFxToken + 1,
        hitFxStrength: 0.45,
        lastHitLabel: `Mission Complete! +${reward}`,
      }
    }),
  setMissionProgress: (event, progress) =>
    set((state) => {
      if (state.status === 'lost' || state.mission.type !== event) {
        return state
      }
      const clamped = Math.max(0, Math.min(state.mission.target, progress))
      if (clamped === state.mission.progress) {
        return state
      }
      if (clamped < state.mission.target) {
        return {
          ...state,
          mission: { ...state.mission, progress: clamped },
        }
      }
      const nextMission = buildMission(state.mission.id + 1)
      const reward = state.mission.reward
      const nextScore = state.score + reward
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
        mission: nextMission,
        hitFxToken: state.hitFxToken + 1,
        hitFxStrength: 0.45,
        lastHitLabel: `Mission Complete! +${reward}`,
      }
    }),
  restartRun: () =>
    set((state) => ({
      ...state,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
      speedKph: 0,
      steeringDeg: 0,
      mission: buildMission(0),
    })),
}))
