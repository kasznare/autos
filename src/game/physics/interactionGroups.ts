const bitmask = (groups: number | readonly number[]) =>
  [groups].flat().reduce((mask, group) => mask | (1 << group), 0)

export const interactionGroupMask = (
  memberships: number | readonly number[],
  filters?: number | readonly number[],
) => (bitmask(memberships) << 16) + (filters !== undefined ? bitmask(filters) : 0b1111111111111111)

export const PLAYER_COLLISION_GROUP = 0
export const TERRAIN_COLLISION_GROUP = 15

export const PLAYER_COLLISION_MASK = interactionGroupMask(PLAYER_COLLISION_GROUP, PLAYER_COLLISION_GROUP)
export const TERRAIN_COLLISION_MASK = interactionGroupMask(TERRAIN_COLLISION_GROUP)
