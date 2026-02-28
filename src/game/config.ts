import type { KeyboardControlsEntry } from '@react-three/drei'

export const MAX_DAMAGE = 100
export const PLAYER_BODY_NAME = 'player-car'
export const TRACK_SIZE = 60
export const ROAD_OUTER_HALF = 23
export const ROAD_INNER_HALF = 11

export type ControlName = 'forward' | 'backward' | 'left' | 'right' | 'restart'
export type CarProfileId = 'steady' | 'speedy' | 'heavy'

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

export const CAR_PROFILES: Record<
  CarProfileId,
  {
    label: string
    accelMult: number
    topSpeedMult: number
    reverseSpeedMult: number
    steeringMult: number
    gripMult: number
    damageTakenMult: number
    mass: number
    engineTone: 'steady' | 'speedy' | 'heavy'
  }
> = {
  steady: {
    label: 'Steady',
    accelMult: 1,
    topSpeedMult: 1,
    reverseSpeedMult: 1,
    steeringMult: 1,
    gripMult: 1.03,
    damageTakenMult: 0.9,
    mass: 1.25,
    engineTone: 'steady',
  },
  speedy: {
    label: 'Speedy',
    accelMult: 1.16,
    // ~75 km/h on road (13.89 * 1.5 m/s).
    topSpeedMult: 1.5,
    reverseSpeedMult: 1.08,
    steeringMult: 1.08,
    gripMult: 0.94,
    damageTakenMult: 1.2,
    mass: 1.08,
    engineTone: 'speedy',
  },
  heavy: {
    label: 'Heavy',
    accelMult: 0.84,
    // ~25 km/h on road (13.89 * 0.5 m/s).
    topSpeedMult: 0.5,
    reverseSpeedMult: 0.88,
    steeringMult: 0.86,
    gripMult: 1.08,
    damageTakenMult: 0.72,
    mass: 1.62,
    engineTone: 'heavy',
  },
}

export const CAR_PROFILE_ORDER: CarProfileId[] = ['steady', 'speedy', 'heavy']
