import type { CollisionMaterial, MaterialCollisionResponseV2, MaterialKeyV2 } from '../types'

const MATERIAL_ALIAS: Record<CollisionMaterial, MaterialKeyV2> = {
  soft: 'rubber',
  medium: 'wood',
  hard: 'metal',
  rubber: 'rubber',
  wood: 'wood',
  metal: 'metal',
  rock: 'rock',
  glass: 'glass',
}

export const MATERIAL_RESPONSE_TABLE_V2: Record<MaterialKeyV2, MaterialCollisionResponseV2> = {
  rubber: {
    key: 'rubber',
    friction: 0.9,
    restitution: 0.2,
    damageScale: 0.4,
    impactSharpness: 0.35,
    breakSpeedMps: 8.4,
  },
  wood: {
    key: 'wood',
    friction: 0.75,
    restitution: 0.16,
    damageScale: 0.92,
    impactSharpness: 0.58,
    breakSpeedMps: 6.8,
  },
  metal: {
    key: 'metal',
    friction: 0.62,
    restitution: 0.08,
    damageScale: 1.25,
    impactSharpness: 0.92,
    breakSpeedMps: 5.4,
  },
  rock: {
    key: 'rock',
    friction: 0.88,
    restitution: 0.05,
    damageScale: 1.42,
    impactSharpness: 1,
    breakSpeedMps: 4.9,
  },
  glass: {
    key: 'glass',
    friction: 0.4,
    restitution: 0.24,
    damageScale: 0.74,
    impactSharpness: 0.72,
    breakSpeedMps: 4.4,
  },
}

export const normalizeCollisionMaterialV2 = (material: CollisionMaterial): MaterialKeyV2 => MATERIAL_ALIAS[material]

export const getMaterialResponseV2 = (material: CollisionMaterial): MaterialCollisionResponseV2 => {
  return MATERIAL_RESPONSE_TABLE_V2[normalizeCollisionMaterialV2(material)]
}
