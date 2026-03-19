import type { PhysicsDebugTelemetryV2 } from '../types'

export const createInitialPhysicsDebugTelemetryV2 = (): PhysicsDebugTelemetryV2 => ({
  apiVersion: '2.0.0',
  speedKph: 0,
  steeringDeg: 0,
  slipRatio: 0,
  jumpState: 'grounded',
  jumpCooldownRemaining: 0,
  latestImpactImpulse: 0,
  latestImpactTier: 'minor',
  latestImpactMaterial: 'rubber',
  hardContactCount: 0,
  nanGuardTrips: 0,
  speedClampTrips: 0,
  driveMode: 'native',
  wheelDebugRows: ['-', '-', '-', '-'],
  rampContact: 0,
  rampCompression: 0,
  rampSpringForce: 0,
  rampDriveForce: 0,
  rampLateralForce: 0,
  rampTractionLimit: 0,
})
