import { VEHICLE_DEFINITION_SCHEMA_VERSION, type AxleDefinition, type DriveLayout, type VehicleDefinition } from './types'

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0

const validateLayout = (layout: DriveLayout) => {
  if (layout === 'awd') {
    return
  }
}

const validateAxle = (axle: AxleDefinition, errors: string[]) => {
  if (axle.wheels.length !== 2) {
    errors.push(`axle:${axle.id} must have exactly 2 wheels`)
    return
  }

  const [left, right] = axle.wheels
  if (left.side !== 'left' || right.side !== 'right') {
    errors.push(`axle:${axle.id} wheel sides must be [left,right]`)
  }

  for (const wheel of axle.wheels) {
    if (!isFinitePositive(wheel.radius)) errors.push(`wheel:${wheel.id} radius must be > 0`)
    if (!isFinitePositive(wheel.width)) errors.push(`wheel:${wheel.id} width must be > 0`)
    if (!isFinitePositive(wheel.massKg)) errors.push(`wheel:${wheel.id} massKg must be > 0`)
    if (!isFinitePositive(wheel.suspension.restLength)) errors.push(`wheel:${wheel.id} suspension.restLength must be > 0`)
    if (!isFinitePositive(wheel.suspension.travel)) errors.push(`wheel:${wheel.id} suspension.travel must be > 0`)
    if (!isFinitePositive(wheel.suspension.stiffness)) errors.push(`wheel:${wheel.id} suspension.stiffness must be > 0`)
    if (!isFinitePositive(wheel.suspension.damping)) errors.push(`wheel:${wheel.id} suspension.damping must be > 0`)
  }
}

export const validateVehicleDefinition = (definition: VehicleDefinition) => {
  const errors: string[] = []

  if (definition.schemaVersion !== VEHICLE_DEFINITION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${VEHICLE_DEFINITION_SCHEMA_VERSION}`)
  }
  if (!definition.id.trim()) errors.push('id must be non-empty')
  if (!definition.label.trim()) errors.push('label must be non-empty')
  if (!isFinitePositive(definition.chassis.massKg)) errors.push('chassis.massKg must be > 0')
  if (!isFinitePositive(definition.aero.cdA)) errors.push('aero.cdA must be > 0')
  if (definition.axles.length < 2) errors.push('vehicle must contain at least 2 axles')

  if (definition.powertrain.kind === 'ice') {
    if (!isFinitePositive(definition.powertrain.idleRpm)) errors.push('powertrain.idleRpm must be > 0')
    if (!isFinitePositive(definition.powertrain.maxRpm)) errors.push('powertrain.maxRpm must be > 0')
    if (definition.powertrain.torqueCurve.length < 2) {
      errors.push('powertrain.torqueCurve must contain at least 2 points')
    }
  } else {
    if (!isFinitePositive(definition.powertrain.maxRpm)) errors.push('powertrain.maxRpm must be > 0')
    if (!isFinitePositive(definition.powertrain.peakTorqueNm)) errors.push('powertrain.peakTorqueNm must be > 0')
  }

  validateLayout(definition.drivetrain.layout)
  if (definition.drivetrain.layout === 'awd') {
    if (!definition.drivetrain.centerSplit) {
      errors.push('awd layout requires drivetrain.centerSplit')
    } else {
      const sum = definition.drivetrain.centerSplit.front + definition.drivetrain.centerSplit.rear
      if (Math.abs(sum - 1) > 0.001) errors.push('drivetrain.centerSplit front+rear must equal 1')
    }
  }

  for (const axle of definition.axles) {
    validateAxle(axle, errors)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
