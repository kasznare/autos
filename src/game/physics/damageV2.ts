import type {
  CollisionMaterial,
  ImpactDamageEvaluationInputV2,
  ImpactDamageEvaluationV2,
  ImpactTierV2,
  PartDamageStateV2,
  PartZoneIdV2,
} from '../types'
import { getMaterialResponseV2, normalizeCollisionMaterialV2 } from './materials'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const classifyImpactTier = (energyJoules: number): ImpactTierV2 => {
  if (energyJoules < 240) return 'minor'
  if (energyJoules < 520) return 'moderate'
  if (energyJoules < 980) return 'major'
  return 'critical'
}

const getPartStateForDamage = (zoneDamage: number): PartDamageStateV2 => {
  if (zoneDamage >= 80) return 'detached'
  if (zoneDamage >= 58) return 'cracked'
  if (zoneDamage >= 28) return 'dented'
  return 'intact'
}

const parseCollisionMaterial = (name: string): CollisionMaterial => {
  if (name.startsWith('rock-')) return 'rock'
  if (name.startsWith('metal-') || name.startsWith('hard-')) return 'metal'
  if (name.startsWith('wood-') || name.startsWith('medium-')) return 'wood'
  if (name.startsWith('glass-')) return 'glass'
  return 'rubber'
}

const resolveZone = (localX: number, localZ: number): PartZoneIdV2 => {
  const absX = Math.abs(localX)
  const absZ = Math.abs(localZ)
  if (absZ >= absX) {
    return localZ >= 0 ? 'front' : 'rear'
  }
  return localX >= 0 ? 'right' : 'left'
}

export const evaluateImpactDamageV2 = ({
  vehicleMass,
  otherMass,
  planarSpeed,
  relativePlanarSpeed,
  relativeSpeed,
  verticalSpeed,
  forwardAlignment,
  armorScale,
  profileDamageScale,
  kidDamageScale,
  localImpactX,
  localImpactZ,
  otherBodyName,
}: ImpactDamageEvaluationInputV2): ImpactDamageEvaluationV2 => {
  const sourceMaterial = parseCollisionMaterial(otherBodyName)
  const response = getMaterialResponseV2(sourceMaterial)
  const speed = clamp(Math.max(planarSpeed, relativePlanarSpeed), 0, 50)
  const effectiveOtherMass = Number.isFinite(otherMass) && otherMass > 0 ? otherMass : Math.max(0.8, vehicleMass)
  const reducedMass = (Math.max(0.8, vehicleMass) * effectiveOtherMass) / Math.max(0.001, Math.max(0.8, vehicleMass) + effectiveOtherMass)
  const kineticEnergy = 0.5 * reducedMass * speed * speed
  const verticalFactor = 1 + clamp(verticalSpeed / 8, 0, 0.4)
  const angleFactor = 0.58 + clamp(forwardAlignment, 0, 1) * 0.7
  const energyJoules = kineticEnergy * angleFactor * verticalFactor
  const tier = classifyImpactTier(energyJoules)
  const zone = resolveZone(localImpactX, localImpactZ)

  const baseDamage = Math.max(1, (energyJoules / 100) * response.damageScale)
  const scaledDamage = baseDamage * profileDamageScale * kidDamageScale * armorScale
  const damageDelta = Math.max(0, Math.round(clamp(scaledDamage, 0, 72)))
  const impulse = clamp(Math.max(0, relativeSpeed) * reducedMass * 0.85 * response.impactSharpness, 0, 18)

  return {
    material: normalizeCollisionMaterialV2(sourceMaterial),
    sourceMaterial,
    response,
    tier,
    zone,
    energyJoules,
    impulse,
    damageDelta,
    nextPartState: getPartStateForDamage(damageDelta),
    skipDamage: damageDelta <= 0 || (sourceMaterial === 'rubber' && relativePlanarSpeed < 7.2 && verticalSpeed < 2.4),
  }
}
