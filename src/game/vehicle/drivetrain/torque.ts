import type { VehicleDefinition } from '../schema'
import type { DriveCommand } from './runtime'

const FORCE_DRIVE_MODE: 'rwd-2wd' | null = 'rwd-2wd'

export interface WheelTorqueTarget {
  wheelId: string
  driveTorqueNm: number
  brakeTorqueNm: number
  steerAngleRad: number
}

const interpolateTorqueCurve = (curve: ReadonlyArray<readonly [rpm: number, torqueNm: number]>, rpm: number) => {
  if (curve.length === 0) {
    return 0
  }
  if (rpm <= curve[0][0]) {
    return curve[0][1]
  }
  for (let i = 1; i < curve.length; i += 1) {
    const [rpmB, torqueB] = curve[i]
    const [rpmA, torqueA] = curve[i - 1]
    if (rpm <= rpmB) {
      const t = (rpm - rpmA) / Math.max(1, rpmB - rpmA)
      return torqueA + (torqueB - torqueA) * t
    }
  }
  return curve[curve.length - 1][1]
}

const resolvePowertrainTorque = (definition: VehicleDefinition, throttleAbs: number) => {
  if (definition.powertrain.kind === 'ev') {
    return definition.powertrain.peakTorqueNm * throttleAbs
  }
  const ice = definition.powertrain
  const probeRpm = ice.idleRpm + (ice.maxRpm - ice.idleRpm) * 0.56
  return interpolateTorqueCurve(ice.torqueCurve, probeRpm) * throttleAbs
}

const resolveEngineBrake = (definition: VehicleDefinition) => {
  if (definition.powertrain.kind === 'ev') {
    return definition.powertrain.regenTorqueNm
  }
  return definition.powertrain.engineBrakeNm
}

const resolveSteerAngle = (steerInput: number, steerable: boolean, side: 'left' | 'right') => {
  if (!steerable) {
    return 0
  }
  const base = Math.max(-1, Math.min(1, steerInput)) * 0.62
  if (Math.abs(base) < 0.0001) {
    return 0
  }
  const turningLeft = base > 0
  const isInner = (turningLeft && side === 'left') || (!turningLeft && side === 'right')
  const ackermannFactor = isInner ? 1.08 : 0.86
  return base * ackermannFactor
}

export const buildWheelTorqueTargets = (definition: VehicleDefinition, command: DriveCommand): readonly WheelTorqueTarget[] => {
  const throttle = Math.max(-1, Math.min(1, command.throttle))
  const throttleAbs = Math.abs(throttle)
  const driveSign = throttle >= 0 ? 1 : -1
  const rawPowertrainTorque = resolvePowertrainTorque(definition, throttleAbs)
  const engineBrakeNm = resolveEngineBrake(definition) * command.engineBrakeMult

  const isWheelDriven = (axleRole: string, declaredDriven: boolean) => {
    if (FORCE_DRIVE_MODE === 'rwd-2wd') {
      return axleRole !== 'front'
    }
    return declaredDriven
  }

  const frontDrivenWheels = definition.axles
    .filter((axle) => axle.role === 'front')
    .flatMap((axle) => axle.wheels.map((wheel) => ({ axleRole: axle.role, declaredDriven: wheel.driven })))
    .filter((wheel) => isWheelDriven(wheel.axleRole, wheel.declaredDriven)).length
  const rearDrivenWheels = definition.axles
    .filter((axle) => axle.role !== 'front')
    .flatMap((axle) => axle.wheels.map((wheel) => ({ axleRole: axle.role, declaredDriven: wheel.driven })))
    .filter((wheel) => isWheelDriven(wheel.axleRole, wheel.declaredDriven)).length

  const frontTorque = rawPowertrainTorque * (FORCE_DRIVE_MODE === 'rwd-2wd' ? 0 : command.driveBiasFront)
  const rearTorque = rawPowertrainTorque * (FORCE_DRIVE_MODE === 'rwd-2wd' ? 1 : command.driveBiasRear)

  const targets: WheelTorqueTarget[] = []
  for (const axle of definition.axles) {
    const isFront = axle.role === 'front'
    const drivenWheelCount = isFront ? frontDrivenWheels : rearDrivenWheels
    const axleTorque = isFront ? frontTorque : rearTorque
    const torquePerDrivenWheel = drivenWheelCount > 0 ? axleTorque / drivenWheelCount : 0

    for (const wheel of axle.wheels) {
      const driveEnabled = isWheelDriven(axle.role, wheel.driven)
      const driveTorqueNm = driveEnabled ? torquePerDrivenWheel * driveSign : 0
      const brakeTorqueNm = wheel.braked && throttleAbs < 0.05 ? engineBrakeNm * 0.25 : 0
      targets.push({
        wheelId: wheel.id,
        driveTorqueNm,
        brakeTorqueNm,
        steerAngleRad: resolveSteerAngle(command.steer, wheel.steerable, wheel.side),
      })
    }
  }

  return targets
}
