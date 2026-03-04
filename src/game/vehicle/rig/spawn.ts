import type { RigidBodyPose, VehicleRigDefinition, VehicleRigSpawnState, Vec3Tuple } from '../common/contracts'

const quatMultiply = (a: readonly [number, number, number, number], b: readonly [number, number, number, number]) => {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ] as const
}

const quatConjugate = (q: readonly [number, number, number, number]) => [-q[0], -q[1], -q[2], q[3]] as const

const rotateVecByQuat = (vec: Vec3Tuple, quat: readonly [number, number, number, number]) => {
  const vecQuat = [vec[0], vec[1], vec[2], 0] as const
  const rotated = quatMultiply(quatMultiply(quat, vecQuat), quatConjugate(quat))
  return [rotated[0], rotated[1], rotated[2]] as const
}

const addVec3 = (a: Vec3Tuple, b: Vec3Tuple) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as const

const angleAxisToQuat = (axis: Vec3Tuple, angleRad: number) => {
  const half = angleRad * 0.5
  const s = Math.sin(half)
  const norm = Math.hypot(axis[0], axis[1], axis[2]) || 1
  return [(axis[0] / norm) * s, (axis[1] / norm) * s, (axis[2] / norm) * s, Math.cos(half)] as const
}

export interface VehicleRigSpawnOptions {
  chassisPose: RigidBodyPose
  steerAngleByCornerId?: Readonly<Record<string, number>>
  wheelSpinByCornerId?: Readonly<Record<string, number>>
}

export const buildVehicleRigSpawnState = (definition: VehicleRigDefinition, options: VehicleRigSpawnOptions): VehicleRigSpawnState => {
  const steerByCorner = options.steerAngleByCornerId ?? {}
  const spinByCorner = options.wheelSpinByCornerId ?? {}

  const corners: Record<string, { wheel: RigidBodyPose; knuckle?: RigidBodyPose }> = {}
  for (const axle of definition.axles) {
    for (const corner of axle.corners) {
      const worldCornerPos = addVec3(
        options.chassisPose.translation,
        rotateVecByQuat(corner.localAnchor, options.chassisPose.rotation),
      )

      const steerQuat = angleAxisToQuat(corner.steering?.axis ?? ([0, 1, 0] as const), steerByCorner[corner.id] ?? 0)
      const spinQuat = angleAxisToQuat([1, 0, 0], spinByCorner[corner.id] ?? 0)
      const knuckleRotation = quatMultiply(options.chassisPose.rotation, steerQuat)
      const wheelRotation = quatMultiply(knuckleRotation, spinQuat)

      corners[corner.id] = {
        wheel: {
          translation: worldCornerPos,
          rotation: wheelRotation,
        },
        knuckle: corner.knuckle?.enabled
          ? {
              translation: worldCornerPos,
              rotation: knuckleRotation,
            }
          : undefined,
      }
    }
  }

  return {
    chassis: options.chassisPose,
    corners,
  }
}

export const orderedCornerIds = (definition: VehicleRigDefinition): readonly string[] =>
  definition.axles
    .flatMap((axle) => axle.corners.map((corner) => corner.id))
    .slice()
    .sort((a, b) => a.localeCompare(b))
