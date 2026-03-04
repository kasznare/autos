export const VEHICLE_DEFINITION_SCHEMA_VERSION = '3.0.0' as const

export type Vec3Tuple = readonly [number, number, number]

export type VehicleClass = 'car' | 'bus' | 'lorry'
export type PowertrainKind = 'ice' | 'ev'
export type DriveLayout = 'fwd' | 'rwd' | 'awd'
export type DifferentialMode = 'open' | 'locked'
export type AxleRole = 'front' | 'rear' | 'mid' | 'tag'

export interface AeroDefinition {
  cdA: number
  clA?: number
}

export interface ChassisDefinition {
  massKg: number
  centerOfMassLocal: Vec3Tuple
  inertiaDiagonal: Vec3Tuple
}

export interface IcePowertrainDefinition {
  kind: 'ice'
  idleRpm: number
  maxRpm: number
  engineBrakeNm: number
  torqueCurve: ReadonlyArray<readonly [rpm: number, torqueNm: number]>
}

export interface EvPowertrainDefinition {
  kind: 'ev'
  maxRpm: number
  peakTorqueNm: number
  regenTorqueNm: number
}

export type PowertrainDefinition = IcePowertrainDefinition | EvPowertrainDefinition

export interface DrivetrainDefinition {
  layout: DriveLayout
  frontDifferential: DifferentialMode
  rearDifferential: DifferentialMode
  centerSplit?: {
    front: number
    rear: number
  }
}

export interface SuspensionDefinition {
  restLength: number
  travel: number
  stiffness: number
  damping: number
}

export interface WheelDefinition {
  id: string
  side: 'left' | 'right'
  localAnchor: Vec3Tuple
  radius: number
  width: number
  massKg: number
  friction: number
  restitution: number
  steerable: boolean
  driven: boolean
  braked: boolean
  suspension: SuspensionDefinition
  knuckle?: {
    enabled: boolean
    massKg: number
    halfExtents: Vec3Tuple
  }
}

export interface AxleDefinition {
  id: string
  role: AxleRole
  differential: DifferentialMode
  antiRollStiffness: number
  wheels: readonly [WheelDefinition, WheelDefinition]
}

export interface VehicleDefinition {
  schemaVersion: typeof VEHICLE_DEFINITION_SCHEMA_VERSION
  id: string
  label: string
  class: VehicleClass
  powertrain: PowertrainDefinition
  drivetrain: DrivetrainDefinition
  chassis: ChassisDefinition
  aero: AeroDefinition
  axles: readonly AxleDefinition[]
}
