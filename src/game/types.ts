export type CollisionMaterial = 'soft' | 'medium' | 'hard'

export type WorldObstacle = {
  id: string
  position: [number, number, number]
  size: [number, number, number]
  material: CollisionMaterial
  movable?: boolean
  color: string
}

export type Pickup = {
  id: string
  position: [number, number, number]
  type: 'star' | 'repair' | 'part'
}

export type DestructibleProp = {
  id: string
  position: [number, number, number]
  color: string
}

export type VehicleChassisSize = 'compact' | 'standard' | 'large'
export type VehicleMassClass = 'light' | 'balanced' | 'heavy'
export type VehicleEngineTone = 'steady' | 'speedy' | 'heavy'

export type VehiclePowerProfile = {
  acceleration: number
  topSpeed: number
}

export type VehicleHandlingProfile = {
  grip: number
  drift: number
  brake: number
}

export type VehicleCosmetics = {
  bodyColor: string
  accentColor: string
}

export type VehicleSpec = {
  name: string
  chassisSize: VehicleChassisSize
  massClass: VehicleMassClass
  power: VehiclePowerProfile
  handling: VehicleHandlingProfile
  cosmetics: VehicleCosmetics
}

export type SavedVehicleBuild = {
  id: string
  createdAt: string
  spec: VehicleSpec
}

export type VehicleStatScale = {
  min: number
  max: number
  step: number
}

export type VehicleSpecLimits = {
  power: {
    acceleration: VehicleStatScale
    topSpeed: VehicleStatScale
  }
  handling: {
    grip: VehicleStatScale
    drift: VehicleStatScale
    brake: VehicleStatScale
  }
  balanceBudget: number
  maxPositiveBias: number
}

export type VehiclePhysicsTuning = {
  accelMult: number
  topSpeedMult: number
  reverseSpeedMult: number
  steeringMult: number
  gripMult: number
  brakeMult: number
  damageTakenMult: number
  mass: number
  wheelBase: number
  scale: [number, number, number]
  engineTone: VehicleEngineTone
}

export type VehicleSpecEvaluation = {
  balanceScore: number
  budgetUsage: number
  warnings: string[]
}
