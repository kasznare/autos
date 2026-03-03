import { Color } from 'three'
import { MAX_DAMAGE } from '../../config'
import type { CollisionMaterial, ImpactTierV2, MaterialKeyV2, PartDamageStateV2 } from '../../types'

const tempColor = new Color()
const warningColor = new Color('#9d291f')

export const normalizeAngleDelta = (angle: number) => {
  const twoPi = Math.PI * 2
  let out = angle % twoPi
  if (out > Math.PI) out -= twoPi
  if (out < -Math.PI) out += twoPi
  return out
}

export const getCarPalette = (baseHex: string, accentHex: string, damage: number) => {
  const t = Math.min(1, Math.max(0, damage / MAX_DAMAGE))
  const body = tempColor.set(baseHex).clone().lerp(warningColor, t * 0.65)
  const accent = tempColor.set(accentHex).clone().lerp(new Color('#f2f2f2'), 0.35 - t * 0.2)
  return {
    body: `#${body.getHexString()}`,
    accent: `#${accent.getHexString()}`,
  }
}

export const getCollisionMaterial = (name: string): CollisionMaterial => {
  if (name.startsWith('rock-')) return 'rock'
  if (name.startsWith('metal-') || name.startsWith('hard-')) return 'metal'
  if (name.startsWith('wood-') || name.startsWith('medium-')) return 'wood'
  if (name.startsWith('glass-')) return 'glass'
  if (name.startsWith('rubber-') || name.startsWith('soft-')) return 'rubber'
  return 'rubber'
}

export const getImpactLabel = (material: MaterialKeyV2, tier: ImpactTierV2, scrape = false) => {
  if (scrape) {
    return 'Side scrape'
  }
  if (material === 'rubber') {
    return 'Soft bump'
  }
  if (material === 'wood') {
    return tier === 'major' || tier === 'critical' ? 'Crate hit' : 'Light hit'
  }
  return tier === 'critical' || tier === 'major' ? 'Big crash' : 'Hard hit'
}

export const getPartStateForDamage = (zoneDamage: number): PartDamageStateV2 => {
  if (zoneDamage >= 80) return 'detached'
  if (zoneDamage >= 58) return 'cracked'
  if (zoneDamage >= 28) return 'dented'
  return 'intact'
}

