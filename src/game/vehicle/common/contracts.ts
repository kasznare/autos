export type Vec3Tuple = readonly [number, number, number]
export type QuatTuple = readonly [number, number, number, number]

export type RigBodyKind = 'chassis' | 'knuckle' | 'wheel'
export type RigJointKind = 'suspension' | 'steering-axis' | 'wheel-spin'
export type RigCornerSide = 'left' | 'right'

export type RigBodyKey = string
export type RigColliderKey = string
export type RigJointKey = string

export interface RigidBodyPose {
  translation: Vec3Tuple
  rotation: QuatTuple
}

export interface RigBodySpec {
  key: RigBodyKey
  kind: RigBodyKind
  mass: number
  linearDamping: number
  angularDamping: number
  pose: RigidBodyPose
}

export type RigColliderShape =
  | {
      type: 'cuboid'
      halfExtents: Vec3Tuple
    }
  | {
      type: 'cylinder'
      halfHeight: number
      radius: number
      axis: 'x' | 'y' | 'z'
    }

export interface RigColliderFilter {
  membership: number
  filter: number
  disableInternalContact: boolean
}

export interface RigColliderSpec {
  key: RigColliderKey
  bodyKey: RigBodyKey
  shape: RigColliderShape
  friction: number
  restitution: number
  filter: RigColliderFilter
}

export interface RigJointAxis {
  axis: Vec3Tuple
  anchorA: Vec3Tuple
  anchorB: Vec3Tuple
}

export interface SuspensionJointParams {
  restLength: number
  travel: number
  stiffness: number
  damping: number
}

export interface SteeringJointParams {
  minAngleRad: number
  maxAngleRad: number
}

export interface WheelSpinJointParams {
  driveEnabled: boolean
  brakeEnabled: boolean
}

export interface RigJointSpec {
  key: RigJointKey
  kind: RigJointKind
  bodyAKey: RigBodyKey
  bodyBKey: RigBodyKey
  axis: RigJointAxis
  suspension?: SuspensionJointParams
  steering?: SteeringJointParams
  wheelSpin?: WheelSpinJointParams
}

export interface VehicleRigCornerDefinition {
  id: string
  side: RigCornerSide
  localAnchor: Vec3Tuple
  wheelRadius: number
  wheelWidth: number
  wheelMass: number
  wheelFriction: number
  wheelRestitution: number
  suspension: SuspensionJointParams
  steering?: {
    enabled: boolean
    axis: Vec3Tuple
    minAngleRad: number
    maxAngleRad: number
  }
  knuckle?: {
    enabled: boolean
    mass: number
    halfExtents: Vec3Tuple
  }
}

export interface VehicleRigAxleDefinition {
  id: string
  corners: readonly VehicleRigCornerDefinition[]
}

export interface VehicleRigChassisDefinition {
  mass: number
  linearDamping: number
  angularDamping: number
  collider: {
    halfExtents: Vec3Tuple
    friction: number
    restitution: number
  }
}

export interface VehicleRigDefinition {
  id: string
  chassis: VehicleRigChassisDefinition
  axles: readonly VehicleRigAxleDefinition[]
}

export interface VehicleRigCornerHandles<TBodyRef, TColliderRef, TJointRef> {
  axleId: string
  cornerId: string
  side: RigCornerSide
  wheelBody: TBodyRef
  wheelCollider: TColliderRef
  knuckleBody?: TBodyRef
  knuckleCollider?: TColliderRef
  suspensionJoint: TJointRef
  steeringJoint?: TJointRef
  wheelSpinJoint: TJointRef
}

export interface VehicleRigHandles<TBodyRef, TColliderRef, TJointRef> {
  definitionId: string
  chassisBody: TBodyRef
  chassisCollider: TColliderRef
  corners: readonly VehicleRigCornerHandles<TBodyRef, TColliderRef, TJointRef>[]
}

export interface VehicleRigPhysicsAdapter<TBodyRef, TColliderRef, TJointRef> {
  createBody: (spec: RigBodySpec) => TBodyRef
  createCollider: (spec: RigColliderSpec) => TColliderRef
  createJoint: (spec: RigJointSpec) => TJointRef
  disableBodyPairCollision?: (bodyA: TBodyRef, bodyB: TBodyRef) => void
  setBodyPose: (body: TBodyRef, pose: RigidBodyPose) => void
  zeroBodyMotion: (body: TBodyRef) => void
}

export interface VehicleRigSpawnState {
  chassis: RigidBodyPose
  corners: Readonly<Record<string, { wheel: RigidBodyPose; knuckle?: RigidBodyPose }>>
}
