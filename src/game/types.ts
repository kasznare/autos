export const PHYSICS_API_VERSION_V2 = '2.0.0' as const

export type CollisionMaterial = 'soft' | 'medium' | 'hard' | 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'

export type MaterialKeyV2 = 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'

export type ImpactTierV2 = 'minor' | 'moderate' | 'major' | 'critical'

export type PartZoneIdV2 = 'front' | 'rear' | 'left' | 'right'

export type PartDamageStateV2 = 'intact' | 'dented' | 'cracked' | 'detached'

export type VehiclePhysicsProfileIdV2 = 'arcade' | 'heavy' | 'low_grip'

export type MaterialCollisionResponseV2 = {
  key: MaterialKeyV2
  friction: number
  restitution: number
  damageScale: number
  impactSharpness: number
  breakSpeedMps: number
}

export type VehicleSpecV2 = {
  id: string
  profile: VehiclePhysicsProfileIdV2
  massKg: number
  wheelBaseM: number
  maxSteerRad: number
  maxForwardSpeedMps: number
  maxReverseSpeedMps: number
  gripScale: number
  damageTakenScale: number
}

export type ImpactDamageEvaluationInputV2 = {
  vehicleMass: number
  otherMass: number
  planarSpeed: number
  relativePlanarSpeed: number
  relativeSpeed: number
  verticalSpeed: number
  forwardAlignment: number
  armorScale: number
  profileDamageScale: number
  kidDamageScale: number
  localImpactX: number
  localImpactZ: number
  otherBodyName: string
}

export type ImpactDamageEvaluationV2 = {
  material: MaterialKeyV2
  sourceMaterial: CollisionMaterial
  response: MaterialCollisionResponseV2
  tier: ImpactTierV2
  zone: PartZoneIdV2
  energyJoules: number
  impulse: number
  damageDelta: number
  nextPartState: PartDamageStateV2
  skipDamage: boolean
}

export type PhysicsImpactEventV2 = {
  apiVersion: typeof PHYSICS_API_VERSION_V2
  sourceId: string
  sourceMaterial: MaterialKeyV2
  zone: PartZoneIdV2
  tier: ImpactTierV2
  energyJoules: number
  impulse: number
  speedMps: number
}

export type PhysicsDamageAppliedEventV2 = {
  apiVersion: typeof PHYSICS_API_VERSION_V2
  sourceId: string
  zone: PartZoneIdV2
  appliedDamage: number
  totalDamage: number
  tier: ImpactTierV2
}

export type PhysicsPartStateChangedEventV2 = {
  apiVersion: typeof PHYSICS_API_VERSION_V2
  zone: PartZoneIdV2
  previousState: PartDamageStateV2
  nextState: PartDamageStateV2
  zoneDamage: number
}

export type PhysicsVehicleDisabledEventV2 = {
  apiVersion: typeof PHYSICS_API_VERSION_V2
  totalDamage: number
  reason: 'damage_limit'
}

export type PhysicsEventMapV2 = {
  impact: PhysicsImpactEventV2
  damage_applied: PhysicsDamageAppliedEventV2
  part_state_changed: PhysicsPartStateChangedEventV2
  vehicle_disabled: PhysicsVehicleDisabledEventV2
}

export type PhysicsEventNameV2 = keyof PhysicsEventMapV2

export type PhysicsEventPayloadV2<K extends PhysicsEventNameV2> = PhysicsEventMapV2[K]

export type VehicleRealityMetricsV2 = {
  wheelPenetrationM: number
  chassisPenetrationM: number
  wheelHoverGapM: number
  groundedWheelCount: number
  groundedVerticalSpeedMps: number
  supportToWeightRatio: number
}

export type PhysicsDebugTelemetryV2 = {
  apiVersion: typeof PHYSICS_API_VERSION_V2
  speedKph: number
  steeringDeg: number
  slipRatio: number
  jumpState: 'grounded' | 'airborne' | 'cooldown'
  jumpCooldownRemaining: number
  latestImpactImpulse: number
  latestImpactTier: ImpactTierV2
  latestImpactMaterial: MaterialKeyV2
  hardContactCount: number
  nanGuardTrips: number
  speedClampTrips: number
  motionMode: 'legacy-chassis' | 'native-rig'
  driveMode: 'native' | 'fwd' | 'rwd' | 'awd'
  wheelDebugRows: readonly string[]
  rampContact: number
  rampCompression: number
  rampSpringForce: number
  rampDriveForce: number
  rampLateralForce: number
  rampTractionLimit: number
  realityMetrics: VehicleRealityMetricsV2
}

export type WorldObstacle = {
  id: string
  position: [number, number, number]
  size: [number, number, number]
  material: CollisionMaterial
  movable?: boolean
  mass?: number
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
