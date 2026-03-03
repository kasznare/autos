import { VEHICLE_PRESETS, VEHICLE_SPEC_LIMITS } from '../src/game/config'
import { evaluateVehicleSpec, sanitizeVehicleSpec, toVehiclePhysicsTuning } from '../src/game/physics/vehicleAdapter'
import type { VehicleSpec } from '../src/game/types'

type Scenario = {
  name: string
  input: VehicleSpec
}

const scenarios: Scenario[] = [
  {
    name: 'Street Rocket',
    input: {
      ...VEHICLE_PRESETS.sprinter,
      name: 'Street Rocket',
      power: { acceleration: 92, topSpeed: 95 },
      handling: { grip: 44, drift: 70, brake: 31 },
    },
  },
  {
    name: 'Trail Tank',
    input: {
      ...VEHICLE_PRESETS.bulldozer,
      name: 'Trail Tank',
      power: { acceleration: 35, topSpeed: 32 },
      handling: { grip: 88, drift: 12, brake: 86 },
    },
  },
]

const neutral = sanitizeVehicleSpec(VEHICLE_PRESETS.balanced)
const neutralPhysics = toVehiclePhysicsTuning(neutral)

for (const scenario of scenarios) {
  const sanitized = sanitizeVehicleSpec(scenario.input)
  const physics = toVehiclePhysicsTuning(sanitized)
  const evalResult = evaluateVehicleSpec(sanitized)

  const withinBudget = evalResult.budgetUsage <= VEHICLE_SPEC_LIMITS.balanceBudget
  const withinBounds =
    sanitized.power.acceleration >= VEHICLE_SPEC_LIMITS.power.acceleration.min &&
    sanitized.power.topSpeed >= VEHICLE_SPEC_LIMITS.power.topSpeed.min &&
    sanitized.handling.grip >= VEHICLE_SPEC_LIMITS.handling.grip.min &&
    sanitized.handling.drift >= VEHICLE_SPEC_LIMITS.handling.drift.min &&
    sanitized.handling.brake >= VEHICLE_SPEC_LIMITS.handling.brake.min

  if (!withinBudget || !withinBounds) {
    throw new Error(`${scenario.name} failed sanitization checks`)
  }

  const topSpeedDelta = (physics.topSpeedMult - neutralPhysics.topSpeedMult) * 100
  const steeringDelta = (physics.steeringMult - neutralPhysics.steeringMult) * 100
  const durabilityDelta = (neutralPhysics.damageTakenMult - physics.damageTakenMult) * 100

  console.log(
    [
      `Build: ${scenario.name}`,
      `Sanitized stats: accel=${sanitized.power.acceleration}, topSpeed=${sanitized.power.topSpeed}, grip=${sanitized.handling.grip}, drift=${sanitized.handling.drift}, brake=${sanitized.handling.brake}`,
      `Budget usage: ${evalResult.budgetUsage}/${VEHICLE_SPEC_LIMITS.balanceBudget}`,
      `Handling vs baseline: topSpeed ${topSpeedDelta >= 0 ? '+' : ''}${topSpeedDelta.toFixed(1)}%, steering ${steeringDelta >= 0 ? '+' : ''}${steeringDelta.toFixed(1)}%, durability ${durabilityDelta >= 0 ? '+' : ''}${durabilityDelta.toFixed(1)}%`,
      `Warnings: ${evalResult.warnings.length ? evalResult.warnings.join(' | ') : 'none'}`,
    ].join('\n'),
  )
  console.log('---')
}

const sanitizedOne = toVehiclePhysicsTuning(sanitizeVehicleSpec(scenarios[0].input))
const sanitizedTwo = toVehiclePhysicsTuning(sanitizeVehicleSpec(scenarios[1].input))
if (Math.abs(sanitizedOne.topSpeedMult - sanitizedTwo.topSpeedMult) < 0.2) {
  throw new Error('Expected distinct build top-speed behavior but difference was too small')
}
if (Math.abs(sanitizedOne.damageTakenMult - sanitizedTwo.damageTakenMult) < 0.1) {
  throw new Error('Expected distinct durability behavior but difference was too small')
}

console.log('Custom build end-to-end checks passed for 2 distinct builds.')
