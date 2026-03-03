import { CAR_COLOR_OPTIONS, VEHICLE_SPEC_LIMITS } from '../config'
import type { VehiclePhysicsTuning, VehicleSpec, VehicleSpecEvaluation, VehicleSpecLimits, VehicleStatScale } from '../types'

const NEUTRAL_STAT = 50
const MAX_NAME_LENGTH = 28
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

const clamp = (value: number, scale: VehicleStatScale) => {
  const clamped = Math.min(scale.max, Math.max(scale.min, value))
  const stepped = Math.round(clamped / scale.step) * scale.step
  return Math.min(scale.max, Math.max(scale.min, stepped))
}

const sanitizeColor = (color: string, fallback: string) => {
  if (!HEX_COLOR_RE.test(color)) {
    return fallback
  }
  return color.toLowerCase()
}

const sanitizeName = (name: string) => {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'Custom Build'
  }
  return normalized.slice(0, MAX_NAME_LENGTH)
}

const enforceBalanceBudget = (values: number[], budget: number) => {
  const positives = values.map((value) => Math.max(0, value - NEUTRAL_STAT))
  let positiveTotal = positives.reduce((sum, value) => sum + value, 0)

  if (positiveTotal <= budget) {
    return values
  }

  const adjusted = [...values]
  while (positiveTotal > budget + 0.001) {
    const over = positiveTotal - budget
    const adjustable = adjusted
      .map((value, index) => ({ index, positive: Math.max(0, value - NEUTRAL_STAT) }))
      .filter((entry) => entry.positive > 0)
    if (adjustable.length === 0) {
      break
    }
    const adjustableTotal = adjustable.reduce((sum, entry) => sum + entry.positive, 0)
    for (const entry of adjustable) {
      const reduction = Math.max(0.2, (entry.positive / adjustableTotal) * over)
      adjusted[entry.index] = Math.max(NEUTRAL_STAT, adjusted[entry.index] - reduction)
    }
    positiveTotal = adjusted.reduce((sum, value) => sum + Math.max(0, value - NEUTRAL_STAT), 0)
  }

  return adjusted.map((value) => Math.round(value))
}

export const sanitizeVehicleSpec = (rawSpec: VehicleSpec, limits: VehicleSpecLimits = VEHICLE_SPEC_LIMITS): VehicleSpec => {
  const bodyFallback = CAR_COLOR_OPTIONS[0]
  const accentFallback = '#f2f6ff'

  const chassisSize =
    rawSpec.chassisSize === 'compact' || rawSpec.chassisSize === 'standard' || rawSpec.chassisSize === 'large'
      ? rawSpec.chassisSize
      : 'standard'
  const massClass =
    rawSpec.massClass === 'light' || rawSpec.massClass === 'balanced' || rawSpec.massClass === 'heavy'
      ? rawSpec.massClass
      : 'balanced'

  const statOrder = [
    clamp(rawSpec.power.acceleration, limits.power.acceleration),
    clamp(rawSpec.power.topSpeed, limits.power.topSpeed),
    clamp(rawSpec.handling.grip, limits.handling.grip),
    clamp(rawSpec.handling.drift, limits.handling.drift),
    clamp(rawSpec.handling.brake, limits.handling.brake),
  ].map((value) => Math.min(NEUTRAL_STAT + limits.maxPositiveBias, value))

  const [acceleration, topSpeed, grip, drift, brake] = enforceBalanceBudget(statOrder, limits.balanceBudget)

  return {
    name: sanitizeName(rawSpec.name),
    chassisSize,
    massClass,
    power: {
      acceleration: clamp(acceleration, limits.power.acceleration),
      topSpeed: clamp(topSpeed, limits.power.topSpeed),
    },
    handling: {
      grip: clamp(grip, limits.handling.grip),
      drift: clamp(drift, limits.handling.drift),
      brake: clamp(brake, limits.handling.brake),
    },
    cosmetics: {
      bodyColor: sanitizeColor(rawSpec.cosmetics.bodyColor, bodyFallback),
      accentColor: sanitizeColor(rawSpec.cosmetics.accentColor, accentFallback),
    },
  }
}

export const evaluateVehicleSpec = (vehicleSpec: VehicleSpec, limits: VehicleSpecLimits = VEHICLE_SPEC_LIMITS): VehicleSpecEvaluation => {
  const deltas = [
    vehicleSpec.power.acceleration - NEUTRAL_STAT,
    vehicleSpec.power.topSpeed - NEUTRAL_STAT,
    vehicleSpec.handling.grip - NEUTRAL_STAT,
    vehicleSpec.handling.drift - NEUTRAL_STAT,
    vehicleSpec.handling.brake - NEUTRAL_STAT,
  ]
  const budgetUsage = deltas.filter((value) => value > 0).reduce((sum, value) => sum + value, 0)
  const warnings: string[] = []

  if (budgetUsage > limits.balanceBudget - 3) {
    warnings.push('Performance budget near cap. Raise one trait by lowering another.')
  }
  if (vehicleSpec.handling.drift > 66 && vehicleSpec.handling.grip > 62) {
    warnings.push('High drift with high grip is constrained to preserve handling fairness.')
  }
  if (vehicleSpec.power.topSpeed > 72 && vehicleSpec.handling.brake < 40) {
    warnings.push('High top speed with weak brakes increases stopping distance.')
  }

  const handlingBalance = vehicleSpec.handling.grip - vehicleSpec.handling.drift * 0.35 + vehicleSpec.handling.brake * 0.25
  const speedBalance = vehicleSpec.power.acceleration * 0.6 + vehicleSpec.power.topSpeed * 0.7
  const balanceScore = Math.round(Math.max(0, Math.min(100, speedBalance * 0.5 + handlingBalance * 0.5)))

  return {
    budgetUsage: Math.round(budgetUsage),
    balanceScore,
    warnings,
  }
}

export const toVehiclePhysicsTuning = (vehicleSpec: VehicleSpec): VehiclePhysicsTuning => {
  const chassisScaleBySize = {
    compact: 0.92,
    standard: 1,
    large: 1.1,
  } as const
  const wheelBaseBySize = {
    compact: 0.93,
    standard: 1,
    large: 1.08,
  } as const
  const massByClass = {
    light: 1.08,
    balanced: 1.25,
    heavy: 1.58,
  } as const
  const damageByClass = {
    light: 1.15,
    balanced: 0.95,
    heavy: 0.74,
  } as const

  const accel = vehicleSpec.power.acceleration
  const speed = vehicleSpec.power.topSpeed
  const grip = vehicleSpec.handling.grip
  const drift = vehicleSpec.handling.drift
  const brake = vehicleSpec.handling.brake
  const chassisScale = chassisScaleBySize[vehicleSpec.chassisSize]

  const driftGripPenalty = Math.max(0, drift - grip) * 0.0034
  const accelMult = 0.74 + accel * 0.008 + (vehicleSpec.massClass === 'light' ? 0.05 : 0)
  const topSpeedMult = 0.58 + speed * 0.011 - (vehicleSpec.massClass === 'heavy' ? 0.06 : 0)
  const reverseSpeedMult = 0.76 + speed * 0.004
  const steeringMult = 0.74 + (drift * 0.005 + grip * 0.0026) - (vehicleSpec.chassisSize === 'large' ? 0.08 : 0)
  const gripMult = 0.82 + grip * 0.0054 - driftGripPenalty
  const brakeMult = 0.75 + brake * 0.006
  const mass = massByClass[vehicleSpec.massClass] * chassisScale
  const wheelBase = wheelBaseBySize[vehicleSpec.chassisSize]
  const bodyLength = vehicleSpec.chassisSize === 'large' ? 1.14 : vehicleSpec.chassisSize === 'compact' ? 0.9 : 1
  const bodyHeight = vehicleSpec.massClass === 'heavy' ? 1.05 : vehicleSpec.massClass === 'light' ? 0.96 : 1

  let engineTone: VehiclePhysicsTuning['engineTone'] = 'steady'
  if (speed + accel > 124 && vehicleSpec.massClass !== 'heavy') {
    engineTone = 'speedy'
  } else if (vehicleSpec.massClass === 'heavy' || brake + grip > 130) {
    engineTone = 'heavy'
  }

  return {
    accelMult,
    topSpeedMult,
    reverseSpeedMult,
    steeringMult,
    gripMult,
    brakeMult,
    damageTakenMult: damageByClass[vehicleSpec.massClass],
    mass,
    wheelBase,
    scale: [chassisScale, bodyHeight, bodyLength],
    engineTone,
  }
}
