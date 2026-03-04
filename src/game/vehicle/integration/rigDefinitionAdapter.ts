import type { VehicleRigDefinition } from '../common/contracts'
import type { VehicleDefinition } from '../schema'

export const toVehicleRigDefinition = (definition: VehicleDefinition): VehicleRigDefinition => ({
  id: definition.id,
  chassis: {
    mass: Math.max(0.8, definition.chassis.massKg / 1000),
    linearDamping: 0.18,
    angularDamping: 1.8,
    collider: {
      halfExtents: [0.56, 0.28, 1.12],
      friction: 0.95,
      restitution: 0.02,
    },
  },
  axles: definition.axles.map((axle) => ({
    id: axle.id,
    corners: axle.wheels.map((wheel) => ({
      id: wheel.id,
      side: wheel.side,
      localAnchor: wheel.localAnchor,
      wheelRadius: wheel.radius,
      wheelWidth: wheel.width,
      wheelMass: Math.max(0.04, Math.min(0.16, wheel.massKg * 0.004)),
      wheelFriction: wheel.friction,
      wheelRestitution: wheel.restitution,
      suspension: {
        restLength: wheel.suspension.restLength,
        travel: wheel.suspension.travel,
        stiffness: wheel.suspension.stiffness,
        damping: wheel.suspension.damping,
      },
      steering: wheel.steerable
        ? {
            enabled: true,
            axis: [0, 1, 0],
            minAngleRad: -0.6,
            maxAngleRad: 0.6,
          }
        : undefined,
      knuckle: wheel.knuckle?.enabled
        ? {
            enabled: true,
            mass: Math.max(0.04, Math.min(0.2, wheel.knuckle.massKg * 0.004)),
            halfExtents: wheel.knuckle.halfExtents,
          }
        : undefined,
    })),
  })),
})
