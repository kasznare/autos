import type {
  RigBodyKind,
  RigBodySpec,
  RigColliderSpec,
  RigJointSpec,
  VehicleRigCornerHandles,
  VehicleRigDefinition,
  VehicleRigHandles,
  VehicleRigPhysicsAdapter,
  VehicleRigSpawnState,
} from '../common/contracts'
import { createVehicleRigColliderPolicy, type VehicleRigColliderPolicyOptions } from './colliderPolicy'
import {
  createVehicleRigGraphPrimitives,
  makeChassisBodyKey,
  makeCornerKnuckleBodyKey,
  makeCornerWheelBodyKey,
} from './graph'
import { createCornerJointTemplate } from './joints'
import { buildVehicleRigSpawnState, orderedCornerIds, type VehicleRigSpawnOptions } from './spawn'

interface IndexedBodies<TBodyRef> {
  bodyByKey: ReadonlyMap<string, { kind: RigBodyKind; ref: TBodyRef }>
}

const indexBodies = <TBodyRef>(createdBodies: ReadonlyArray<{ spec: RigBodySpec; ref: TBodyRef }>): IndexedBodies<TBodyRef> => {
  const next = new Map<string, { kind: RigBodyKind; ref: TBodyRef }>()
  for (const entry of createdBodies) {
    next.set(entry.spec.key, { kind: entry.spec.kind, ref: entry.ref })
  }
  return { bodyByKey: next }
}

const buildCornerHandles = <TBodyRef, TColliderRef, TJointRef>(params: {
  definition: VehicleRigDefinition
  bodyMap: ReadonlyMap<string, { kind: RigBodyKind; ref: TBodyRef }>
  colliderMap: ReadonlyMap<string, TColliderRef>
  jointMap: ReadonlyMap<string, TJointRef>
}): readonly VehicleRigCornerHandles<TBodyRef, TColliderRef, TJointRef>[] => {
  const corners: VehicleRigCornerHandles<TBodyRef, TColliderRef, TJointRef>[] = []

  for (const axle of params.definition.axles) {
    for (const corner of axle.corners) {
      const wheelBodyKey = makeCornerWheelBodyKey(axle.id, corner.id)
      const knuckleBodyKey = makeCornerKnuckleBodyKey(axle.id, corner.id)
      const wheelColliderKey = `${wheelBodyKey}/collider`
      const knuckleColliderKey = `${knuckleBodyKey}/collider`
      const jointPrefix = `axle:${axle.id}/corner:${corner.id}`

      const wheelBody = params.bodyMap.get(wheelBodyKey)?.ref
      const wheelCollider = params.colliderMap.get(wheelColliderKey)
      const suspensionJoint = params.jointMap.get(`${jointPrefix}/suspension`)
      const wheelSpinJoint = params.jointMap.get(`${jointPrefix}/wheel-spin`)

      if (!wheelBody || !wheelCollider || !suspensionJoint || !wheelSpinJoint) {
        throw new Error(`Vehicle rig corner mapping failed for ${axle.id}/${corner.id}`)
      }

      const knuckleBody = params.bodyMap.get(knuckleBodyKey)?.ref
      const knuckleCollider = params.colliderMap.get(knuckleColliderKey)
      const steeringJoint = params.jointMap.get(`${jointPrefix}/steering`)

      corners.push({
        axleId: axle.id,
        cornerId: corner.id,
        side: corner.side,
        wheelBody,
        wheelCollider,
        knuckleBody,
        knuckleCollider,
        suspensionJoint,
        steeringJoint,
        wheelSpinJoint,
      })
    }
  }

  return corners
}

export interface BuildVehicleRigOptions {
  colliderPolicy?: VehicleRigColliderPolicyOptions
}

export const buildVehicleRig = <TBodyRef, TColliderRef, TJointRef>(
  definition: VehicleRigDefinition,
  adapter: VehicleRigPhysicsAdapter<TBodyRef, TColliderRef, TJointRef>,
  options: BuildVehicleRigOptions = {},
): VehicleRigHandles<TBodyRef, TColliderRef, TJointRef> => {
  const policy = createVehicleRigColliderPolicy(options.colliderPolicy)
  const graph = createVehicleRigGraphPrimitives(definition, policy)

  const createdBodies: Array<{ spec: RigBodySpec; ref: TBodyRef }> = []
  const createdColliders: Array<{ spec: RigColliderSpec; ref: TColliderRef }> = []
  const createdJoints: Array<{ spec: RigJointSpec; ref: TJointRef }> = []

  const chassisBodyRef = adapter.createBody(graph.chassisBody)
  createdBodies.push({ spec: graph.chassisBody, ref: chassisBodyRef })

  const chassisColliderRef = adapter.createCollider(graph.chassisCollider)
  createdColliders.push({ spec: graph.chassisCollider, ref: chassisColliderRef })

  for (const node of graph.corners) {
    const wheelBodyRef = adapter.createBody(node.wheelBody)
    createdBodies.push({ spec: node.wheelBody, ref: wheelBodyRef })

    const wheelColliderRef = adapter.createCollider(node.wheelCollider)
    createdColliders.push({ spec: node.wheelCollider, ref: wheelColliderRef })

    if (node.knuckleBody && node.knuckleCollider) {
      const knuckleBodyRef = adapter.createBody(node.knuckleBody)
      createdBodies.push({ spec: node.knuckleBody, ref: knuckleBodyRef })

      const knuckleColliderRef = adapter.createCollider(node.knuckleCollider)
      createdColliders.push({ spec: node.knuckleCollider, ref: knuckleColliderRef })
    }

    const joints = createCornerJointTemplate({
      axleId: node.axleId,
      corner: node.corner,
      chassisBodyKey: graph.chassisBody.key,
      wheelBodyKey: node.wheelBody.key,
      knuckleBodyKey: node.knuckleBody?.key,
    })

    const suspensionJointRef = adapter.createJoint(joints.suspensionJoint)
    createdJoints.push({ spec: joints.suspensionJoint, ref: suspensionJointRef })

    if (joints.steeringJoint) {
      const steeringJointRef = adapter.createJoint(joints.steeringJoint)
      createdJoints.push({ spec: joints.steeringJoint, ref: steeringJointRef })
    }

    const wheelSpinJointRef = adapter.createJoint(joints.wheelSpinJoint)
    createdJoints.push({ spec: joints.wheelSpinJoint, ref: wheelSpinJointRef })
  }

  const indexed = indexBodies(createdBodies)
  if (adapter.disableBodyPairCollision) {
    const bodyEntries = Array.from(indexed.bodyByKey.values())
    for (let i = 0; i < bodyEntries.length; i += 1) {
      const a = bodyEntries[i]
      for (let j = i + 1; j < bodyEntries.length; j += 1) {
        const b = bodyEntries[j]
        if (policy.shouldDisablePair(a.kind, b.kind)) {
          adapter.disableBodyPairCollision(a.ref, b.ref)
        }
      }
    }
  }

  const colliderMap = new Map(createdColliders.map((entry) => [entry.spec.key, entry.ref]))
  const jointMap = new Map(createdJoints.map((entry) => [entry.spec.key, entry.ref]))

  const chassisBody = indexed.bodyByKey.get(makeChassisBodyKey())?.ref
  if (!chassisBody) {
    throw new Error('Vehicle rig build failed: chassis body not created')
  }

  const corners = buildCornerHandles({
    definition,
    bodyMap: indexed.bodyByKey,
    colliderMap,
    jointMap,
  })

  return {
    definitionId: definition.id,
    chassisBody,
    chassisCollider: chassisColliderRef,
    corners,
  }
}

export interface ResetVehicleRigParams<TBodyRef, TColliderRef, TJointRef> {
  definition: VehicleRigDefinition
  rig: VehicleRigHandles<TBodyRef, TColliderRef, TJointRef>
  adapter: VehicleRigPhysicsAdapter<TBodyRef, TColliderRef, TJointRef>
  spawnState: VehicleRigSpawnState
}

export const resetVehicleRig = <TBodyRef, TColliderRef, TJointRef>({
  definition,
  rig,
  adapter,
  spawnState,
}: ResetVehicleRigParams<TBodyRef, TColliderRef, TJointRef>) => {
  adapter.setBodyPose(rig.chassisBody, spawnState.chassis)
  adapter.zeroBodyMotion(rig.chassisBody)

  const cornerById = new Map(rig.corners.map((corner) => [corner.cornerId, corner]))
  for (const cornerId of orderedCornerIds(definition)) {
    const runtimeCorner = cornerById.get(cornerId)
    const spawnCorner = spawnState.corners[cornerId]
    if (!runtimeCorner || !spawnCorner) {
      continue
    }

    if (runtimeCorner.knuckleBody && spawnCorner.knuckle) {
      adapter.setBodyPose(runtimeCorner.knuckleBody, spawnCorner.knuckle)
      adapter.zeroBodyMotion(runtimeCorner.knuckleBody)
    }

    adapter.setBodyPose(runtimeCorner.wheelBody, spawnCorner.wheel)
    adapter.zeroBodyMotion(runtimeCorner.wheelBody)
  }
}

export interface SpawnVehicleRigParams {
  spawn: VehicleRigSpawnOptions
  build?: BuildVehicleRigOptions
}

export const spawnVehicleRig = <TBodyRef, TColliderRef, TJointRef>(
  definition: VehicleRigDefinition,
  adapter: VehicleRigPhysicsAdapter<TBodyRef, TColliderRef, TJointRef>,
  params: SpawnVehicleRigParams,
) => {
  const rig = buildVehicleRig(definition, adapter, params.build)
  const spawnState = buildVehicleRigSpawnState(definition, params.spawn)
  resetVehicleRig({ definition, rig, adapter, spawnState })
  return {
    rig,
    spawnState,
  }
}
