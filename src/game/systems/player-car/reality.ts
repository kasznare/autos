import type { RapierRigidBody } from '@react-three/rapier'
import { VEHICLE_PHYSICS } from '../../config'
import { sampleTerrainHeight, type TrackMap } from '../../maps'
import type { VehicleMotionMode } from '../../store/types'
import type { VehicleRealityMetricsV2 } from '../../types'
import type { WheelActuationRuntimeSample } from '../../vehicle/integration'
import { NATIVE_RIG_SPRING_SCALE, NATIVE_RIG_SUPPORT_FORCE_SCALE } from './constants'

type Vec3 = { x: number; y: number; z: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const rotateByQuat = (vector: Vec3, rotation: { x: number; y: number; z: number; w: number }): Vec3 => {
  const uvx = rotation.y * vector.z - rotation.z * vector.y
  const uvy = rotation.z * vector.x - rotation.x * vector.z
  const uvz = rotation.x * vector.y - rotation.y * vector.x
  const uuvx = rotation.y * uvz - rotation.z * uvy
  const uuvy = rotation.z * uvx - rotation.x * uvz
  const uuvz = rotation.x * uvy - rotation.y * uvx
  const s = 2 * rotation.w
  return {
    x: vector.x + uvx * s + uuvx * 2,
    y: vector.y + uvy * s + uuvy * 2,
    z: vector.z + uvz * s + uuvz * 2,
  }
}

const getTerrainHeight = (map: TrackMap, x: number, z: number) => (map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, z))

export const createInitialRealityMetricsV2 = (): VehicleRealityMetricsV2 => ({
  wheelPenetrationM: 0,
  chassisPenetrationM: 0,
  wheelHoverGapM: 0,
  groundedWheelCount: 0,
  groundedVerticalSpeedMps: 0,
  supportToWeightRatio: 0,
})

export const getRealityLiftCorrectionM = (
  metrics: VehicleRealityMetricsV2,
  tolerances = {
    wheelPenetrationM: 0.02,
    chassisPenetrationM: 0.003,
  },
) =>
  Math.max(
    0,
    metrics.wheelPenetrationM - tolerances.wheelPenetrationM,
    metrics.chassisPenetrationM - tolerances.chassisPenetrationM,
  )

export const measureRealityMetrics = (params: {
  body: RapierRigidBody
  map: TrackMap
  motionMode: VehicleMotionMode
  wheelBodies: readonly (RapierRigidBody | null)[]
  wheelRadii: readonly number[]
  wheelSamples: readonly WheelActuationRuntimeSample[]
  chassisHalfExtents: readonly [number, number, number]
  chassisOffset: readonly [number, number, number]
}) => {
  const { body, map, motionMode, wheelBodies, wheelRadii, wheelSamples, chassisHalfExtents, chassisOffset } = params
  let wheelPenetrationM = 0
  let wheelHoverGapM = 0
  let groundedWheelCount = 0

  for (let index = 0; index < wheelBodies.length; index += 1) {
    const wheelBody = wheelBodies[index]
    if (!wheelBody) {
      continue
    }
    const wheelPos = wheelBody.translation()
    const terrainY = getTerrainHeight(map, wheelPos.x, wheelPos.z)
    const radius = Math.max(0.12, wheelRadii[index] ?? 0.22)
    const gap = wheelPos.y - radius - terrainY
    wheelPenetrationM = Math.max(wheelPenetrationM, Math.max(0, -gap))
    wheelHoverGapM = Math.max(wheelHoverGapM, Math.max(0, gap))
    if (gap <= 0.045) {
      groundedWheelCount += 1
    }
  }

  const bodyPos = body.translation()
  const bodyRot = body.rotation()
  const [halfX, halfY, halfZ] = chassisHalfExtents
  const bottomY = chassisOffset[1] - halfY
  let chassisPenetrationM = 0
  const chassisCornerLocals: readonly Vec3[] = [
    { x: chassisOffset[0] - halfX, y: bottomY, z: chassisOffset[2] - halfZ },
    { x: chassisOffset[0] - halfX, y: bottomY, z: chassisOffset[2] + halfZ },
    { x: chassisOffset[0] + halfX, y: bottomY, z: chassisOffset[2] - halfZ },
    { x: chassisOffset[0] + halfX, y: bottomY, z: chassisOffset[2] + halfZ },
  ]
  for (const localCorner of chassisCornerLocals) {
    const rotated = rotateByQuat(localCorner, bodyRot)
    const worldX = bodyPos.x + rotated.x
    const worldY = bodyPos.y + rotated.y
    const worldZ = bodyPos.z + rotated.z
    const terrainY = getTerrainHeight(map, worldX, worldZ)
    chassisPenetrationM = Math.max(chassisPenetrationM, Math.max(0, terrainY - worldY))
  }

  const linVel = body.linvel()
  const angVel = body.angvel()
  const springScale = motionMode === 'native-rig' ? NATIVE_RIG_SPRING_SCALE : 1
  const maxSupportForce = VEHICLE_PHYSICS.suspensionImpulseClamp * (motionMode === 'native-rig' ? NATIVE_RIG_SUPPORT_FORCE_SCALE : 1)
  let totalSupportForce = 0
  for (const sample of wheelSamples) {
    if (sample.compression <= 0.0005 || sample.contactAuthority <= 0.08) {
      continue
    }
    const offset = {
      x: sample.anchorWorld.x - bodyPos.x,
      y: sample.anchorWorld.y - bodyPos.y,
      z: sample.anchorWorld.z - bodyPos.z,
    }
    const pointVel = {
      x: linVel.x + angVel.y * offset.z - angVel.z * offset.y,
      y: linVel.y + angVel.z * offset.x - angVel.x * offset.z,
      z: linVel.z + angVel.x * offset.y - angVel.y * offset.x,
    }
    const pointVelAlongNormal = dot(pointVel, sample.normal)
    const springForce = Math.max(
      0,
      sample.compression * VEHICLE_PHYSICS.suspensionSpring - pointVelAlongNormal * VEHICLE_PHYSICS.suspensionDamping,
    )
    totalSupportForce += Math.min(maxSupportForce, springForce * springScale)
  }

  const gravityMagnitude = Math.max(0.001, Math.hypot(...map.gravity))
  const effectiveWeight = Math.max(0.001, body.mass() * gravityMagnitude * Math.max(0, body.gravityScale()))

  return {
    wheelPenetrationM,
    chassisPenetrationM,
    wheelHoverGapM,
    groundedWheelCount,
    groundedVerticalSpeedMps: groundedWheelCount > 0 ? Math.abs(linVel.y) : 0,
    supportToWeightRatio: clamp(totalSupportForce / effectiveWeight, 0, 4),
  } satisfies VehicleRealityMetricsV2
}
