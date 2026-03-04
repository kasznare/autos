import type { RigBodyKind, RigColliderFilter } from '../common/contracts'

export interface VehicleRigColliderPolicy {
  resolveFilter: (kind: RigBodyKind) => RigColliderFilter
  shouldDisablePair: (kindA: RigBodyKind, kindB: RigBodyKind) => boolean
}

export interface VehicleRigColliderPolicyOptions {
  rigMembershipGroup?: number
  environmentFilterMask?: number
}

const DEFAULT_MEMBERSHIP = 0b0001
const DEFAULT_ENVIRONMENT_FILTER = 0b1110

export const createVehicleRigColliderPolicy = (options: VehicleRigColliderPolicyOptions = {}): VehicleRigColliderPolicy => {
  const membership = options.rigMembershipGroup ?? DEFAULT_MEMBERSHIP
  const environmentFilter = options.environmentFilterMask ?? DEFAULT_ENVIRONMENT_FILTER

  return {
    resolveFilter: () => ({
      membership,
      filter: environmentFilter,
      disableInternalContact: true,
    }),
    shouldDisablePair: () => true,
  }
}
