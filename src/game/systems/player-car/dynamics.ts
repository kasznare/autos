import type { RapierRigidBody } from '@react-three/rapier'
import type { Camera, Group, Vector3 } from 'three'
import { DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DRIVE_SURFACE, JUMP_TUNING, KID_TUNING, MAX_DAMAGE, VEHICLE_PHYSICS } from '../../config'
import { getMaterialTuningAt, getSurfaceMaterialAt, sampleTerrainHeight, type TrackMap } from '../../maps'
import { updateEngineSound } from '../../sfx'
import type { DriveInputState } from '../../keys'
import type { Pickup, VehiclePhysicsTuning } from '../../types'
import { normalizeAngleDelta } from './helpers'

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
  tempCamPosition.set(
    smoothedPosRef.current.x - smoothedForwardRef.current.x * cameraFollowDistance - nextVx * 0.16,
    smoothedPosRef.current.y + cameraFollowHeight,
    smoothedPosRef.current.z - smoothedForwardRef.current.z * cameraFollowDistance - nextVz * 0.16,
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
}

const getDriveTerrainHeight = (map: TrackMap, x: number, z: number) => (map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, z))
const WHEEL_LOCAL_POINTS = [
  { x: -0.62, y: -0.12, z: 0.9 },
  { x: 0.62, y: -0.12, z: 0.9 },
  { x: -0.62, y: -0.12, z: -0.9 },
  { x: 0.62, y: -0.12, z: -0.9 },
] as const

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
  const accelScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.accelerationLoss
  const speedScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.topSpeedLoss
  const steeringScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.steeringLoss
  const gripScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.gripLoss
  const driveMass = Math.max(0.8, body.mass())

  const angVel = body.angvel()
  let groundedWheels = 0
  let frontHeight = 0
  let rearHeight = 0
  let leftHeight = 0
  let rightHeight = 0

  for (let i = 0; i < WHEEL_LOCAL_POINTS.length; i += 1) {
    const localPoint = WHEEL_LOCAL_POINTS[i]
    const offset = rotateByQuat(localPoint, rotation)
    const wheelX = pos.x + offset.x
    const wheelY = pos.y + offset.y
    const wheelZ = pos.z + offset.z
    const groundY = getDriveTerrainHeight(map, wheelX, wheelZ)
    const wheelDistance = wheelY - groundY
    if (wheelDistance <= VEHICLE_PHYSICS.suspensionRideHeight + 0.08) {
      groundedWheels += 1
    }

    if (i < 2) {
      frontHeight += groundY
    } else {
      rearHeight += groundY
    }
    if (i % 2 === 0) {
      leftHeight += groundY
    } else {
      rightHeight += groundY
    }
  }

  frontHeight *= 0.5
  rearHeight *= 0.5
  leftHeight *= 0.5
  rightHeight *= 0.5
  const contactRatio = groundedWheels / 4
  const grounded = groundedWheels >= 2 && Math.abs(linVel.y) <= VEHICLE_PHYSICS.groundingSpeedThreshold
  const nowSec = performance.now() / 1000
  if (grounded) {
    lastGroundedAtRef.current = nowSec
  }
  const coyoteActive = nowSec - lastGroundedAtRef.current <= JUMP_TUNING.coyoteSec
  const jumpPressed = input.jump && !jumpHeldRef.current
  if (jumpPressed && jumpCooldownTimerRef.current <= 0 && jumpGuardTimerRef.current <= 0 && (grounded || coyoteActive)) {
    const jumpDelta = Math.max(0, JUMP_TUNING.impulse - linVel.y)
    if (jumpDelta > 0.001) {
      body.applyImpulse({ x: 0, y: jumpDelta * driveMass, z: 0 }, true)
    }
    jumpCooldownTimerRef.current = JUMP_TUNING.cooldownSec
    jumpGuardTimerRef.current = JUMP_TUNING.antiSpamGuardSec
  }
  jumpHeldRef.current = input.jump

  const jumpState = grounded ? (jumpCooldownTimerRef.current > 0.001 ? 'cooldown' : 'grounded') : 'airborne'

  const throttle = Number(input.forward) - Number(input.backward)
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
  const effectiveThrottle = throttle * throttleFactor
  const driveContact = contactRatio >= 0.5

  let nextForwardSpeed = forwardSpeed
  const wantsForward = effectiveThrottle > 0.02
  const wantsBackward = effectiveThrottle < -0.02
  const throttleAbs = Math.min(1, Math.abs(effectiveThrottle))
  const driveAccelScale = driveContact ? Math.max(0.22, contactRatio * 0.44) : 0
  const forwardAccel = surfaceConfig.forwardAcceleration * accelScale * vehiclePhysicsTuning.accelMult * driveAccelScale
  const reverseAccel = surfaceConfig.reverseAcceleration * accelScale * vehiclePhysicsTuning.accelMult * 1.25 * driveAccelScale

  if (driveContact && wantsForward && nextForwardSpeed >= -0.15) {
    nextForwardSpeed += throttleAbs * forwardAccel * delta
  } else if (driveContact && wantsBackward && nextForwardSpeed <= 0.15) {
    nextForwardSpeed += effectiveThrottle * reverseAccel * delta
  }

  if (driveContact && wantsBackward && nextForwardSpeed > 0) {
    nextForwardSpeed -= VEHICLE_PHYSICS.brakeDecel * vehiclePhysicsTuning.brakeMult * delta
  } else if (driveContact && wantsForward && nextForwardSpeed < 0) {
    nextForwardSpeed += VEHICLE_PHYSICS.reverseBrakeDecel * vehiclePhysicsTuning.brakeMult * delta
  }

  if (Math.abs(throttle) < 0.02) {
    const brakeDir = Math.sign(nextForwardSpeed)
    nextForwardSpeed -= brakeDir * VEHICLE_PHYSICS.engineBrake * delta
  }

  const speedAbs = Math.abs(nextForwardSpeed)
  const dragForce = (VEHICLE_PHYSICS.rollingResistance * speedAbs + VEHICLE_PHYSICS.aeroDrag * speedAbs * speedAbs) * delta
  nextForwardSpeed -= Math.sign(nextForwardSpeed) * Math.min(speedAbs, dragForce)

  const maxForwardSpeed = surfaceConfig.forwardTopSpeed * speedScale * vehiclePhysicsTuning.topSpeedMult
  const maxReverseSpeed = surfaceConfig.reverseTopSpeed * (0.92 + speedScale * 0.2) * vehiclePhysicsTuning.reverseSpeedMult * 1.2
  nextForwardSpeed = Math.max(maxReverseSpeed, Math.min(maxForwardSpeed, nextForwardSpeed))
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
      (0.16 + contactRatio * 0.84),
  )
  const nextLateralSpeed = lateralSpeed * (1 - gripLerp)

  const turnDirection = Number(input.left) - Number(input.right)
  const speedSteerScale = 1 - Math.min(0.62, Math.abs(nextForwardSpeed) / 16)
  const targetSteerAngle =
    turnDirection *
    VEHICLE_PHYSICS.maxSteerRad *
    (0.55 + speedSteerScale * 0.45) *
    steeringScale *
    vehiclePhysicsTuning.steeringMult *
    (driveContact ? 1 : 0)
  const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse)
  steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend
  const reverseSteer = nextForwardSpeed < -0.15 ? 0.55 : 1
  const targetYawRate =
    ((nextForwardSpeed / (VEHICLE_PHYSICS.wheelBase * vehiclePhysicsTuning.wheelBase)) * Math.tan(steerAngleRef.current) * reverseSteer) /
    Math.max(1, 0.55 + Math.abs(nextForwardSpeed) * 0.06)
  const yawBlend = Math.min(1, delta * 10)
  yawRateRef.current += (targetYawRate - yawRateRef.current) * yawBlend
  let nextYaw = yaw + yawRateRef.current * delta

  const yawDelta = Math.abs(normalizeAngleDelta(nextYaw - lastYawRef.current))
  if (Math.abs(turnDirection) > 0 && Math.abs(nextForwardSpeed) > 2 && yawDelta < 0.0006) {
    stuckSteerTimerRef.current += delta
    if (stuckSteerTimerRef.current > 0.45) {
      nextYaw += turnDirection * 0.015
      yawRateRef.current = targetYawRate * 0.75
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
  const rollDamp = 0.38 + alignBlend * 0.24
  const pitchDamp = 0.38 + alignBlend * 0.24
  const torqueX = alignAxisX * 0.04 - angVel.x * rollDamp
  const torqueY = (yawError * (1.4 + Math.abs(nextForwardSpeed) * 0.2) + yawRateError * 0.62) * (0.2 + alignBlend * 0.8)
  const torqueZ = alignAxisZ * 0.04 - angVel.z * pitchDamp

  body.applyTorqueImpulse(
    {
      x: torqueX,
      y: torqueY,
      z: torqueZ,
    },
    true,
  )
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

  onPlayerPosition([pos.x, pos.y, pos.z])
  lastYawRef.current = nextYaw
  const moveForwardX = Math.sin(nextYaw)
  const moveForwardZ = Math.cos(nextYaw)
  const moveRightX = Math.cos(nextYaw)
  const moveRightZ = -Math.sin(nextYaw)
  const deltaForward = nextForwardSpeed - forwardSpeed
  const deltaLateral = nextLateralSpeed - lateralSpeed
  const tractionFactor = driveContact ? Math.max(0.08, contactRatio * 0.22) : 0
  body.applyImpulse(
    {
      x: (moveForwardX * deltaForward * tractionFactor + moveRightX * deltaLateral * tractionFactor) * driveMass,
      y: 0,
      z: (moveForwardZ * deltaForward * tractionFactor + moveRightZ * deltaLateral * tractionFactor) * driveMass,
    },
    true,
  )
  const downforce = Math.abs(nextForwardSpeed) * (driveContact ? 0.52 : 0.34) * driveMass * delta
  if (downforce > 0.0001) {
    body.applyImpulse({ x: 0, y: -downforce, z: 0 }, true)
  }
  const postDriveVel = body.linvel()
  if (postDriveVel.y > JUMP_TUNING.maxUpliftSpeed) {
    body.setLinvel({ x: postDriveVel.x, y: JUMP_TUNING.maxUpliftSpeed, z: postDriveVel.z }, true)
  }
  const postAng = body.angvel()
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
    throttle: Math.abs(throttle),
    direction: engineDirection,
    surface: onRoad ? 'road' : 'grass',
    engineLoad,
    tone: vehiclePhysicsTuning.engineTone,
  })

  return {
    pos: body.translation(),
    yaw: nextYaw,
    forwardX: moveForwardX,
    forwardZ: moveForwardZ,
    nextVx: postVel.x,
    nextVz: postVel.z,
  }
}
