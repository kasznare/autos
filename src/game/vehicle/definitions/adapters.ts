import { VEHICLE_PRESETS } from '../../config'
import type { VehicleSpec } from '../../types'
import { VEHICLE_DEFINITION_SCHEMA_VERSION, type VehicleDefinition } from '../schema'

const byMassClass = {
  light: { massKg: 1220, inertia: [760, 1120, 1290] as const },
  balanced: { massKg: 1380, inertia: [820, 1210, 1410] as const },
  heavy: { massKg: 1660, inertia: [940, 1470, 1690] as const },
} as const

const byChassisSize = {
  compact: { wheelbase: 1.88, track: 0.72 },
  standard: { wheelbase: 1.98, track: 0.76 },
  large: { wheelbase: 2.12, track: 0.81 },
} as const

const buildTorqueCurve = (acceleration: number, topSpeed: number) => {
  const peak = 140 + acceleration * 2.2
  const top = 130 + topSpeed * 2.1
  return [
    [1000, peak * 0.72],
    [2400, peak],
    [4200, top],
    [6200, top * 0.82],
  ] as const
}

const toDrivetrainLayout = (spec: VehicleSpec): VehicleDefinition['drivetrain']['layout'] => {
  if (spec.handling.grip > 68) {
    return 'awd'
  }
  if (spec.handling.drift > 60) {
    return 'rwd'
  }
  return 'fwd'
}

export const fromLegacyVehicleSpec = (id: string, spec: VehicleSpec): VehicleDefinition => {
  const massProfile = byMassClass[spec.massClass]
  const chassisProfile = byChassisSize[spec.chassisSize]
  const layout = toDrivetrainLayout(spec)

  const frontDriven = layout === 'fwd' || layout === 'awd'
  const rearDriven = layout === 'rwd' || layout === 'awd'

  return {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id,
    label: spec.name,
    class: 'car',
    powertrain: {
      kind: 'ice',
      idleRpm: 850,
      maxRpm: 6800,
      engineBrakeNm: 85 + spec.handling.brake * 1.4,
      torqueCurve: buildTorqueCurve(spec.power.acceleration, spec.power.topSpeed),
    },
    drivetrain: {
      layout,
      frontDifferential: 'open',
      rearDifferential: layout === 'rwd' ? 'locked' : 'open',
      centerSplit: layout === 'awd' ? { front: 0.45, rear: 0.55 } : undefined,
    },
    chassis: {
      massKg: massProfile.massKg,
      centerOfMassLocal: [0, -0.06, 0],
      inertiaDiagonal: massProfile.inertia,
    },
    aero: {
      cdA: 0.62 + (100 - spec.power.topSpeed) * 0.002,
      clA: 0.08 + spec.handling.grip * 0.001,
    },
    axles: [
      {
        id: 'front',
        role: 'front',
        differential: 'open',
        antiRollStiffness: 0.64,
        wheels: [
          {
            id: `${id}-front-left`,
            side: 'left',
            localAnchor: [-chassisProfile.track, -0.12, chassisProfile.wheelbase],
            radius: 0.33,
            width: 0.24,
            massKg: 20,
            friction: 2,
            restitution: 0.02,
            steerable: true,
            driven: frontDriven,
            braked: true,
            suspension: { restLength: 0.22, travel: 0.24, stiffness: 24, damping: 8 },
            knuckle: { enabled: true, massKg: 8, halfExtents: [0.08, 0.08, 0.08] },
          },
          {
            id: `${id}-front-right`,
            side: 'right',
            localAnchor: [chassisProfile.track, -0.12, chassisProfile.wheelbase],
            radius: 0.33,
            width: 0.24,
            massKg: 20,
            friction: 2,
            restitution: 0.02,
            steerable: true,
            driven: frontDriven,
            braked: true,
            suspension: { restLength: 0.22, travel: 0.24, stiffness: 24, damping: 8 },
            knuckle: { enabled: true, massKg: 8, halfExtents: [0.08, 0.08, 0.08] },
          },
        ],
      },
      {
        id: 'rear',
        role: 'rear',
        differential: layout === 'rwd' ? 'locked' : 'open',
        antiRollStiffness: 0.68,
        wheels: [
          {
            id: `${id}-rear-left`,
            side: 'left',
            localAnchor: [-chassisProfile.track, -0.12, -chassisProfile.wheelbase * 0.94],
            radius: 0.33,
            width: 0.24,
            massKg: 20,
            friction: 2,
            restitution: 0.02,
            steerable: false,
            driven: rearDriven,
            braked: true,
            suspension: { restLength: 0.22, travel: 0.24, stiffness: 24, damping: 8 },
          },
          {
            id: `${id}-rear-right`,
            side: 'right',
            localAnchor: [chassisProfile.track, -0.12, -chassisProfile.wheelbase * 0.94],
            radius: 0.33,
            width: 0.24,
            massKg: 20,
            friction: 2,
            restitution: 0.02,
            steerable: false,
            driven: rearDriven,
            braked: true,
            suspension: { restLength: 0.22, travel: 0.24, stiffness: 24, damping: 8 },
          },
        ],
      },
    ],
  }
}

export const LEGACY_PRESET_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(VEHICLE_PRESETS).map(([presetId, preset]) => [
      `legacy-${presetId}`,
      fromLegacyVehicleSpec(`legacy-${presetId}`, preset),
    ]),
  ) as Record<string, VehicleDefinition>,
)
