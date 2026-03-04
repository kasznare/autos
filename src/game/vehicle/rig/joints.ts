import type { RigJointSpec, VehicleRigCornerDefinition, Vec3Tuple } from '../common/contracts'

export interface CornerJointTemplateInput {
  axleId: string
  corner: VehicleRigCornerDefinition
  chassisBodyKey: string
  wheelBodyKey: string
  knuckleBodyKey?: string
}

const makeJointAxis = (axis: Vec3Tuple, anchor: Vec3Tuple) => ({
  axis,
  anchorA: anchor,
  anchorB: [0, 0, 0] as const,
})

export interface CornerJointTemplate {
  suspensionJoint: RigJointSpec
  steeringJoint?: RigJointSpec
  wheelSpinJoint: RigJointSpec
}

export const createCornerJointTemplate = ({ axleId, corner, chassisBodyKey, wheelBodyKey, knuckleBodyKey }: CornerJointTemplateInput): CornerJointTemplate => {
  const carrierKey = knuckleBodyKey ?? wheelBodyKey
  const jointPrefix = `axle:${axleId}/corner:${corner.id}`

  const suspensionJoint: RigJointSpec = {
    key: `${jointPrefix}/suspension`,
    kind: 'suspension',
    bodyAKey: chassisBodyKey,
    bodyBKey: carrierKey,
    axis: makeJointAxis([0, 1, 0], corner.localAnchor),
    suspension: {
      restLength: corner.suspension.restLength,
      travel: corner.suspension.travel,
      stiffness: corner.suspension.stiffness,
      damping: corner.suspension.damping,
    },
  }

  const steeringEnabled = Boolean(corner.steering?.enabled)
  const steeringJoint: RigJointSpec | undefined = steeringEnabled
    ? {
        key: `${jointPrefix}/steering`,
        kind: 'steering-axis',
        bodyAKey: chassisBodyKey,
        bodyBKey: carrierKey,
        axis: makeJointAxis(corner.steering?.axis ?? ([0, 1, 0] as const), corner.localAnchor),
        steering: {
          minAngleRad: corner.steering?.minAngleRad ?? 0,
          maxAngleRad: corner.steering?.maxAngleRad ?? 0,
        },
      }
    : undefined

  const wheelSpinJoint: RigJointSpec = {
    key: `${jointPrefix}/wheel-spin`,
    kind: 'wheel-spin',
    bodyAKey: carrierKey,
    bodyBKey: wheelBodyKey,
    axis: makeJointAxis([1, 0, 0], [0, 0, 0]),
    wheelSpin: {
      driveEnabled: true,
      brakeEnabled: true,
    },
  }

  return {
    suspensionJoint,
    steeringJoint,
    wheelSpinJoint,
  }
}
