import type { RapierRigidBody } from '@react-three/rapier'
import type { TrackMap } from '../../maps'
import { getMaterialTuningAt, getSurfaceMaterialAt, sampleTerrainHeight } from '../../maps'
import type { WheelTorqueTarget } from '../drivetrain'

export type WheelActuator = {
  wheelId: string
  body: RapierRigidBody | null
  radius: number
  axle?: 'front' | 'rear'
  side?: 'left' | 'right'
}

type ApplyWheelActuationParams = {
  map: TrackMap
  chassisYaw: number
  chassisLinVel: { x: number; y: number; z: number }
  wheelActuators: readonly WheelActuator[]
  wheelTargets: readonly WheelTorqueTarget[]
  delta: number
}

export interface WheelActuationDebugSnapshot {
  rows: readonly [string, string, string, string]
}

const getDriveTerrainHeight = (map: TrackMap, x: number, z: number) => (map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, z))

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const ENABLE_TIRE_FORCE_IMPULSES = false
const ENABLE_WHEEL_DRIVE_TORQUE = false
const project = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z
const rotateByQuat = (
  v: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
) => {
  const uvx = q.y * v.z - q.z * v.y
  const uvy = q.z * v.x - q.x * v.z
  const uvz = q.x * v.y - q.y * v.x
  const uuvx = q.y * uvz - q.z * uvy
  const uuvy = q.z * uvx - q.x * uvz
  const uuvz = q.x * uvy - q.y * uvx
  const s = 2 * q.w
  return {
    x: v.x + uvx * s + uuvx * 2,
    y: v.y + uvy * s + uuvy * 2,
    z: v.z + uvz * s + uuvz * 2,
  }
}

export const applyWheelActuation = ({
  map,
  chassisYaw,
  chassisLinVel,
  wheelActuators,
  wheelTargets,
  delta,
}: ApplyWheelActuationParams): WheelActuationDebugSnapshot => {
  const chassisForwardX = Math.sin(chassisYaw)
  const chassisForwardZ = Math.cos(chassisYaw)
  const chassisForwardSpeed = chassisLinVel.x * chassisForwardX + chassisLinVel.z * chassisForwardZ
  const wheelTargetById = new Map(wheelTargets.map((target) => [target.wheelId, target]))
  const debugRows = ['-', '-', '-', '-'] as [string, string, string, string]

  for (let index = 0; index < wheelActuators.length; index += 1) {
    const actuator = wheelActuators[index]
    const wheel = actuator.body
    if (!wheel) {
      if (index < debugRows.length) {
        debugRows[index] = `${actuator.wheelId}: n/a`
      }
      continue
    }
    const target = wheelTargetById.get(actuator.wheelId)
    if (!target) {
      if (index < debugRows.length) {
        debugRows[index] = `${actuator.wheelId}: no-target`
      }
      continue
    }
    const wheelYaw = chassisYaw + target.steerAngleRad
    const wheelForwardX = Math.sin(wheelYaw)
    const wheelForwardZ = Math.cos(wheelYaw)
    const wheelRightX = Math.cos(wheelYaw)
    const wheelRightZ = -Math.sin(wheelYaw)

    const radius = Math.max(0.12, actuator.radius)
    const wheelPos = wheel.translation()
    const terrainY = getDriveTerrainHeight(map, wheelPos.x, wheelPos.z)
    const contactGap = wheelPos.y - terrainY - radius
    const contactAuthority = clamp((0.12 - contactGap) / 0.12, 0, 1)
    const groundedDrive = contactAuthority >= 0.55
    const driveAuthority = groundedDrive ? 1 : 0
    const materialTuning = getMaterialTuningAt(map, wheelPos.x, wheelPos.z)
    const surface = getSurfaceMaterialAt(map, wheelPos.x, wheelPos.z)
    const surfaceGrip = (surface === 'asphalt' || surface === 'basalt' || surface === 'regolith' ? 1 : 0.78) * materialTuning.tractionMultiplier

    const desiredSpin = Math.sign(chassisForwardSpeed || target.driveTorqueNm || 1) * (Math.abs(chassisForwardSpeed) / radius)
    const ang = wheel.angvel()
    const rot = wheel.rotation()
    const spinAxis = rotateByQuat({ x: 1, y: 0, z: 0 }, rot)
    const spinRate = project(ang, spinAxis)
    const spinError = desiredSpin - spinRate
    const driveImpulse = (spinError * 0.05 + (target.driveTorqueNm / 1500) * delta) * driveAuthority
    const clampedDriveImpulse = ENABLE_WHEEL_DRIVE_TORQUE ? clamp(driveImpulse, -0.75, 0.75) : 0
    if (Math.abs(clampedDriveImpulse) > 0.0001) {
      wheel.applyTorqueImpulse(
        {
          x: spinAxis.x * clampedDriveImpulse,
          y: spinAxis.y * clampedDriveImpulse,
          z: spinAxis.z * clampedDriveImpulse,
        },
        true,
      )
    }

    const brakeAuthority = contactGap <= 0.16 ? 1 : 0.35
    const brakeFactor = clamp((target.brakeTorqueNm / 2200) * delta * brakeAuthority, 0, 0.92)
    if (brakeFactor > 0.0001) {
      const brakeTorque = -spinRate * brakeFactor * 0.7
      wheel.applyTorqueImpulse(
        {
          x: spinAxis.x * brakeTorque,
          y: spinAxis.y * brakeTorque,
          z: spinAxis.z * brakeTorque,
        },
        true,
      )
    }

    let slipSpeed = 0
    let longImpulse = 0
    let lateralImpulse = 0
    if (ENABLE_TIRE_FORCE_IMPULSES && contactAuthority > 0.001) {
      const wheelVel = wheel.linvel()
      const wheelForwardSpeed = wheelVel.x * wheelForwardX + wheelVel.z * wheelForwardZ
      const wheelLateralSpeed = wheelVel.x * wheelRightX + wheelVel.z * wheelRightZ
      const contactPatchSpeed = spinRate * radius
      slipSpeed = contactPatchSpeed - wheelForwardSpeed
      const wheelMass = Math.max(0.04, wheel.mass())
      const driveDemand = clamp(Math.abs(target.driveTorqueNm) / 720, 0, 1)
      const longTightness = (1 - driveDemand * 0.45) * surfaceGrip
      const longGain = clamp(delta * 6.4, 0, 1) * contactAuthority * longTightness
      const latGain = clamp(delta * 10.5, 0, 1) * contactAuthority * surfaceGrip
      // Match wheel patch speed to ground speed in the same direction as spin.
      longImpulse = clamp(slipSpeed * wheelMass * longGain, -0.24, 0.24)
      lateralImpulse = clamp(-wheelLateralSpeed * wheelMass * latGain, -0.28, 0.28)

      if (Math.abs(longImpulse) > 0.0001 || Math.abs(lateralImpulse) > 0.0001) {
        wheel.applyImpulse(
          {
            x: wheelForwardX * longImpulse + wheelRightX * lateralImpulse,
            y: 0,
            z: wheelForwardZ * longImpulse + wheelRightZ * lateralImpulse,
          },
          true,
        )
      }
    }
    if (index < debugRows.length) {
      const steerDeg = (target.steerAngleRad * 180) / Math.PI
      debugRows[index] = `${actuator.wheelId} c=${contactAuthority.toFixed(2)} s=${slipSpeed.toFixed(2)} li=${longImpulse.toFixed(2)} bi=${brakeFactor.toFixed(2)} st=${steerDeg.toFixed(0)} tf=${ENABLE_TIRE_FORCE_IMPULSES ? '1' : '0'} wd=${ENABLE_WHEEL_DRIVE_TORQUE ? '1' : '0'}`
    }
  }
  return { rows: debugRows }
}
