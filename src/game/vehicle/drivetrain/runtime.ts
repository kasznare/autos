import type { VehicleDefinition } from '../schema'

export interface DriveCommand {
  throttle: number
  steer: number
  driveBiasFront: number
  driveBiasRear: number
  engineBrakeMult: number
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value))

const resolveDriveBias = (definition: VehicleDefinition) => {
  switch (definition.drivetrain.layout) {
    case 'fwd':
      return { front: 1, rear: 0 }
    case 'rwd':
      return { front: 0, rear: 1 }
    case 'awd':
      return {
        front: definition.drivetrain.centerSplit?.front ?? 0.5,
        rear: definition.drivetrain.centerSplit?.rear ?? 0.5,
      }
  }
}

export const buildDriveCommand = (definition: VehicleDefinition, input: { forward: boolean; backward: boolean; left: boolean; right: boolean }): DriveCommand => {
  const bias = resolveDriveBias(definition)
  const throttle = clampUnit(Number(input.forward) - Number(input.backward))
  const steer = clampUnit(Number(input.left) - Number(input.right))
  const engineBrakeMult = definition.powertrain.kind === 'ev' ? 1.28 : 1

  return {
    throttle,
    steer,
    driveBiasFront: bias.front,
    driveBiasRear: bias.rear,
    engineBrakeMult,
  }
}
