import type { RapierRigidBody } from '@react-three/rapier'
import type { Camera, Group, Vector3 } from 'three'
import { DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DRIVE_SURFACE, JUMP_TUNING, KID_TUNING, MAX_DAMAGE, VEHICLE_PHYSICS } from '../../config'
import { getMaterialTuningAt, getSurfaceMaterialAt, sampleTerrainHeight, type TrackMap } from '../../maps'
import { updateEngineSound } from '../../sfx'
import type { DriveInputState } from '../../keys'
import type { Pickup, VehiclePhysicsTuning } from '../../types'
import { normalizeAngleDelta } from './helpers'
import type { DriveCommand } from '../../vehicle/drivetrain'

type MutableRef<T> = { current: T }

type TelemetryFns = {
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  setPhysicsTelemetry: (next: {
    speedKph?: number
    steeringDeg?: number
    slipRatio?: number
    jumpState?: 'grounded' | 'airborne' | 'cooldown'
    jumpCooldownRemaining?: number
    hardContactCount?: number
    nanGuardTrips?: number
    speedClampTrips?: number
  }) => void
}

type ResetPoseParams = TelemetryFns & {
  body: RapierRigidBody
  startPosition: { x: number; y: number; z: number }
  startYaw: number
  hardContactCountRef: MutableRef<number>
  nanGuardTripsRef: MutableRef<number>
  speedClampTripsRef: MutableRef<number>
  yawRateRef?: MutableRef<number>
  steerAngleRef?: MutableRef<number>
  lastYawRef?: MutableRef<number>
  stuckSteerTimerRef?: MutableRef<number>
  smoothedPosRef?: MutableRef<Vector3>
  smoothedForwardRef?: MutableRef<Vector3>
  smoothedTargetRef?: MutableRef<Vector3>
  cameraLookAhead?: number
}

export const resetBodyPoseAndTelemetry = ({
  body,
  startPosition,
  startYaw,
  hardContactCountRef,
  nanGuardTripsRef,
  speedClampTripsRef,
  setTelemetry,
  setPhysicsTelemetry,
  yawRateRef,
  steerAngleRef,
  lastYawRef,
  stuckSteerTimerRef,
  smoothedPosRef,
  smoothedForwardRef,
  smoothedTargetRef,
  cameraLookAhead,
}: ResetPoseParams) => {
  body.setTranslation(startPosition, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  body.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)

  if (yawRateRef) yawRateRef.current = 0
  if (steerAngleRef) steerAngleRef.current = 0
  if (lastYawRef) lastYawRef.current = startYaw
  if (stuckSteerTimerRef) stuckSteerTimerRef.current = 0
  if (smoothedPosRef) smoothedPosRef.current.set(startPosition.x, startPosition.y, startPosition.z)
  if (smoothedForwardRef) smoothedForwardRef.current.set(Math.sin(startYaw), 0, Math.cos(startYaw))
  if (smoothedTargetRef && cameraLookAhead !== undefined) {
    smoothedTargetRef.current.set(startPosition.x, startPosition.y + 1.3, startPosition.z + cameraLookAhead)
  }

  setTelemetry(0, 0)
  setPhysicsTelemetry({
    speedKph: 0,
    steeringDeg: 0,
    slipRatio: 0,
    jumpState: 'grounded',
    jumpCooldownRemaining: 0,
    hardContactCount: hardContactCountRef.current,
    nanGuardTrips: nanGuardTripsRef.current,
    speedClampTrips: speedClampTripsRef.current,
  })
}

export const ensureFinitePhysicsState = ({
  body,
  startPosition,
  startYaw,
  hardContactCountRef,
  nanGuardTripsRef,
  speedClampTripsRef,
  setTelemetry,
  setPhysicsTelemetry,
}: ResetPoseParams) => {
  const pos = body.translation()
  const rawLinVel = body.linvel()
  const rawAngVel = body.angvel()
  const isFiniteState =
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z) &&
    Number.isFinite(rawLinVel.x) &&
    Number.isFinite(rawLinVel.y) &&
    Number.isFinite(rawLinVel.z) &&
    Number.isFinite(rawAngVel.x) &&
    Number.isFinite(rawAngVel.y) &&
    Number.isFinite(rawAngVel.z)
  if (!isFiniteState) {
    nanGuardTripsRef.current += 1
    resetBodyPoseAndTelemetry({
      body,
      startPosition,
      startYaw,
      hardContactCountRef,
      nanGuardTripsRef,
      speedClampTripsRef,
      setTelemetry,
      setPhysicsTelemetry,
    })
    return false
  }
  return true
}

export const clampExcessMotion = (body: RapierRigidBody, speedClampTripsRef: MutableRef<number>) => {
  const rawLinVel = body.linvel()
  const rawAngVel = body.angvel()
  const planarSpeedBeforeClamp = Math.hypot(rawLinVel.x, rawLinVel.z)
  if (planarSpeedBeforeClamp > 52) {
    speedClampTripsRef.current += 1
    const clampScale = 52 / planarSpeedBeforeClamp
    body.setLinvel({ x: rawLinVel.x * clampScale, y: rawLinVel.y, z: rawLinVel.z * clampScale }, true)
  }
  const angularMag = Math.hypot(rawAngVel.x, rawAngVel.y, rawAngVel.z)
  if (angularMag > 16) {
    const clampScale = 16 / angularMag
    body.setAngvel({ x: rawAngVel.x * clampScale, y: rawAngVel.y * clampScale, z: rawAngVel.z * clampScale }, true)
  }
}

export type DynamicsWheelContactPoint = {
  x: number
  y: number
  z: number
  axle: 'front' | 'rear'
  side: 'left' | 'right'
}

type CameraVisualParams = {
  delta: number
  nowSec: number
  damage: number
  yaw: number
  forwardX: number
  forwardZ: number
  pos: { x: number; y: number; z: number }
  nextVx: number
  nextVz: number
  camera: Camera
  tempBodyPos: Vector3
  tempVec: Vector3
  tempCamTarget: Vector3
  tempCamPosition: Vector3
  smoothedPosRef: MutableRef<Vector3>
  smoothedForwardRef: MutableRef<Vector3>
  smoothedTargetRef: MutableRef<Vector3>
  shakeStrengthRef: MutableRef<number>
  sparkStrengthRef: MutableRef<number>
  hitSparkRef: MutableRef<Group | null>
  bumperRef: MutableRef<Group | null>
  loosePanelRef: MutableRef<Group | null>
  hoodRef: MutableRef<Group | null>
  roofRef: MutableRef<Group | null>
  leftDoorRef: MutableRef<Group | null>
  rightDoorRef: MutableRef<Group | null>
  cameraFollowDistance: number
  cameraFollowHeight: number
  cameraLookAhead: number
  orbitYawRad?: number
  orbitPitchRad?: number
}

export const updateCameraAndDamageVisuals = ({
  delta,
  nowSec,
  damage,
  yaw,
  forwardX,
  forwardZ,
  pos,
  nextVx,
  nextVz,
  camera,
  tempBodyPos,
  tempVec,
  tempCamTarget,
  tempCamPosition,
  smoothedPosRef,
  smoothedForwardRef,
  smoothedTargetRef,
  shakeStrengthRef,
  sparkStrengthRef,
  hitSparkRef,
  bumperRef,
  loosePanelRef,
  hoodRef,
  roofRef,
  leftDoorRef,
  rightDoorRef,
  cameraFollowDistance,
  cameraFollowHeight,
  cameraLookAhead,
  orbitYawRad = 0,
  orbitPitchRad = 0,
}: CameraVisualParams) => {
  const camPosSmoothing = 1 - Math.exp(-delta * 9)
  const camForwardSmoothing = 1 - Math.exp(-delta * 12)
  const camTargetSmoothing = 1 - Math.exp(-delta * 11)

  tempBodyPos.set(pos.x, pos.y, pos.z)
  smoothedPosRef.current.lerp(tempBodyPos, camPosSmoothing)
  tempVec.set(forwardX, 0, forwardZ)
  if (tempVec.lengthSq() < 0.0001) {
    tempVec.set(Math.sin(yaw), 0, Math.cos(yaw))
  }
  smoothedForwardRef.current.lerp(tempVec, camForwardSmoothing).normalize()

  tempCamTarget.set(
    smoothedPosRef.current.x + smoothedForwardRef.current.x * cameraLookAhead,
    smoothedPosRef.current.y + 1.3,
    smoothedPosRef.current.z + smoothedForwardRef.current.z * cameraLookAhead,
  )
  smoothedTargetRef.current.lerp(tempCamTarget, camTargetSmoothing)
  const followYaw = Math.atan2(smoothedForwardRef.current.x, smoothedForwardRef.current.z) + orbitYawRad
  const orbitDirX = Math.sin(followYaw)
  const orbitDirZ = Math.cos(followYaw)
  const pitch = Math.max(-0.18, Math.min(0.92, orbitPitchRad))
  const horizontalDist = cameraFollowDistance * Math.max(0.45, Math.cos(pitch))
  const verticalOffset = cameraFollowHeight + Math.sin(pitch) * (cameraFollowDistance * 0.85)
  tempCamPosition.set(
    smoothedPosRef.current.x - orbitDirX * horizontalDist - nextVx * 0.16,
    smoothedPosRef.current.y + verticalOffset,
    smoothedPosRef.current.z - orbitDirZ * horizontalDist - nextVz * 0.16,
  )

  shakeStrengthRef.current *= Math.max(0, 1 - delta * 7.5)
  sparkStrengthRef.current *= Math.max(0, 1 - delta * 5.2)
  const shake = shakeStrengthRef.current
  if (shake > 0.002) {
    tempCamPosition.x += (Math.random() - 0.5) * shake
    tempCamPosition.y += (Math.random() - 0.5) * shake * 0.6
    tempCamPosition.z += (Math.random() - 0.5) * shake
  }
  if (hitSparkRef.current) {
    const spark = sparkStrengthRef.current
    hitSparkRef.current.visible = spark > 0.08
    hitSparkRef.current.scale.setScalar(0.7 + spark * 0.7)
  }
  if (bumperRef.current) {
    const bend = Math.max(0, (damage - 58) / 42)
    const targetRotX = -0.03 - bend * 0.3
    const targetPosY = 0.03 - bend * 0.09
    bumperRef.current.rotation.x += (targetRotX - bumperRef.current.rotation.x) * Math.min(1, delta * 7)
    bumperRef.current.position.y += (targetPosY - bumperRef.current.position.y) * Math.min(1, delta * 7)
  }
  if (hoodRef.current) {
    const d = Math.max(0, (damage - 40) / 60)
    hoodRef.current.rotation.x += (-0.08 - d * 0.38 - hoodRef.current.rotation.x) * Math.min(1, delta * 6.5)
    hoodRef.current.position.y += (0.52 - d * 0.05 - hoodRef.current.position.y) * Math.min(1, delta * 6.5)
  }
  if (roofRef.current) {
    const d = Math.max(0, (damage - 55) / 45)
    const targetScaleY = 1 - d * 0.14
    roofRef.current.scale.y += (targetScaleY - roofRef.current.scale.y) * Math.min(1, delta * 5)
    roofRef.current.rotation.z += (Math.sin(nowSec * 1.8) * d * 0.04 - roofRef.current.rotation.z) * Math.min(1, delta * 3)
  }
  if (leftDoorRef.current) {
    const d = Math.max(0, (damage - 65) / 35)
    leftDoorRef.current.rotation.z += (0.04 + d * 0.11 - leftDoorRef.current.rotation.z) * Math.min(1, delta * 5)
  }
  if (rightDoorRef.current) {
    const d = Math.max(0, (damage - 62) / 38)
    rightDoorRef.current.rotation.z += (-0.04 - d * 0.12 - rightDoorRef.current.rotation.z) * Math.min(1, delta * 5)
  }
  if (loosePanelRef.current) {
    const isLoose = damage >= 82
    loosePanelRef.current.visible = isLoose
    if (isLoose) {
      const wobble = 0.08 + ((damage - 82) / 18) * 0.08
      loosePanelRef.current.rotation.z = Math.sin(nowSec * 15) * wobble
      loosePanelRef.current.rotation.y = Math.cos(nowSec * 9) * wobble * 0.5
    }
  }
  camera.position.lerp(tempCamPosition, camPosSmoothing)
  camera.lookAt(smoothedTargetRef.current)
}

type PickupParams = {
  pickups: Pickup[]
  tempVec: Vector3
  tempBodyPos: Vector3
  armorTimerRef: MutableRef<number>
  addScore: (amount: number) => void
  repair: (amount: number) => void
  triggerHitFx: (strength: number, label?: string) => void
  playPickupSound: (type: Pickup['type']) => void
  onCollectPickup: (pickupId: string) => void
}

export const processNearbyPickups = ({
  pickups,
  tempVec,
  tempBodyPos,
  armorTimerRef,
  addScore,
  repair,
  triggerHitFx,
  playPickupSound,
  onCollectPickup,
}: PickupParams) => {
  pickups.forEach((pickup) => {
    tempVec.set(pickup.position[0], pickup.position[1], pickup.position[2])
    const distance = tempVec.distanceTo(tempBodyPos)
    if (distance > 1.5) {
      return
    }

    if (pickup.type === 'star') {
      addScore(10)
    } else if (pickup.type === 'repair') {
      repair(28)
    } else {
      repair(12)
      addScore(4)
      armorTimerRef.current = Math.max(armorTimerRef.current, KID_TUNING.armorDurationSec)
      triggerHitFx(0.24, 'Spare parts shield')
    }
    playPickupSound(pickup.type)
    onCollectPickup(pickup.id)
  })
}

type DynamicsParams = {
  body: RapierRigidBody
  delta: number
  damage: number
  map: TrackMap
  input: DriveInputState
  vehiclePhysicsTuning: VehiclePhysicsTuning
  armorTimerRef: MutableRef<number>
  sputterTimerRef: MutableRef<number>
  sputterActiveRef: MutableRef<boolean>
  steerAngleRef: MutableRef<number>
  yawRateRef: MutableRef<number>
  lastYawRef: MutableRef<number>
  stuckSteerTimerRef: MutableRef<number>
  hardContactCountRef: MutableRef<number>
  scrapeDamageTimerRef: MutableRef<number>
  jumpCooldownTimerRef: MutableRef<number>
  jumpGuardTimerRef: MutableRef<number>
  jumpHeldRef: MutableRef<boolean>
  lastGroundedAtRef: MutableRef<number>
  nanGuardTripsRef: MutableRef<number>
  speedClampTripsRef: MutableRef<number>
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  setPhysicsTelemetry: (next: {
    speedKph?: number
    steeringDeg?: number
    slipRatio?: number
    jumpState?: 'grounded' | 'airborne' | 'cooldown'
    jumpCooldownRemaining?: number
    hardContactCount?: number
    nanGuardTrips?: number
    speedClampTrips?: number
  }) => void
  onPlayerPosition: (position: [number, number, number]) => void
  addDamage: (amount: number) => void
  triggerHitFx: (strength: number, label?: string) => void
  getImpactLabel: (material: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass', tier: 'minor' | 'moderate' | 'major' | 'critical', scrape?: boolean) => string
  driveCommand?: DriveCommand
  wheelContactPoints?: readonly DynamicsWheelContactPoint[]
  telemetryTimerRef: MutableRef<number>
}

const getDriveTerrainHeight = (map: TrackMap, x: number, z: number) => (map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, z))
const DEFAULT_WHEEL_CONTACT_POINTS: readonly DynamicsWheelContactPoint[] = [
  { x: -0.62, y: -0.12, z: 0.9, axle: 'front', side: 'left' },
  { x: 0.62, y: -0.12, z: 0.9, axle: 'front', side: 'right' },
  { x: -0.62, y: -0.12, z: -0.9, axle: 'rear', side: 'left' },
  { x: 0.62, y: -0.12, z: -0.9, axle: 'rear', side: 'right' },
]
const DRIVE_ANTI_LIFT = {
  minContactRatio: 0.16,
  upVelClamp: 0.02,
  downBiasImpulse: 0.28,
}
const SAFETY_LOCK = {
  disableJump: true,
}

const rotateByQuat = (
  v: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
) => {
  const uvx = q.y * v.z - q.z * v.y
  const uvy = q.z * v.x - q.x * v.z
  const uvz = q.x * v.y - q.y * v.x
  const uuvx = q.y * uvz - q.z * uvy
  const uuvy = q.z * uvx - q.x * uvz
  const uuvz = q.x * uvy - q.y * uvx
  const s = 2 * q.w
  return {
    x: v.x + uvx * s + uuvx * 2,
    y: v.y + uvy * s + uuvy * 2,
    z: v.z + uvz * s + uuvz * 2,
  }
}

export const runVehicleDynamicsStep = ({
  body,
  delta,
  damage,
  map,
  input,
  vehiclePhysicsTuning,
  armorTimerRef,
  sputterTimerRef,
  sputterActiveRef,
  steerAngleRef,
  yawRateRef,
  lastYawRef,
  stuckSteerTimerRef,
  hardContactCountRef,
  scrapeDamageTimerRef,
  jumpCooldownTimerRef,
  jumpGuardTimerRef,
  jumpHeldRef,
  lastGroundedAtRef,
  nanGuardTripsRef,
  speedClampTripsRef,
  setTelemetry,
  setPhysicsTelemetry,
  onPlayerPosition,
  addDamage,
  triggerHitFx,
  getImpactLabel,
  driveCommand,
  wheelContactPoints,
  telemetryTimerRef,
}: DynamicsParams) => {
  const pos = body.translation()
  const linVel = body.linvel()
  armorTimerRef.current = Math.max(0, armorTimerRef.current - delta)
  jumpCooldownTimerRef.current = Math.max(0, jumpCooldownTimerRef.current - delta)
  jumpGuardTimerRef.current = Math.max(0, jumpGuardTimerRef.current - delta)
  const armorActive = armorTimerRef.current > 0
  const rotation = body.rotation()
  const yaw = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  )
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const forwardSpeed = linVel.x * forwardX + linVel.z * forwardZ
  const lateralSpeed = linVel.x * rightX + linVel.z * rightZ
  const surfaceMaterial = getSurfaceMaterialAt(map, pos.x, pos.z)
  const materialTuning = getMaterialTuningAt(map, pos.x, pos.z)
  const onRoad = surfaceMaterial === 'asphalt' || surfaceMaterial === 'basalt' || surfaceMaterial === 'regolith'
  const baseSurface = onRoad ? DRIVE_SURFACE.road : DRIVE_SURFACE.grass
  const surfaceConfig = {
    ...baseSurface,
    gripFactor: baseSurface.gripFactor * materialTuning.tractionMultiplier,
    forwardTopSpeed: baseSurface.forwardTopSpeed * materialTuning.topSpeedMultiplier,
    reverseTopSpeed: baseSurface.reverseTopSpeed * materialTuning.topSpeedMultiplier,
    forwardAcceleration: baseSurface.forwardAcceleration / materialTuning.dragMultiplier,
    reverseAcceleration: baseSurface.reverseAcceleration / materialTuning.dragMultiplier,
  }
  const damageRatio = Math.min(1, damage / MAX_DAMAGE)
  const steeringScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.steeringLoss
  const gripScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.gripLoss
  const driveMass = Math.max(0.8, body.mass())

  const angVel = body.angvel()
  const contactPoints = wheelContactPoints && wheelContactPoints.length > 0 ? wheelContactPoints : DEFAULT_WHEEL_CONTACT_POINTS
  let groundedWheels = 0
  let frontGroundedWheels = 0
  let rearGroundedWheels = 0
  let frontHeight = 0
  let frontHeightSamples = 0
  let rearHeight = 0
  let rearHeightSamples = 0
  let leftHeight = 0
  let leftHeightSamples = 0
  let rightHeight = 0
  let rightHeightSamples = 0

  for (let i = 0; i < contactPoints.length; i += 1) {
    const localPoint = contactPoints[i]
    const offset = rotateByQuat(localPoint, rotation)
    const wheelX = pos.x + offset.x
    const wheelY = pos.y + offset.y
    const wheelZ = pos.z + offset.z
    const groundY = getDriveTerrainHeight(map, wheelX, wheelZ)
    const wheelDistance = wheelY - groundY
    if (wheelDistance <= VEHICLE_PHYSICS.suspensionRideHeight + 0.08) {
      groundedWheels += 1
      if (localPoint.axle === 'front') {
        frontGroundedWheels += 1
      } else {
        rearGroundedWheels += 1
      }
    }

    if (localPoint.axle === 'front') {
      frontHeight += groundY
      frontHeightSamples += 1
    } else {
      rearHeight += groundY
      rearHeightSamples += 1
    }
    if (localPoint.side === 'left') {
      leftHeight += groundY
      leftHeightSamples += 1
    } else {
      rightHeight += groundY
      rightHeightSamples += 1
    }
  }

  frontHeight = frontHeightSamples > 0 ? frontHeight / frontHeightSamples : frontHeight
  rearHeight = rearHeightSamples > 0 ? rearHeight / rearHeightSamples : rearHeight
  leftHeight = leftHeightSamples > 0 ? leftHeight / leftHeightSamples : leftHeight
  rightHeight = rightHeightSamples > 0 ? rightHeight / rightHeightSamples : rightHeight
  const contactRatio = groundedWheels / Math.max(1, contactPoints.length)
  const frontContactRatio = frontGroundedWheels / Math.max(1, frontHeightSamples)
  const rearContactRatio = rearGroundedWheels / Math.max(1, rearHeightSamples)
  const driveBiasFront = driveCommand?.driveBiasFront ?? 0.5
  const driveBiasRear = driveCommand?.driveBiasRear ?? 0.5
  const driveContactRatio = frontContactRatio * driveBiasFront + rearContactRatio * driveBiasRear
  const grounded = groundedWheels >= 2 && Math.abs(linVel.y) <= VEHICLE_PHYSICS.groundingSpeedThreshold
  const nowSec = performance.now() / 1000
  if (grounded) {
    lastGroundedAtRef.current = nowSec
  }
  const coyoteActive = nowSec - lastGroundedAtRef.current <= JUMP_TUNING.coyoteSec
  const jumpPressed = input.jump && !jumpHeldRef.current
  if (!SAFETY_LOCK.disableJump && jumpPressed && jumpCooldownTimerRef.current <= 0 && jumpGuardTimerRef.current <= 0 && (grounded || coyoteActive)) {
    const jumpDelta = Math.max(0, JUMP_TUNING.impulse - linVel.y)
    if (jumpDelta > 0.001) {
      body.applyImpulse({ x: 0, y: jumpDelta * driveMass, z: 0 }, true)
    }
    jumpCooldownTimerRef.current = JUMP_TUNING.cooldownSec
    jumpGuardTimerRef.current = JUMP_TUNING.antiSpamGuardSec
  }
  jumpHeldRef.current = input.jump

  const jumpState = grounded ? (jumpCooldownTimerRef.current > 0.001 ? 'cooldown' : 'grounded') : 'airborne'

  const throttle = driveCommand?.throttle ?? Number(input.forward) - Number(input.backward)
  const criticalDamage = damage >= DAMAGE_DRIVE_EFFECTS.criticalThreshold
  if (criticalDamage) {
    sputterTimerRef.current -= delta
    if (sputterTimerRef.current <= 0) {
      sputterTimerRef.current = DAMAGE_SPUTTER.minInterval + Math.random() * DAMAGE_SPUTTER.variableInterval
      sputterActiveRef.current = Math.random() < DAMAGE_SPUTTER.chance
    }
  } else {
    sputterActiveRef.current = false
    sputterTimerRef.current = 0
  }
  const throttleFactor = sputterActiveRef.current && throttle > 0 ? DAMAGE_SPUTTER.throttleFactor : 1
  const driveContact = driveContactRatio >= 0.24

  let nextForwardSpeed = forwardSpeed
  if (!Number.isFinite(nextForwardSpeed)) {
    nextForwardSpeed = 0
  }

  const gripLerp = Math.min(
    1,
    delta *
      (6.4 + Math.abs(nextForwardSpeed) * 0.45) *
      gripScale *
      surfaceConfig.gripFactor *
      vehiclePhysicsTuning.gripMult *
      (1 + (driveCommand ? (driveCommand.driveBiasFront - driveCommand.driveBiasRear) * 0.05 : 0)) *
      (0.16 + contactRatio * 0.84),
  )
  const nextLateralSpeed = lateralSpeed * (1 - gripLerp)

  const turnDirection = driveCommand?.steer ?? Number(input.left) - Number(input.right)
  const throttleForSteer = throttle * throttleFactor
  const steerBaseSpeed =
    Math.abs(nextForwardSpeed) > 0.5
      ? nextForwardSpeed
      : Math.abs(throttleForSteer) > 0.05
        ? Math.sign(throttleForSteer || 1) * 1.8
        : nextForwardSpeed
  const speedSteerScale = 1 - Math.min(0.62, Math.abs(nextForwardSpeed) / 16)
  const targetSteerAngle =
    turnDirection *
    VEHICLE_PHYSICS.maxSteerRad *
    (0.78 + speedSteerScale * 0.46) *
    steeringScale *
    vehiclePhysicsTuning.steeringMult *
    (frontContactRatio > 0.05 ? Math.max(0.38, frontContactRatio) : 0)
  const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse)
  steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend
  const reverseSteer = nextForwardSpeed < -0.15 ? 0.55 : 1
  const targetYawRate =
    ((steerBaseSpeed / (VEHICLE_PHYSICS.wheelBase * vehiclePhysicsTuning.wheelBase)) * Math.tan(steerAngleRef.current) * reverseSteer) /
    Math.max(1, 0.55 + Math.abs(nextForwardSpeed) * 0.06)
  const yawBlend = Math.min(1, delta * 10)
  yawRateRef.current += (targetYawRate - yawRateRef.current) * yawBlend
  let nextYaw = yaw + yawRateRef.current * delta

  const yawDelta = Math.abs(normalizeAngleDelta(nextYaw - lastYawRef.current))
  if (Math.abs(turnDirection) > 0 && Math.abs(nextForwardSpeed) > 2 && yawDelta < 0.0006) {
    stuckSteerTimerRef.current += delta
    if (stuckSteerTimerRef.current > 0.45) {
      nextYaw += turnDirection * 0.006
      yawRateRef.current = targetYawRate * 0.42
      stuckSteerTimerRef.current = 0
    }
  } else {
    stuckSteerTimerRef.current = Math.max(0, stuckSteerTimerRef.current - delta * 2)
  }
  const yawError = normalizeAngleDelta(nextYaw - yaw)
  const yawRateError = targetYawRate - angVel.y
  const normalSampleOffset = 1.24
  let nx = leftHeight - rightHeight
  let ny = normalSampleOffset * 2
  let nz = rearHeight - frontHeight
  const nMag = Math.hypot(nx, ny, nz) || 1
  nx /= nMag
  ny /= nMag
  nz /= nMag
  if (ny < 0) {
    nx *= -1
    ny *= -1
    nz *= -1
  }
  let upX = 2 * (rotation.x * rotation.y - rotation.w * rotation.z)
  let upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z)
  let upZ = 2 * (rotation.y * rotation.z + rotation.w * rotation.x)
  const upMag = Math.hypot(upX, upY, upZ) || 1
  upX /= upMag
  upY /= upMag
  upZ /= upMag
  const alignAxisX = upY * nz - upZ * ny
  const alignAxisZ = upX * ny - upY * nx
  const alignBlend = Math.max(0, Math.min(1, contactRatio))
  const rollDamp = 1.05 + alignBlend * 0.5
  const pitchDamp = 1.05 + alignBlend * 0.5
  const torqueX = alignAxisX * 0.02 - angVel.x * rollDamp
  const torqueY = (yawError * (0.42 + Math.abs(nextForwardSpeed) * 0.06) + yawRateError * 0.24) * (0.08 + alignBlend * 0.36)
  const torqueZ = alignAxisZ * 0.02 - angVel.z * pitchDamp

  const torqueControlAuthority = grounded ? 1 : Math.max(0, Math.min(1, (contactRatio - 0.12) / 0.4))
  if (torqueControlAuthority > 0.001) {
    body.applyTorqueImpulse(
      {
        x: torqueX * torqueControlAuthority,
        y: torqueY * torqueControlAuthority,
        z: torqueZ * torqueControlAuthority,
      },
      true,
    )
  } else {
    // In air / no-contact, only damp angular velocity; do not inject control torque.
    body.setAngvel(
      {
        x: angVel.x * Math.max(0, 1 - delta * 4.2),
        y: angVel.y * Math.max(0, 1 - delta * 2.4),
        z: angVel.z * Math.max(0, 1 - delta * 4.2),
      },
      true,
    )
  }
  telemetryTimerRef.current += delta
  if (telemetryTimerRef.current >= 0.1) {
    telemetryTimerRef.current = 0
    setTelemetry(Math.abs(nextForwardSpeed) * 3.6, (steerAngleRef.current * 180) / Math.PI)
    setPhysicsTelemetry({
      speedKph: Math.abs(nextForwardSpeed) * 3.6,
      steeringDeg: (steerAngleRef.current * 180) / Math.PI,
      slipRatio: Math.min(1, Math.abs(nextLateralSpeed) / Math.max(0.1, Math.abs(nextForwardSpeed) + Math.abs(nextLateralSpeed))),
      jumpState,
      jumpCooldownRemaining: jumpCooldownTimerRef.current,
      hardContactCount: hardContactCountRef.current,
      nanGuardTrips: nanGuardTripsRef.current,
      speedClampTrips: speedClampTripsRef.current,
    })
  }

  onPlayerPosition([pos.x, pos.y, pos.z])
  lastYawRef.current = nextYaw
  const throttleEffective = throttleForSteer
  const moveForwardX = Math.sin(nextYaw)
  const moveForwardZ = Math.cos(nextYaw)
  const maxForwardSpeed = Math.max(18, surfaceConfig.forwardTopSpeed * vehiclePhysicsTuning.topSpeedMult)
  const maxReverseSpeed = Math.max(6.2, Math.abs(surfaceConfig.reverseTopSpeed) * vehiclePhysicsTuning.reverseSpeedMult * 1.1)
  const propulsionContact = (grounded || coyoteActive || contactRatio >= 0.2) && Math.abs(linVel.y) <= 1.2
  if (propulsionContact && Math.abs(throttleEffective) > 0.02) {
    const assistTargetSpeed = throttleEffective > 0 ? throttleEffective * maxForwardSpeed : throttleEffective * maxReverseSpeed
    const speedError = assistTargetSpeed - forwardSpeed
    const assistTraction = Math.max(0.23, Math.min(1, contactRatio * 0.9))
    const assistDv = Math.max(-4.6, Math.min(4.6, speedError)) * Math.min(1, delta * 4.3) * assistTraction
    const launchBoost =
      Math.abs(forwardSpeed) < 2.6
        ? throttleEffective * driveMass * Math.min(1, delta * 6.4) * assistTraction * 0.18
        : 0
    const forwardAssistImpulse = assistDv * driveMass * 0.55 + launchBoost
    body.applyImpulse(
      {
        x: moveForwardX * forwardAssistImpulse,
        y: 0,
        z: moveForwardZ * forwardAssistImpulse,
      },
      true,
    )
    if (Math.abs(turnDirection) > 0.03) {
      const yawAssist = turnDirection * Math.min(0.12, 0.045 + Math.abs(forwardSpeed) * 0.008) * Math.min(1, delta * 5)
      body.applyTorqueImpulse({ x: 0, y: yawAssist, z: 0 }, true)
    }
  }
  const downforce = Math.abs(nextForwardSpeed) * (driveContact ? 0.6 : 0.38) * driveMass * delta
  if (downforce > 0.0001) {
    body.applyImpulse({ x: 0, y: -downforce, z: 0 }, true)
  }
  const postDriveVel = body.linvel()
  const noJump = SAFETY_LOCK.disableJump || !input.jump
  if (postDriveVel.y > 0) {
    body.setLinvel({ x: postDriveVel.x, y: 0, z: postDriveVel.z }, true)
  }
  const throttleAbs = Math.abs(throttle * throttleFactor)
  const antiLiftActive = throttleAbs > 0.05 && !input.jump && contactRatio >= DRIVE_ANTI_LIFT.minContactRatio
  if (antiLiftActive && postDriveVel.y > DRIVE_ANTI_LIFT.upVelClamp) {
    body.setLinvel(
      {
        x: postDriveVel.x,
        y: DRIVE_ANTI_LIFT.upVelClamp,
        z: postDriveVel.z,
      },
      true,
    )
    body.applyImpulse({ x: 0, y: -driveMass * DRIVE_ANTI_LIFT.downBiasImpulse * delta, z: 0 }, true)
  }
  if (postDriveVel.y > JUMP_TUNING.maxUpliftSpeed) {
    body.setLinvel({ x: postDriveVel.x, y: JUMP_TUNING.maxUpliftSpeed, z: postDriveVel.z }, true)
  }
  let postAng = body.angvel()
  if (noJump) {
    body.setAngvel(
      {
        x: 0,
        y: postAng.y,
        z: 0,
      },
      true,
    )
    postAng = body.angvel()
  }
  if (noJump && contactRatio < 0.15) {
    body.setAngvel(
      {
        x: 0,
        y: postAng.y * Math.max(0, 1 - delta * 1.8),
        z: 0,
      },
      true,
    )
    postAng = body.angvel()
  }
  const clampedAngX = Math.max(-3.2, Math.min(3.2, postAng.x))
  const clampedAngZ = Math.max(-3.2, Math.min(3.2, postAng.z))
  if (clampedAngX !== postAng.x || clampedAngZ !== postAng.z) {
    body.setAngvel({ x: clampedAngX, y: postAng.y, z: clampedAngZ }, true)
  }

  const postVel = body.linvel()
  if (hardContactCountRef.current > 0 && Math.abs(nextForwardSpeed) > 2) {
    scrapeDamageTimerRef.current += delta
    if (scrapeDamageTimerRef.current >= 0.72) {
      scrapeDamageTimerRef.current = 0
      const scrapeDamage = Math.round(
        vehiclePhysicsTuning.damageTakenMult *
          KID_TUNING.damageTakenScale *
          (armorActive ? KID_TUNING.armorDamageScale : 1),
      )
      if (scrapeDamage > 0) {
        addDamage(scrapeDamage)
        triggerHitFx(0.2, getImpactLabel('metal', 'minor', true))
      }
    }
  } else {
    scrapeDamageTimerRef.current = 0
  }

  const engineDirection = nextForwardSpeed > 0.35 ? 'forward' : nextForwardSpeed < -0.35 ? 'reverse' : 'idle'
  const lateralLoad = Math.min(1, Math.abs(nextLateralSpeed) / 2.4)
  const engineLoad = Math.min(1, damageRatio * 0.55 + lateralLoad * 0.35 + (onRoad ? 0 : 0.2))
  updateEngineSound({
    speed: Math.abs(nextForwardSpeed),
    throttle: Math.abs(throttle * throttleFactor),
    direction: engineDirection,
    surface: onRoad ? 'road' : 'grass',
    engineLoad,
    tone: vehiclePhysicsTuning.engineTone,
  })

  return {
    pos: body.translation(),
    yaw: nextYaw,
    forwardX: Math.sin(nextYaw),
    forwardZ: Math.cos(nextYaw),
    nextVx: postVel.x,
    nextVz: postVel.z,
  }
}
