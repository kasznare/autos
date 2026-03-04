import type { RigBodySpec, RigColliderSpec, VehicleRigCornerDefinition, VehicleRigDefinition, Vec3Tuple } from '../common/contracts'
import type { VehicleRigColliderPolicy } from './colliderPolicy'

export interface VehicleRigCornerGraphNode {
  axleId: string
  corner: VehicleRigCornerDefinition
  wheelBody: RigBodySpec
  wheelCollider: RigColliderSpec
  knuckleBody?: RigBodySpec
  knuckleCollider?: RigColliderSpec
}

export interface VehicleRigGraphPrimitives {
  chassisBody: RigBodySpec
  chassisCollider: RigColliderSpec
  corners: readonly VehicleRigCornerGraphNode[]
}

const defaultPose = (localAnchor: Vec3Tuple) => ({
  translation: [localAnchor[0], localAnchor[1], localAnchor[2]] as const,
  rotation: [0, 0, 0, 1] as const,
})

export const makeChassisBodyKey = () => 'chassis'

export const makeCornerWheelBodyKey = (axleId: string, cornerId: string) => `axle:${axleId}/corner:${cornerId}/wheel`

export const makeCornerKnuckleBodyKey = (axleId: string, cornerId: string) => `axle:${axleId}/corner:${cornerId}/knuckle`

export const flattenRigCorners = (definition: VehicleRigDefinition) =>
  definition.axles.flatMap((axle) => axle.corners.map((corner) => ({ axleId: axle.id, corner })))

export const createVehicleRigGraphPrimitives = (definition: VehicleRigDefinition, policy: VehicleRigColliderPolicy): VehicleRigGraphPrimitives => {
  const chassisBody: RigBodySpec = {
    key: makeChassisBodyKey(),
    kind: 'chassis',
    mass: definition.chassis.mass,
    linearDamping: definition.chassis.linearDamping,
    angularDamping: definition.chassis.angularDamping,
    pose: {
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
  }

  const chassisCollider: RigColliderSpec = {
    key: 'chassis/collider',
    bodyKey: chassisBody.key,
    shape: {
      type: 'cuboid',
      halfExtents: definition.chassis.collider.halfExtents,
    },
    friction: definition.chassis.collider.friction,
    restitution: definition.chassis.collider.restitution,
    filter: policy.resolveFilter('chassis'),
  }

  const corners = flattenRigCorners(definition).map(({ axleId, corner }) => {
    const wheelBodyKey = makeCornerWheelBodyKey(axleId, corner.id)
    const wheelBody: RigBodySpec = {
      key: wheelBodyKey,
      kind: 'wheel',
      mass: corner.wheelMass,
      linearDamping: 0.05,
      angularDamping: 0.05,
      pose: defaultPose(corner.localAnchor),
    }

    const wheelCollider: RigColliderSpec = {
      key: `${wheelBodyKey}/collider`,
      bodyKey: wheelBodyKey,
      shape: {
        type: 'cylinder',
        halfHeight: corner.wheelWidth * 0.5,
        radius: corner.wheelRadius,
        axis: 'x',
      },
      friction: corner.wheelFriction,
      restitution: corner.wheelRestitution,
      filter: policy.resolveFilter('wheel'),
    }

    const knuckleEnabled = Boolean(corner.knuckle?.enabled)
    const knuckleBodyKey = makeCornerKnuckleBodyKey(axleId, corner.id)

    const knuckleBody = knuckleEnabled
      ? {
          key: knuckleBodyKey,
          kind: 'knuckle' as const,
          mass: corner.knuckle?.mass ?? 8,
          linearDamping: 0.12,
          angularDamping: 0.12,
          pose: defaultPose(corner.localAnchor),
        }
      : undefined

    const knuckleCollider = knuckleEnabled
      ? {
          key: `${knuckleBodyKey}/collider`,
          bodyKey: knuckleBodyKey,
          shape: {
            type: 'cuboid' as const,
            halfExtents: corner.knuckle?.halfExtents ?? ([0.08, 0.08, 0.08] as const),
          },
          friction: 0.4,
          restitution: 0.01,
          filter: policy.resolveFilter('knuckle'),
        }
      : undefined

    return {
      axleId,
      corner,
      wheelBody,
      wheelCollider,
      knuckleBody,
      knuckleCollider,
    }
  })

  return {
    chassisBody,
    chassisCollider,
    corners,
  }
}
