import type { RapierRigidBody } from '@react-three/rapier'
import type { Camera, Group, Vector3 } from 'three'
import { DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DRIVE_SURFACE, JUMP_TUNING, KID_TUNING, MAX_DAMAGE, VEHICLE_PHYSICS } from '../../config'
import { getMaterialTuningAt, getSurfaceMaterialAt, sampleTerrainHeight, type TrackMap } from '../../maps'
import { updateEngineSound } from '../../sfx'
import type { DriveInputState } from '../../keys'
import type { Pickup, VehiclePhysicsTuning } from '../../types'
import type { DriveCommand } from '../../vehicle/drivetrain'
import type { WheelActuationRuntimeSample } from '../../vehicle/integration'
import type { VehiclePhysicsMode } from '../../store/types'
import type { VehicleMotionMode } from '../../store/types'

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
    motionMode?: 'legacy-chassis' | 'native-rig'
    rampContact?: number
    rampCompression?: number
    rampSpringForce?: number
    rampDriveForce?: number
    rampLateralForce?: number
    rampTractionLimit?: number
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
    motionMode?: 'legacy-chassis' | 'native-rig'
    rampContact?: number
    rampCompression?: number
    rampSpringForce?: number
    rampDriveForce?: number
    rampLateralForce?: number
    rampTractionLimit?: number
  }) => void
  onPlayerPosition: (position: [number, number, number]) => void
  addDamage: (amount: number) => void
  triggerHitFx: (strength: number, label?: string) => void
  getImpactLabel: (material: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass', tier: 'minor' | 'moderate' | 'major' | 'critical', scrape?: boolean) => string
  driveCommand?: DriveCommand
  wheelContactPoints?: readonly DynamicsWheelContactPoint[]
  wheelActuationRuntime?: {
    frontContactAuthority: number
    rearContactAuthority: number
    frontSurfaceGrip: number
    rearSurfaceGrip: number
    wheelSamples?: readonly WheelActuationRuntimeSample[]
  }
  physicsMode?: VehiclePhysicsMode
  motionMode?: VehicleMotionMode
  telemetryTimerRef: MutableRef<number>
}

const getDriveTerrainHeight = (map: TrackMap, x: number, z: number) => (map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, z))
const DEFAULT_WHEEL_CONTACT_POINTS: readonly DynamicsWheelContactPoint[] = [
  { x: -0.62, y: -0.12, z: 0.9, axle: 'front', side: 'left' },
  { x: 0.62, y: -0.12, z: 0.9, axle: 'front', side: 'right' },
  { x: -0.62, y: -0.12, z: -0.9, axle: 'rear', side: 'left' },
  { x: 0.62, y: -0.12, z: -0.9, axle: 'rear', side: 'right' },
]
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

const cross = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

const dot = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => a.x * b.x + a.y * b.y + a.z * b.z

const normalize = (
  value: { x: number; y: number; z: number },
  fallback: { x: number; y: number; z: number },
) => {
  const length = Math.hypot(value.x, value.y, value.z)
  if (length <= 1e-5) {
    return fallback
  }
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  }
}

const sampleTerrainNormal = (map: TrackMap, x: number, z: number, sample = 1.2) => {
  if (map.shape === 'ring' || map.terrain.amplitude <= 0) {
    return { x: 0, y: 1, z: 0 }
  }
  const gx0 = getDriveTerrainHeight(map, x - sample, z)
  const gx1 = getDriveTerrainHeight(map, x + sample, z)
  const gz0 = getDriveTerrainHeight(map, x, z - sample)
  const gz1 = getDriveTerrainHeight(map, x, z + sample)
  let nx = gx0 - gx1
  let ny = sample * 2
  let nz = gz0 - gz1
  const length = Math.hypot(nx, ny, nz) || 1
  nx /= length
  ny /= length
  nz /= length
  if (ny < 0) {
    nx *= -1
    ny *= -1
    nz *= -1
  }
  return { x: nx, y: ny, z: nz }
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
  wheelActuationRuntime,
  physicsMode = 'four_wheel',
  motionMode = 'legacy-chassis',
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
  const rampMap = map.sourceId === 'ramp'
  const suspensionRestLength = VEHICLE_PHYSICS.suspensionRideHeight + 0.06
  const wheelContactThreshold = VEHICLE_PHYSICS.suspensionRideHeight + (rampMap ? 0.24 : 0.08)

  const angVel = body.angvel()
  const contactPoints = wheelContactPoints && wheelContactPoints.length > 0 ? wheelContactPoints : DEFAULT_WHEEL_CONTACT_POINTS
  const supportContacts: Array<{
    anchorWorld: { x: number; y: number; z: number }
    normal: { x: number; y: number; z: number }
    compression: number
    pointVel: { x: number; y: number; z: number }
    pointVelAlongNormal: number
    axle: 'front' | 'rear'
    side: 'left' | 'right'
    contactAuthority: number
    surfaceGrip: number
  }> = []
  let totalSupportCompression = 0
  let totalSupportContact = 0
  let groundedWheels = 0
  let frontGroundedWheels = 0
  let frontHeightSamples = 0
  const nativeWheelSamples = motionMode === 'native-rig' ? wheelActuationRuntime?.wheelSamples ?? [] : []

  if (nativeWheelSamples.length > 0) {
    for (const sample of nativeWheelSamples) {
      const offset = {
        x: sample.anchorWorld.x - pos.x,
        y: sample.anchorWorld.y - pos.y,
        z: sample.anchorWorld.z - pos.z,
      }
      const pointVel = {
        x: linVel.x + angVel.y * offset.z - angVel.z * offset.y,
        y: linVel.y + angVel.z * offset.x - angVel.x * offset.z,
        z: linVel.z + angVel.x * offset.y - angVel.y * offset.x,
      }
      if (!rampMap && sample.compression > 0.001) {
        supportContacts.push({
          anchorWorld: sample.anchorWorld,
          normal: sample.normal,
          compression: sample.compression,
          pointVel,
          pointVelAlongNormal: pointVel.x * sample.normal.x + pointVel.y * sample.normal.y + pointVel.z * sample.normal.z,
          axle: sample.axle,
          side: sample.side,
          contactAuthority: sample.contactAuthority,
          surfaceGrip: sample.surfaceGrip,
        })
        totalSupportCompression += sample.compression
        totalSupportContact += sample.contactAuthority
      }
      if (sample.contactAuthority > 0.08) {
        groundedWheels += 1
        if (sample.axle === 'front') {
          frontGroundedWheels += 1
        }
      }
      if (sample.axle === 'front') {
        frontHeightSamples += 1
      }
    }
  } else {
    for (let i = 0; i < contactPoints.length; i += 1) {
      const localPoint = contactPoints[i]
      const offset = rotateByQuat(localPoint, rotation)
      const wheelX = pos.x + offset.x
      const wheelY = pos.y + offset.y
      const wheelZ = pos.z + offset.z
      const groundY = getDriveTerrainHeight(map, wheelX, wheelZ)
      const wheelDistance = wheelY - groundY
      if (!rampMap) {
        const compression = Math.max(0, suspensionRestLength - wheelDistance)
        if (compression > 0) {
          const normal = sampleTerrainNormal(map, wheelX, wheelZ)
          const pointVel = {
            x: linVel.x + angVel.y * offset.z - angVel.z * offset.y,
            y: linVel.y + angVel.z * offset.x - angVel.x * offset.z,
            z: linVel.z + angVel.x * offset.y - angVel.y * offset.x,
          }
          supportContacts.push({
            anchorWorld: { x: wheelX, y: wheelY, z: wheelZ },
            normal,
            compression,
            pointVel,
            pointVelAlongNormal: pointVel.x * normal.x + pointVel.y * normal.y + pointVel.z * normal.z,
            axle: localPoint.axle,
            side: localPoint.side,
            contactAuthority: Math.min(1, compression / 0.1),
            surfaceGrip: 1,
          })
          totalSupportCompression += compression
          totalSupportContact += Math.min(1, compression / 0.1)
        }
      }
      if (wheelDistance <= wheelContactThreshold) {
        groundedWheels += 1
        if (localPoint.axle === 'front') {
          frontGroundedWheels += 1
        }
      }

      if (localPoint.axle === 'front') {
        frontHeightSamples += 1
      }
    }
  }

  const contactRatio = groundedWheels / Math.max(1, contactPoints.length)
  const frontContactRatio = frontGroundedWheels / Math.max(1, frontHeightSamples)
  const frontWheelContactAuthority = wheelActuationRuntime?.frontContactAuthority ?? frontContactRatio
  const rearWheelContactAuthority = wheelActuationRuntime?.rearContactAuthority ?? contactRatio
  const frontWheelSurfaceGrip = wheelActuationRuntime?.frontSurfaceGrip ?? 1
  const rearWheelSurfaceGrip = wheelActuationRuntime?.rearSurfaceGrip ?? 1
  const nativeRigSpringScale = motionMode === 'native-rig' ? 0.96 : 1
  const nativeRigAntiRollScale = motionMode === 'native-rig' ? 1.08 : 1
  const nativeRigAlignScale = motionMode === 'native-rig' ? 0.94 : 1
  const driveBiasFront = driveCommand?.driveBiasFront ?? 0.5
  const driveBiasRear = driveCommand?.driveBiasRear ?? 0.5
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

  if (rampMap && motionMode !== 'native-rig' && physicsMode !== 'four_wheel' && contactPoints.length > 0) {
    const throttleRaw = driveCommand?.throttle ?? Number(input.forward) - Number(input.backward)
    const turnDirection = driveCommand?.steer ?? Number(input.left) - Number(input.right)
    const targetSteerAngle = turnDirection * VEHICLE_PHYSICS.maxSteerRad * vehiclePhysicsTuning.steeringMult
    const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse)
    steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend

    const frontPoints = contactPoints.filter((point) => point.axle === 'front')
    const averagedFrontPoint =
      frontPoints.length > 0
        ? {
            x: frontPoints.reduce((sum, point) => sum + point.x, 0) / frontPoints.length,
            y: frontPoints.reduce((sum, point) => sum + point.y, 0) / frontPoints.length,
            z: frontPoints.reduce((sum, point) => sum + point.z, 0) / frontPoints.length,
          }
        : contactPoints[0]
    const wheelPoint = physicsMode === 'one_wheel' ? contactPoints[0] : averagedFrontPoint
    const anchorOffset = rotateByQuat(wheelPoint, rotation)
    const anchorWorld = {
      x: pos.x + anchorOffset.x,
      y: pos.y + anchorOffset.y,
      z: pos.z + anchorOffset.z,
    }
    const wheelYaw = yaw + steerAngleRef.current
    const wheelForward = { x: Math.sin(wheelYaw), y: 0, z: Math.cos(wheelYaw) }
    const wheelRight = { x: Math.cos(wheelYaw), y: 0, z: -Math.sin(wheelYaw) }
    const terrainY = getDriveTerrainHeight(map, anchorWorld.x, anchorWorld.z)
    const restLength = VEHICLE_PHYSICS.suspensionRideHeight + 0.06
    const suspensionLength = anchorWorld.y - terrainY
    const compression = Math.max(0, restLength - suspensionLength)
    const contact = Math.max(0, Math.min(1, compression / 0.1))
    const mass = Math.max(0.8, body.mass())

    const r = {
      x: anchorWorld.x - pos.x,
      y: anchorWorld.y - pos.y,
      z: anchorWorld.z - pos.z,
    }
    const angCrossR = cross(angVel, r)
    const pointVel = {
      x: linVel.x + angCrossR.x,
      y: linVel.y + angCrossR.y,
      z: linVel.z + angCrossR.z,
    }

    const pointForwardSpeed = pointVel.x * wheelForward.x + pointVel.z * wheelForward.z
    const pointLateralSpeed = pointVel.x * wheelRight.x + pointVel.z * wheelRight.z
    const brake = Math.abs(throttleRaw) < 0.02 ? 0.12 : 0
    const maxForwardSpeed = Math.max(30, surfaceConfig.forwardTopSpeed * vehiclePhysicsTuning.topSpeedMult)
    const maxReverseSpeed = Math.max(10, Math.abs(surfaceConfig.reverseTopSpeed) * vehiclePhysicsTuning.reverseSpeedMult)
    const targetLongSpeed = throttleRaw >= 0 ? throttleRaw * maxForwardSpeed : throttleRaw * maxReverseSpeed
    const speedError = targetLongSpeed - pointForwardSpeed
    const modeDriveGain = physicsMode === 'two_wheel' ? 1.05 : 1

    const springK = 380
    const springD = 54
    const springForce = Math.max(0, springK * compression - springD * pointVel.y) * contact
    const tractionBase = Math.max(600, springForce + mass * 9.81 * 0.45)
    const tractionLimit = tractionBase * surfaceConfig.gripFactor * vehiclePhysicsTuning.gripMult * 1.05
    const rawDriveForce = speedError * mass * 5.4 * modeDriveGain
    const driveForce = Math.max(-tractionLimit, Math.min(tractionLimit, rawDriveForce)) * contact
    const brakeForce = -Math.sign(pointForwardSpeed || 1) * Math.abs(pointForwardSpeed) * brake * mass * 12 * contact
    const rawLateralForce = -pointLateralSpeed * mass * 9.5
    const lateralForce = Math.max(-tractionLimit * 0.9, Math.min(tractionLimit * 0.9, rawLateralForce)) * contact

    const force = {
      x: wheelForward.x * (driveForce + brakeForce) + wheelRight.x * lateralForce,
      y: springForce,
      z: wheelForward.z * (driveForce + brakeForce) + wheelRight.z * lateralForce,
    }
    const impulse = { x: force.x * delta, y: force.y * delta, z: force.z * delta }
    body.applyImpulse(impulse, true)
    const torqueImpulse = cross(r, impulse)
    body.applyTorqueImpulse(torqueImpulse, true)

    const sample = 1.2
    const gx0 = getDriveTerrainHeight(map, anchorWorld.x - sample, anchorWorld.z)
    const gx1 = getDriveTerrainHeight(map, anchorWorld.x + sample, anchorWorld.z)
    const gz0 = getDriveTerrainHeight(map, anchorWorld.x, anchorWorld.z - sample)
    const gz1 = getDriveTerrainHeight(map, anchorWorld.x, anchorWorld.z + sample)
    let nx = gx0 - gx1
    let ny = sample * 2
    let nz = gz0 - gz1
    const nLen = Math.hypot(nx, ny, nz) || 1
    nx /= nLen
    ny /= nLen
    nz /= nLen
    if (ny < 0) {
      nx *= -1
      ny *= -1
      nz *= -1
    }
    let upX = 2 * (rotation.x * rotation.y - rotation.w * rotation.z)
    let upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z)
    let upZ = 2 * (rotation.y * rotation.z + rotation.w * rotation.x)
    const upLen = Math.hypot(upX, upY, upZ) || 1
    upX /= upLen
    upY /= upLen
    upZ /= upLen
    const alignAxis = {
      x: upY * nz - upZ * ny,
      y: upZ * nx - upX * nz,
      z: upX * ny - upY * nx,
    }
    body.applyTorqueImpulse(
      {
        x: (alignAxis.x * 0.14 - angVel.x * 0.2) * contact,
        y: -angVel.y * 0.02,
        z: (alignAxis.z * 0.14 - angVel.z * 0.2) * contact,
      },
      true,
    )

    const postVel = body.linvel()
    const postAng = body.angvel()
    body.setAngvel(
      {
        x: Math.max(-0.9, Math.min(0.9, postAng.x)),
        y: postAng.y * Math.max(0, 1 - delta * 0.6),
        z: Math.max(-0.9, Math.min(0.9, postAng.z)),
      },
      true,
    )

    telemetryTimerRef.current += delta
    if (telemetryTimerRef.current >= 0.1) {
      telemetryTimerRef.current = 0
      const speedKph = Math.abs(postVel.x * forwardX + postVel.z * forwardZ) * 3.6
      setTelemetry(speedKph, (steerAngleRef.current * 180) / Math.PI)
      setPhysicsTelemetry({
        speedKph,
        steeringDeg: (steerAngleRef.current * 180) / Math.PI,
        slipRatio: Math.min(1, Math.abs(pointLateralSpeed) / Math.max(0.1, Math.abs(pointForwardSpeed) + Math.abs(pointLateralSpeed))),
        jumpState,
        jumpCooldownRemaining: jumpCooldownTimerRef.current,
        hardContactCount: hardContactCountRef.current,
        nanGuardTrips: nanGuardTripsRef.current,
        speedClampTrips: speedClampTripsRef.current,
        motionMode: motionMode ?? 'legacy-chassis',
        rampContact: contact,
        rampCompression: compression,
        rampSpringForce: springForce,
        rampDriveForce: driveForce,
        rampLateralForce: lateralForce,
        rampTractionLimit: tractionLimit,
      })
    }

    const engineDirection = pointForwardSpeed > 0.35 ? 'forward' : pointForwardSpeed < -0.35 ? 'reverse' : 'idle'
    updateEngineSound({
      speed: Math.abs(pointForwardSpeed),
      throttle: Math.abs(throttleRaw),
      direction: engineDirection,
      surface: onRoad ? 'road' : 'grass',
      engineLoad: Math.min(1, Math.abs(throttleRaw) * 0.75 + Math.abs(pointLateralSpeed) * 0.12),
      tone: vehiclePhysicsTuning.engineTone,
    })

    onPlayerPosition([pos.x, pos.y, pos.z])
    lastYawRef.current = yaw
    return {
      pos: body.translation(),
      yaw,
      forwardX: Math.sin(yaw),
      forwardZ: Math.cos(yaw),
      nextVx: postVel.x,
      nextVz: postVel.z,
    }
  }

  let avgDriveForce = 0
  let avgLateralForce = 0
  let avgTractionLimit = 0
  let avgSpringForce = 0
  const avgSupportCompression = supportContacts.length > 0 ? totalSupportCompression / supportContacts.length : 0
  const avgSupportContact = supportContacts.length > 0 ? totalSupportContact / supportContacts.length : 0

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
  const effectiveThrottle = throttle > 0 ? throttle * throttleFactor : throttle

  let nextForwardSpeed = forwardSpeed
  if (!Number.isFinite(nextForwardSpeed)) {
    nextForwardSpeed = 0
  }

  const turnDirection = driveCommand?.steer ?? Number(input.left) - Number(input.right)
  const steerSpeedFactor = Math.max(0.22, 1 - Math.abs(nextForwardSpeed) / 12)
  const steerAuthority = 0.38 + steerSpeedFactor * 0.62
  const targetSteerAngle =
    turnDirection *
    VEHICLE_PHYSICS.maxSteerRad *
    steerAuthority *
    steeringScale *
    vehiclePhysicsTuning.steeringMult *
    (frontContactRatio > 0.05 ? Math.max(0.38, frontContactRatio) : 0)
  const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse * (0.78 + steerSpeedFactor * 0.22))
  steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend
  yawRateRef.current = angVel.y
  const nextYaw = yaw + yawRateRef.current * delta
  stuckSteerTimerRef.current = 0
  const supportNormal =
    supportContacts.length > 0
      ? normalize(
          supportContacts.reduce(
            (sum, contact) => ({
              x: sum.x + contact.normal.x,
              y: sum.y + contact.normal.y,
              z: sum.z + contact.normal.z,
            }),
            { x: 0, y: 0, z: 0 },
          ),
          { x: 0, y: 1, z: 0 },
        )
      : { x: 0, y: 1, z: 0 }
  const supportForward = normalize(
    {
      x: forwardX - supportNormal.x * dot({ x: forwardX, y: 0, z: forwardZ }, supportNormal),
      y: -supportNormal.y * dot({ x: forwardX, y: 0, z: forwardZ }, supportNormal),
      z: forwardZ - supportNormal.z * dot({ x: forwardX, y: 0, z: forwardZ }, supportNormal),
    },
    { x: forwardX, y: 0, z: forwardZ },
  )
  const supportRight = normalize(cross(supportNormal, supportForward), { x: rightX, y: 0, z: rightZ })
  const bodyUp = normalize(
    {
      x: 2 * (rotation.x * rotation.y - rotation.w * rotation.z),
      y: 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z),
      z: 2 * (rotation.y * rotation.z + rotation.w * rotation.x),
    },
    { x: 0, y: 1, z: 0 },
  )
  const tiltErrorAxis = cross(bodyUp, supportNormal)
  const pitchRate = dot(angVel, supportRight)
  const rollRate = dot(angVel, supportForward)
  const normalYawRate = dot(angVel, supportNormal)
  const dampingAuthority = grounded ? 1 : Math.max(0, Math.min(1, (contactRatio - 0.1) / 0.35))
  if (dampingAuthority > 0.001) {
    const pitchError = dot(tiltErrorAxis, supportRight)
    const rollError = dot(tiltErrorAxis, supportForward)
    const pitchRollAlign = (0.05 + avgSupportContact * 0.075) * nativeRigAlignScale
    const pitchRollDamping = VEHICLE_PHYSICS.slopeAlignDamping * (0.14 + avgSupportContact * 0.12) * nativeRigAlignScale
    const yawDamping = 0.02 + avgSupportContact * 0.03
    body.applyTorqueImpulse(
      {
        x:
          (supportRight.x * (pitchError * pitchRollAlign - pitchRate * pitchRollDamping) +
            supportForward.x * (rollError * pitchRollAlign - rollRate * pitchRollDamping) -
            supportNormal.x * normalYawRate * yawDamping) *
          dampingAuthority,
        y:
          (supportRight.y * (pitchError * pitchRollAlign - pitchRate * pitchRollDamping) +
            supportForward.y * (rollError * pitchRollAlign - rollRate * pitchRollDamping) -
            supportNormal.y * normalYawRate * yawDamping) *
          dampingAuthority,
        z:
          (supportRight.z * (pitchError * pitchRollAlign - pitchRate * pitchRollDamping) +
            supportForward.z * (rollError * pitchRollAlign - rollRate * pitchRollDamping) -
            supportNormal.z * normalYawRate * yawDamping) *
          dampingAuthority,
      },
      true,
    )
  }
  const maxForwardSpeed = Math.max(rampMap ? 34 : 18, surfaceConfig.forwardTopSpeed * vehiclePhysicsTuning.topSpeedMult)
  const maxReverseSpeed = Math.max(rampMap ? 12 : 6.2, Math.abs(surfaceConfig.reverseTopSpeed) * vehiclePhysicsTuning.reverseSpeedMult * 1.1)
  if (supportContacts.length > 0) {
    const maxSupportImpulse = VEHICLE_PHYSICS.suspensionImpulseClamp * delta
    const frontSupportCount = Math.max(1, supportContacts.filter((contact) => contact.axle === 'front').length)
    const rearSupportCount = Math.max(1, supportContacts.filter((contact) => contact.axle === 'rear').length)
    const supportMassShare = driveMass / Math.max(1, supportContacts.length)
    const antiRollImpulses = new Array(supportContacts.length).fill(0)
    const maxAntiRollImpulse = maxSupportImpulse * 0.65 * nativeRigAntiRollScale

    for (const axle of ['front', 'rear'] as const) {
      const leftIndex = supportContacts.findIndex((contact) => contact.axle === axle && contact.side === 'left')
      const rightIndex = supportContacts.findIndex((contact) => contact.axle === axle && contact.side === 'right')
      if (leftIndex < 0 || rightIndex < 0) {
        continue
      }
      const leftContact = supportContacts[leftIndex]
      const rightContact = supportContacts[rightIndex]
      const compressionDelta = leftContact.compression - rightContact.compression
      const velocityDelta = leftContact.pointVelAlongNormal - rightContact.pointVelAlongNormal
      const antiRollForce =
        compressionDelta * VEHICLE_PHYSICS.antiRollStiffness * nativeRigAntiRollScale -
        velocityDelta * VEHICLE_PHYSICS.antiRollDamping * nativeRigAntiRollScale
      const antiRollImpulse = Math.max(-maxAntiRollImpulse, Math.min(maxAntiRollImpulse, antiRollForce * delta))
      antiRollImpulses[leftIndex] += antiRollImpulse
      antiRollImpulses[rightIndex] -= antiRollImpulse
    }
    let totalDriveForce = 0
    let totalLateralForce = 0
    let totalTractionForce = 0
    let totalSpring = 0

    for (let i = 0; i < supportContacts.length; i += 1) {
      const contact = supportContacts[i]
      const springForce = Math.max(
        0,
        contact.compression * VEHICLE_PHYSICS.suspensionSpring -
          contact.pointVelAlongNormal * VEHICLE_PHYSICS.suspensionDamping,
      ) * nativeRigSpringScale
      const supportImpulseMag = Math.min(maxSupportImpulse, springForce * delta)
      if (supportImpulseMag > 1e-5) {
        body.applyImpulseAtPoint(
          {
            x: contact.normal.x * supportImpulseMag,
            y: contact.normal.y * supportImpulseMag,
            z: contact.normal.z * supportImpulseMag,
          },
          contact.anchorWorld,
          true,
        )
      }
      const antiRollImpulse = antiRollImpulses[i]
      if (Math.abs(antiRollImpulse) > 1e-5) {
        body.applyImpulseAtPoint(
          {
            x: contact.normal.x * antiRollImpulse,
            y: contact.normal.y * antiRollImpulse,
            z: contact.normal.z * antiRollImpulse,
          },
          contact.anchorWorld,
          true,
        )
      }
      totalSpring += springForce

      const wheelYaw = yaw + (contact.axle === 'front' ? steerAngleRef.current : 0)
      const wheelForwardBase = { x: Math.sin(wheelYaw), y: 0, z: Math.cos(wheelYaw) }
      const wheelForward = normalize(
        {
          x: wheelForwardBase.x - contact.normal.x * dot(wheelForwardBase, contact.normal),
          y: wheelForwardBase.y - contact.normal.y * dot(wheelForwardBase, contact.normal),
          z: wheelForwardBase.z - contact.normal.z * dot(wheelForwardBase, contact.normal),
        },
        { x: forwardX, y: 0, z: forwardZ },
      )
      const wheelRight = normalize(cross(contact.normal, wheelForward), { x: rightX, y: 0, z: rightZ })
      const pointForwardSpeed = dot(contact.pointVel, wheelForward)
      const pointLateralSpeed = dot(contact.pointVel, wheelRight)
      const axleContactAuthority = contact.axle === 'front' ? frontWheelContactAuthority : rearWheelContactAuthority
      const axleSurfaceGrip = contact.axle === 'front' ? frontWheelSurfaceGrip : rearWheelSurfaceGrip
      const contactAuthority = motionMode === 'native-rig' ? contact.contactAuthority : axleContactAuthority
      const surfaceGrip = motionMode === 'native-rig' ? contact.surfaceGrip : axleSurfaceGrip
      const contactMassShare =
        contact.axle === 'front'
          ? ((driveMass * driveBiasFront) / frontSupportCount) * contactAuthority
          : ((driveMass * driveBiasRear) / rearSupportCount) * contactAuthority

      let longitudinalImpulse = 0
      if (effectiveThrottle > 0.02 && pointForwardSpeed < maxForwardSpeed) {
        const driveDv = surfaceConfig.forwardAcceleration * vehiclePhysicsTuning.accelMult * effectiveThrottle * delta
        longitudinalImpulse += Math.max(0, Math.min(maxForwardSpeed - pointForwardSpeed, driveDv)) * Math.max(0.18, contactMassShare)
      } else if (effectiveThrottle < -0.02 && pointForwardSpeed > -maxReverseSpeed) {
        const reverseDv = surfaceConfig.reverseAcceleration * vehiclePhysicsTuning.reverseSpeedMult * -effectiveThrottle * delta
        longitudinalImpulse -= Math.max(0, Math.min(pointForwardSpeed + maxReverseSpeed, reverseDv)) * Math.max(0.18, contactMassShare)
      }

      if (Math.abs(effectiveThrottle) <= 0.02) {
        const coastAccel =
          VEHICLE_PHYSICS.engineBrake * (driveCommand?.engineBrakeMult ?? 1) +
          VEHICLE_PHYSICS.rollingResistance +
          Math.abs(pointForwardSpeed) * VEHICLE_PHYSICS.aeroDrag
        const coastDv = Math.min(Math.abs(pointForwardSpeed), coastAccel * delta)
        longitudinalImpulse -= Math.sign(pointForwardSpeed || 1) * coastDv * supportMassShare
      } else if (pointForwardSpeed * effectiveThrottle < -0.05) {
        const brakeAccel = (effectiveThrottle < 0 ? VEHICLE_PHYSICS.reverseBrakeDecel : VEHICLE_PHYSICS.brakeDecel) * vehiclePhysicsTuning.brakeMult
        const brakeDv = Math.min(Math.abs(pointForwardSpeed), brakeAccel * delta)
        longitudinalImpulse -= Math.sign(pointForwardSpeed || 1) * brakeDv * supportMassShare
      }

      const lateralResponse = Math.min(
        1,
        delta *
          (6.8 + Math.abs(pointForwardSpeed) * 0.75) *
          surfaceConfig.gripFactor *
          surfaceGrip *
          gripScale *
          vehiclePhysicsTuning.gripMult,
      )
      let lateralImpulse = -pointLateralSpeed * supportMassShare * lateralResponse
      const loadedSupportImpulse = Math.max(0, supportImpulseMag + antiRollImpulse)
      const tractionLimit =
        loadedSupportImpulse *
        (6.6 + surfaceConfig.gripFactor * 2.4) *
        surfaceGrip *
        gripScale *
        vehiclePhysicsTuning.gripMult
      const tangentialImpulseMag = Math.hypot(longitudinalImpulse, lateralImpulse)
      if (tangentialImpulseMag > tractionLimit && tractionLimit > 1e-5) {
        const tangentialScale = tractionLimit / tangentialImpulseMag
        longitudinalImpulse *= tangentialScale
        lateralImpulse *= tangentialScale
      }

      if (Math.abs(longitudinalImpulse) > 1e-5 || Math.abs(lateralImpulse) > 1e-5) {
        body.applyImpulseAtPoint(
          {
            x: wheelForward.x * longitudinalImpulse + wheelRight.x * lateralImpulse,
            y: wheelForward.y * longitudinalImpulse + wheelRight.y * lateralImpulse,
            z: wheelForward.z * longitudinalImpulse + wheelRight.z * lateralImpulse,
          },
          contact.anchorWorld,
          true,
        )
      }

      totalDriveForce += longitudinalImpulse / Math.max(delta, 1e-5)
      totalLateralForce += lateralImpulse / Math.max(delta, 1e-5)
      totalTractionForce += tractionLimit / Math.max(delta, 1e-5)
    }

    avgDriveForce = totalDriveForce / supportContacts.length
    avgLateralForce = totalLateralForce / supportContacts.length
    avgTractionLimit = totalTractionForce / supportContacts.length
    avgSpringForce = totalSpring / supportContacts.length
  }

  const postDriveVel = body.linvel()
  const maxRampUpVel = Math.max(JUMP_TUNING.maxUpliftSpeed, 6.8)
  if (rampMap && postDriveVel.y > maxRampUpVel) {
    body.setLinvel({ x: postDriveVel.x, y: maxRampUpVel, z: postDriveVel.z }, true)
  }
  if (dampingAuthority > 0.001) {
    const postAng = body.angvel()
    const pitchRate = dot(postAng, supportRight)
    const rollRate = dot(postAng, supportForward)
    const yawRate = dot(postAng, supportNormal)
    const pitchRollRateLimit = grounded ? 0.92 + avgSupportContact * 0.18 : 1.4
    const clampedPitchRate = Math.max(-pitchRollRateLimit, Math.min(pitchRollRateLimit, pitchRate))
    const clampedRollRate = Math.max(-pitchRollRateLimit, Math.min(pitchRollRateLimit, rollRate))
    if (clampedPitchRate !== pitchRate || clampedRollRate !== rollRate) {
      body.setAngvel(
        {
          x: supportRight.x * clampedPitchRate + supportForward.x * clampedRollRate + supportNormal.x * yawRate,
          y: supportRight.y * clampedPitchRate + supportForward.y * clampedRollRate + supportNormal.y * yawRate,
          z: supportRight.z * clampedPitchRate + supportForward.z * clampedRollRate + supportNormal.z * yawRate,
        },
        true,
      )
    }
  }

  const postVel = body.linvel()
  const postForwardSpeed = postVel.x * forwardX + postVel.z * forwardZ
  const postLateralSpeed = postVel.x * rightX + postVel.z * rightZ
  telemetryTimerRef.current += delta
  if (telemetryTimerRef.current >= 0.1) {
    telemetryTimerRef.current = 0
    const speedKph = Math.abs(postForwardSpeed) * 3.6
    setTelemetry(speedKph, (steerAngleRef.current * 180) / Math.PI)
    setPhysicsTelemetry({
      speedKph,
      steeringDeg: (steerAngleRef.current * 180) / Math.PI,
      slipRatio: Math.min(1, Math.abs(postLateralSpeed) / Math.max(0.1, Math.abs(postForwardSpeed) + Math.abs(postLateralSpeed))),
      jumpState,
      jumpCooldownRemaining: jumpCooldownTimerRef.current,
      hardContactCount: hardContactCountRef.current,
      nanGuardTrips: nanGuardTripsRef.current,
      speedClampTrips: speedClampTripsRef.current,
      motionMode: motionMode ?? 'legacy-chassis',
      rampContact: avgSupportContact,
      rampCompression: avgSupportCompression,
      rampSpringForce: avgSpringForce,
      rampDriveForce: avgDriveForce,
      rampLateralForce: avgLateralForce,
      rampTractionLimit: avgTractionLimit,
    })
  }

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

  const engineDirection = postForwardSpeed > 0.35 ? 'forward' : postForwardSpeed < -0.35 ? 'reverse' : 'idle'
  const lateralLoad = Math.min(1, Math.abs(postLateralSpeed) / 2.4)
  const engineLoad = Math.min(1, damageRatio * 0.55 + lateralLoad * 0.35 + (onRoad ? 0 : 0.2))
  updateEngineSound({
    speed: Math.abs(postForwardSpeed),
    throttle: Math.abs(effectiveThrottle),
    direction: engineDirection,
    surface: onRoad ? 'road' : 'grass',
    engineLoad,
    tone: vehiclePhysicsTuning.engineTone,
  })

  const finalPos = body.translation()
  onPlayerPosition([finalPos.x, finalPos.y, finalPos.z])
  lastYawRef.current = nextYaw
  return {
    pos: finalPos,
    yaw: nextYaw,
    forwardX: Math.sin(nextYaw),
    forwardZ: Math.cos(nextYaw),
    nextVx: postVel.x,
    nextVz: postVel.z,
  }
}
