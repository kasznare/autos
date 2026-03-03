import type { StateCreator } from 'zustand'
import type { DriveInputState } from '../keys'
import type { MapId } from '../maps'
import type { PhysicsDebugTelemetryV2, SavedVehicleBuild, VehiclePhysicsTuning, VehicleSpec, VehicleSpecEvaluation } from '../types'
import type { VEHICLE_PRESETS } from '../config'

export type GameStatus = 'running' | 'lost'
export type BatterySaverMode = 'auto' | 'on' | 'off'
export type RenderMode = 'flat-debug' | 'pretty'
export type RenderQualityTier = 'low' | 'medium' | 'high' | 'ultra'
export type MissionType = 'collect_stars' | 'collect_parts' | 'pass_gates' | 'clean_drive'

export type ActiveMission = {
  id: number
  type: MissionType
  label: string
  target: number
  progress: number
  reward: number
}

export type GameplaySlice = {
  damage: number
  score: number
  bestScore: number
  status: GameStatus
  restartToken: number
  mission: ActiveMission
  addDamage: (amount: number) => void
  addScore: (amount: number) => void
  repair: (amount: number) => void
  advanceMission: (event: MissionType, amount?: number) => void
  setMissionProgress: (event: MissionType, progress: number) => void
  restartRun: () => void
}

export type MapSlice = {
  selectedMapId: MapId
  proceduralMapSeed: number
  setSelectedMapId: (mapId: MapId) => void
  rerollProceduralMap: () => void
  resetMapSetup: () => void
}

export type VehicleSlice = {
  vehicleSpec: VehicleSpec
  vehicleSpecEvaluation: VehicleSpecEvaluation
  vehiclePhysicsTuning: VehiclePhysicsTuning
  selectedCarColor: string
  savedBuilds: SavedVehicleBuild[]
  setSelectedCarColor: (color: string) => void
  setVehicleSpec: (vehicleSpec: VehicleSpec) => void
  applyVehiclePreset: (presetId: keyof typeof VEHICLE_PRESETS) => void
  saveCurrentBuild: (name: string) => string
  loadSavedBuild: (buildId: string) => void
  deleteSavedBuild: (buildId: string) => void
  resetVehicleSetup: () => void
}

export type InputSlice = {
  keyboardInput: DriveInputState
  gamepadConnected: boolean
  setKeyboardInput: (key: keyof DriveInputState, active: boolean) => void
  setGamepadConnected: (connected: boolean) => void
}

export type UiSlice = {
  speedKph: number
  steeringDeg: number
  engineMuted: boolean
  batterySaverMode: BatterySaverMode
  renderMode: RenderMode
  renderQualityTier: RenderQualityTier
  renderWireframe: boolean
  hitFxToken: number
  hitFxStrength: number
  lastHitLabel: string
  physicsTelemetry: PhysicsDebugTelemetryV2
  toggleEngineMuted: () => void
  setEngineMuted: (muted: boolean) => void
  setBatterySaverMode: (mode: BatterySaverMode) => void
  setRenderMode: (mode: RenderMode) => void
  setRenderQualityTier: (tier: RenderQualityTier) => void
  setRenderWireframe: (enabled: boolean) => void
  resetUiSetup: () => void
  triggerHitFx: (strength: number, label?: string) => void
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  setPhysicsTelemetry: (next: Partial<PhysicsDebugTelemetryV2>) => void
}

export type GameState = GameplaySlice & MapSlice & VehicleSlice & InputSlice & UiSlice

export type SliceCreator<TSlice> = StateCreator<GameState, [], [], TSlice>
