import type { RapierRigidBody } from '@react-three/rapier'
import { KID_TUNING, MAX_DAMAGE } from '../../config'
import { emitPhysicsEventV2, evaluateImpactDamageV2, normalizeCollisionMaterialV2 } from '../../physics'
import { playCollisionSound } from '../../sfx'
import { PHYSICS_API_VERSION_V2, type PartDamageStateV2, type PartZoneIdV2 } from '../../types'
import { getCollisionMaterial, getImpactLabel, getPartStateForDamage } from './helpers'

type MutableRef<T> = { current: T }

type CollisionEnterParams = {
  body: RapierRigidBody
  otherBodyName: string
  otherPosition?: { x: number; y: number; z: number } | null
  now: number
  damage: number
  armorTimerRef: MutableRef<number>
  vehicleDamageTakenMult: number
  zoneDamageRef: MutableRef<Record<PartZoneIdV2, number>>
  zoneStateRef: MutableRef<Record<PartZoneIdV2, PartDamageStateV2>>
  disabledEmittedRef: MutableRef<boolean>
  hardContactCountRef: MutableRef<number>
  nanGuardTripsRef: MutableRef<number>
  speedClampTripsRef: MutableRef<number>
  shakeStrengthRef: MutableRef<number>
  sparkStrengthRef: MutableRef<number>
  addDamage: (amount: number) => void
  triggerHitFx: (strength: number, label?: string) => void
  setPhysicsTelemetry: (next: {
    latestImpactImpulse?: number
    latestImpactTier?: 'minor' | 'moderate' | 'major' | 'critical'
    latestImpactMaterial?: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'
    hardContactCount?: number
    nanGuardTrips?: number
    speedClampTrips?: number
  }) => void
}

export const handlePlayerCollisionEnter = ({
  body,
  otherBodyName,
  otherPosition,
  now,
  damage,
  armorTimerRef,
  vehicleDamageTakenMult,
  zoneDamageRef,
  zoneStateRef,
  disabledEmittedRef,
  hardContactCountRef,
  nanGuardTripsRef,
  speedClampTripsRef,
  shakeStrengthRef,
  sparkStrengthRef,
  addDamage,
  triggerHitFx,
  setPhysicsTelemetry,
}: CollisionEnterParams) => {
  const velocity = body.linvel()
  const planarSpeed = Math.hypot(velocity.x, velocity.z)
  const rotation = body.rotation()
  const yaw = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  )
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const speed = Math.max(0.001, planarSpeed)
  const velocityDirX = velocity.x / speed
  const velocityDirZ = velocity.z / speed
  const forwardAlignment = Math.abs(velocityDirX * forwardX + velocityDirZ * forwardZ)
  const verticalSpeed = Math.abs(velocity.y)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const selfPos = body.translation()
  const dx = (otherPosition?.x ?? selfPos.x) - selfPos.x
  const dz = (otherPosition?.z ?? selfPos.z) - selfPos.z
  const localImpactX = dx * rightX + dz * rightZ
  const localImpactZ = dx * forwardX + dz * forwardZ

  const impact = evaluateImpactDamageV2({
    vehicleMass: Math.max(0.8, body.mass()),
    planarSpeed,
    verticalSpeed,
    forwardAlignment,
    armorScale: armorTimerRef.current > 0 ? KID_TUNING.armorDamageScale : 1,
    profileDamageScale: vehicleDamageTakenMult,
    kidDamageScale: KID_TUNING.damageTakenScale,
    localImpactX,
    localImpactZ,
    otherBodyName,
  })

  if (impact.material === 'metal' || impact.material === 'rock') {
    hardContactCountRef.current += 1
  }

  emitPhysicsEventV2('impact', {
    apiVersion: PHYSICS_API_VERSION_V2,
    sourceId: otherBodyName || 'unknown',
    sourceMaterial: impact.material,
    zone: impact.zone,
    tier: impact.tier,
    energyJoules: impact.energyJoules,
    impulse: impact.impulse,
    speedMps: planarSpeed,
  })
  setPhysicsTelemetry({
    latestImpactImpulse: impact.impulse,
    latestImpactTier: impact.tier,
    latestImpactMaterial: impact.material,
    hardContactCount: hardContactCountRef.current,
    nanGuardTrips: nanGuardTripsRef.current,
    speedClampTrips: speedClampTripsRef.current,
  })
  if (impact.skipDamage) {
    return
  }

  addDamage(impact.damageDelta)
  const nextTotalDamage = Math.min(MAX_DAMAGE, damage + impact.damageDelta)
  const previousZoneDamage = zoneDamageRef.current[impact.zone]
  const nextZoneDamage = Math.min(100, previousZoneDamage + impact.damageDelta)
  zoneDamageRef.current[impact.zone] = nextZoneDamage
  const previousPartState = zoneStateRef.current[impact.zone]
  const nextPartState = getPartStateForDamage(nextZoneDamage)
  zoneStateRef.current[impact.zone] = nextPartState

  emitPhysicsEventV2('damage_applied', {
    apiVersion: PHYSICS_API_VERSION_V2,
    sourceId: otherBodyName || 'unknown',
    zone: impact.zone,
    appliedDamage: impact.damageDelta,
    totalDamage: nextTotalDamage,
    tier: impact.tier,
  })
  if (previousPartState !== nextPartState) {
    emitPhysicsEventV2('part_state_changed', {
      apiVersion: PHYSICS_API_VERSION_V2,
      zone: impact.zone,
      previousState: previousPartState,
      nextState: nextPartState,
      zoneDamage: nextZoneDamage,
    })
  }
  if (!disabledEmittedRef.current && nextTotalDamage >= MAX_DAMAGE) {
    disabledEmittedRef.current = true
    emitPhysicsEventV2('vehicle_disabled', {
      apiVersion: PHYSICS_API_VERSION_V2,
      totalDamage: nextTotalDamage,
      reason: 'damage_limit',
    })
  }
  playCollisionSound(impact.material === 'metal' || impact.material === 'rock', planarSpeed)
  const hitStrength = Math.min(
    1,
    Math.max(
      0.16,
      planarSpeed / 11 +
        (impact.material === 'metal' || impact.material === 'rock' ? 0.25 : impact.material === 'wood' ? 0.1 : 0),
    ),
  )
  shakeStrengthRef.current = Math.max(shakeStrengthRef.current, hitStrength * 0.45)
  sparkStrengthRef.current = Math.max(sparkStrengthRef.current, hitStrength)
  triggerHitFx(hitStrength, getImpactLabel(impact.material, impact.tier))

  return now
}

type CollisionExitParams = {
  otherName: string
  hardContactCountRef: MutableRef<number>
  nanGuardTripsRef: MutableRef<number>
  speedClampTripsRef: MutableRef<number>
  setPhysicsTelemetry: (next: { hardContactCount?: number; nanGuardTrips?: number; speedClampTrips?: number }) => void
}

export const handlePlayerCollisionExit = ({
  otherName,
  hardContactCountRef,
  nanGuardTripsRef,
  speedClampTripsRef,
  setPhysicsTelemetry,
}: CollisionExitParams) => {
  const material = normalizeCollisionMaterialV2(getCollisionMaterial(otherName))
  if (material === 'metal' || material === 'rock') {
    hardContactCountRef.current = Math.max(0, hardContactCountRef.current - 1)
  }
  setPhysicsTelemetry({
    hardContactCount: hardContactCountRef.current,
    nanGuardTrips: nanGuardTripsRef.current,
    speedClampTrips: speedClampTripsRef.current,
  })
}
