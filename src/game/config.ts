import type { KeyboardControlsEntry } from '@react-three/drei'
import type { VehicleSpec, VehicleSpecLimits } from './types'

export const MAX_DAMAGE = 100
export const PLAYER_BODY_NAME = 'player-car'
export const TRACK_SIZE = 60
export const ROAD_OUTER_HALF = 23
export const ROAD_INNER_HALF = 11

export type ControlName = 'forward' | 'backward' | 'left' | 'right' | 'restart'
export type VehiclePresetId = 'balanced' | 'sprinter' | 'bulldozer' | 'drifter'

export const INPUT_MAP: KeyboardControlsEntry<ControlName>[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'restart', keys: ['KeyR', 'Space'] },
]

export const DAMAGE_TIERS = {
  low: 5,
  medium: 15,
  high: 30,
}

export const CAR_COLOR_OPTIONS = ['#1e63f0', '#f49b1a', '#14b86c', '#d83b2d', '#8f4df2', '#f2c230'] as const

export const DAMAGE_DRIVE_EFFECTS = {
  accelerationLoss: 0.42,
  topSpeedLoss: 0.45,
  steeringLoss: 0.3,
  gripLoss: 0.35,
  criticalThreshold: 85,
}

export const DRIVE_SURFACE = {
  road: {
    forwardAcceleration: 30,
    reverseAcceleration: 16,
    // Base top speed in m/s (50 km/h).
    forwardTopSpeed: 13.89,
    reverseTopSpeed: -3.8,
    coastDrag: 0.985,
    throttleDrag: 0.996,
    gripFactor: 1,
  },
  grass: {
    forwardAcceleration: 27,
    reverseAcceleration: 15,
    // Slightly slower than road to keep surface feel subtle.
    forwardTopSpeed: 12.5,
    reverseTopSpeed: -3.2,
    coastDrag: 0.982,
    throttleDrag: 0.994,
    gripFactor: 0.96,
  },
}

export const KID_TUNING = {
  damageTakenScale: 0.62,
  armorDamageScale: 0.45,
  armorDurationSec: 9,
}

export const VEHICLE_PHYSICS = {
  wheelBase: 2.25,
  maxSteerRad: 0.5,
  steerResponse: 8.8,
  brakeDecel: 20,
  reverseBrakeDecel: 15.5,
  engineBrake: 4.5,
  rollingResistance: 0.35,
  aeroDrag: 0.01,
}

export const DAMAGE_SPUTTER = {
  minInterval: 0.12,
  variableInterval: 0.28,
  chance: 0.35,
  throttleFactor: 0.18,
}

export const VEHICLE_SPEC_LIMITS: VehicleSpecLimits = {
  power: {
    acceleration: { min: 20, max: 85, step: 1 },
    topSpeed: { min: 20, max: 90, step: 1 },
  },
  handling: {
    grip: { min: 25, max: 90, step: 1 },
    drift: { min: 10, max: 85, step: 1 },
    brake: { min: 25, max: 90, step: 1 },
  },
  // Sum of positive trait deltas above neutral (50) across five sliders.
  balanceBudget: 78,
  // Per-slider maximum delta above neutral (50).
  maxPositiveBias: 35,
}

export const VEHICLE_PRESETS: Record<VehiclePresetId, VehicleSpec> = {
  balanced: {
    name: 'Balanced Scout',
    chassisSize: 'standard',
    massClass: 'balanced',
    power: { acceleration: 52, topSpeed: 52 },
    handling: { grip: 56, drift: 34, brake: 55 },
    cosmetics: { bodyColor: '#1e63f0', accentColor: '#d6ebff' },
  },
  sprinter: {
    name: 'Sprinter',
    chassisSize: 'compact',
    massClass: 'light',
    power: { acceleration: 73, topSpeed: 78 },
    handling: { grip: 48, drift: 46, brake: 42 },
    cosmetics: { bodyColor: '#f49b1a', accentColor: '#fff1de' },
  },
  bulldozer: {
    name: 'Bulldozer',
    chassisSize: 'large',
    massClass: 'heavy',
    power: { acceleration: 38, topSpeed: 36 },
    handling: { grip: 66, drift: 16, brake: 74 },
    cosmetics: { bodyColor: '#d83b2d', accentColor: '#ffe3dd' },
  },
  drifter: {
    name: 'Drifter',
    chassisSize: 'standard',
    massClass: 'light',
    power: { acceleration: 62, topSpeed: 68 },
    handling: { grip: 42, drift: 72, brake: 45 },
    cosmetics: { bodyColor: '#8f4df2', accentColor: '#efe2ff' },
  },
}

export const VEHICLE_PRESET_ORDER: VehiclePresetId[] = ['balanced', 'sprinter', 'bulldozer', 'drifter']
export const DEFAULT_VEHICLE_PRESET_ID: VehiclePresetId = 'balanced'
