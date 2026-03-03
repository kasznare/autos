import type { RapierRigidBody } from '@react-three/rapier'
import type { Camera, Group, Vector3 } from 'three'
import { DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DRIVE_SURFACE, KID_TUNING, MAX_DAMAGE, VEHICLE_PHYSICS } from '../../config'
import { getMaterialTuningAt, getSurfaceMaterialAt, type TrackMap } from '../../maps'
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
  nanGuardTripsRef: MutableRef<number>
  speedClampTripsRef: MutableRef<number>
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  setPhysicsTelemetry: (next: {
    speedKph?: number
    steeringDeg?: number
    slipRatio?: number
    hardContactCount?: number
    nanGuardTrips?: number
    speedClampTrips?: number
  }) => void
  onPlayerPosition: (position: [number, number, number]) => void
  addDamage: (amount: number) => void
  triggerHitFx: (strength: number, label?: string) => void
  getImpactLabel: (material: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass', tier: 'minor' | 'moderate' | 'major' | 'critical', scrape?: boolean) => string
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

  let nextForwardSpeed = forwardSpeed
  const wantsForward = effectiveThrottle > 0.02
  const wantsBackward = effectiveThrottle < -0.02
  const throttleAbs = Math.min(1, Math.abs(effectiveThrottle))
  const forwardAccel = surfaceConfig.forwardAcceleration * accelScale * vehiclePhysicsTuning.accelMult
  const reverseAccel = surfaceConfig.reverseAcceleration * accelScale * vehiclePhysicsTuning.accelMult * 1.25

  if (wantsForward && nextForwardSpeed >= -0.15) {
    nextForwardSpeed += throttleAbs * forwardAccel * delta
  } else if (wantsBackward && nextForwardSpeed <= 0.15) {
    nextForwardSpeed += effectiveThrottle * reverseAccel * delta
  }

  if (wantsBackward && nextForwardSpeed > 0) {
    nextForwardSpeed -= VEHICLE_PHYSICS.brakeDecel * vehiclePhysicsTuning.brakeMult * delta
  } else if (wantsForward && nextForwardSpeed < 0) {
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

  const gripLerp = Math.min(
    1,
    delta *
      (6.4 + Math.abs(nextForwardSpeed) * 0.45) *
      gripScale *
      surfaceConfig.gripFactor *
      vehiclePhysicsTuning.gripMult,
  )
  const nextLateralSpeed = lateralSpeed * (1 - gripLerp)

  const turnDirection = Number(input.left) - Number(input.right)
  const speedSteerScale = 1 - Math.min(0.62, Math.abs(nextForwardSpeed) / 16)
  const targetSteerAngle =
    turnDirection *
    VEHICLE_PHYSICS.maxSteerRad *
    (0.55 + speedSteerScale * 0.45) *
    steeringScale *
    vehiclePhysicsTuning.steeringMult
  const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse)
  steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend
  const reverseSteer = nextForwardSpeed < -0.15 ? 0.55 : 1
  const targetYawRate =
    ((nextForwardSpeed / (VEHICLE_PHYSICS.wheelBase * vehiclePhysicsTuning.wheelBase)) * Math.tan(steerAngleRef.current) * reverseSteer) /
    Math.max(1, 0.55 + Math.abs(nextForwardSpeed) * 0.06)
  const yawBlend = Math.min(1, delta * 10)
  yawRateRef.current += (targetYawRate - yawRateRef.current) * yawBlend
  let nextYaw = yaw + yawRateRef.current * delta

  const angVel = body.angvel()
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

  body.applyTorqueImpulse(
    {
      x: -angVel.x * 0.14,
      y: yawError * (1.8 + Math.abs(nextForwardSpeed) * 0.32) + yawRateError * 0.9,
      z: -angVel.z * 0.14,
    },
    true,
  )
  setTelemetry(Math.abs(nextForwardSpeed) * 3.6, (steerAngleRef.current * 180) / Math.PI)
  setPhysicsTelemetry({
    speedKph: Math.abs(nextForwardSpeed) * 3.6,
    steeringDeg: (steerAngleRef.current * 180) / Math.PI,
    slipRatio: Math.min(1, Math.abs(nextLateralSpeed) / Math.max(0.1, Math.abs(nextForwardSpeed) + Math.abs(nextLateralSpeed))),
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
  const driveMass = Math.max(0.8, body.mass())
  body.applyImpulse(
    {
      x: (moveForwardX * deltaForward + moveRightX * deltaLateral) * driveMass,
      y: 0,
      z: (moveForwardZ * deltaForward + moveRightZ * deltaLateral) * driveMass,
    },
    true,
  )

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
