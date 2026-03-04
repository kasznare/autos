import { VEHICLE_DEFINITION_SCHEMA_VERSION, type VehicleDefinition } from '../schema'

const wheelPair = (prefix: string, z: number, driven: boolean, steerable: boolean, suspension: VehicleDefinition['axles'][number]['wheels'][number]['suspension']) => [
  {
    id: `${prefix}-l`,
    side: 'left' as const,
    localAnchor: [-0.76, -0.12, z] as const,
    radius: 0.34,
    width: 0.24,
    massKg: 22,
    friction: 2.05,
    restitution: 0.02,
    steerable,
    driven,
    braked: true,
    suspension,
    knuckle: { enabled: steerable, massKg: 9, halfExtents: [0.08, 0.08, 0.08] as const },
  },
  {
    id: `${prefix}-r`,
    side: 'right' as const,
    localAnchor: [0.76, -0.12, z] as const,
    radius: 0.34,
    width: 0.24,
    massKg: 22,
    friction: 2.05,
    restitution: 0.02,
    steerable,
    driven,
    braked: true,
    suspension,
    knuckle: { enabled: steerable, massKg: 9, halfExtents: [0.08, 0.08, 0.08] as const },
  },
] as const

const carSuspension = { restLength: 0.22, travel: 0.24, stiffness: 26, damping: 8.5 }
const heavySuspension = { restLength: 0.3, travel: 0.34, stiffness: 34, damping: 11 }

export const VEHICLE_DEFINITIONS: readonly VehicleDefinition[] = [
  {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id: 'car-fwd-ice-hatch',
    label: 'Hatch FWD ICE',
    class: 'car',
    powertrain: {
      kind: 'ice',
      idleRpm: 850,
      maxRpm: 6800,
      engineBrakeNm: 95,
      torqueCurve: [
        [1000, 140],
        [2200, 188],
        [3600, 214],
        [5200, 196],
        [6600, 165],
      ],
    },
    drivetrain: {
      layout: 'fwd',
      frontDifferential: 'open',
      rearDifferential: 'open',
    },
    chassis: {
      massKg: 1280,
      centerOfMassLocal: [0, -0.06, -0.04],
      inertiaDiagonal: [780, 1180, 1320],
    },
    aero: {
      cdA: 0.66,
      clA: 0.08,
    },
    axles: [
      { id: 'front', role: 'front', differential: 'open', antiRollStiffness: 0.72, wheels: wheelPair('fwd-front', 0.98, true, true, carSuspension) },
      { id: 'rear', role: 'rear', differential: 'open', antiRollStiffness: 0.68, wheels: wheelPair('fwd-rear', -0.92, false, false, carSuspension) },
    ],
  },
  {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id: 'car-rwd-ice-coupe',
    label: 'Coupe RWD ICE',
    class: 'car',
    powertrain: {
      kind: 'ice',
      idleRpm: 900,
      maxRpm: 7200,
      engineBrakeNm: 105,
      torqueCurve: [
        [1200, 160],
        [2500, 230],
        [4200, 276],
        [5600, 268],
        [7000, 210],
      ],
    },
    drivetrain: {
      layout: 'rwd',
      frontDifferential: 'open',
      rearDifferential: 'locked',
    },
    chassis: {
      massKg: 1365,
      centerOfMassLocal: [0, -0.05, 0],
      inertiaDiagonal: [810, 1230, 1390],
    },
    aero: {
      cdA: 0.64,
      clA: 0.12,
    },
    axles: [
      { id: 'front', role: 'front', differential: 'open', antiRollStiffness: 0.66, wheels: wheelPair('rwd-front', 1.02, false, true, carSuspension) },
      { id: 'rear', role: 'rear', differential: 'locked', antiRollStiffness: 0.74, wheels: wheelPair('rwd-rear', -0.96, true, false, carSuspension) },
    ],
  },
  {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id: 'car-awd-ev-sport',
    label: 'Sport AWD EV',
    class: 'car',
    powertrain: {
      kind: 'ev',
      maxRpm: 16500,
      peakTorqueNm: 430,
      regenTorqueNm: 110,
    },
    drivetrain: {
      layout: 'awd',
      frontDifferential: 'open',
      rearDifferential: 'open',
      centerSplit: {
        front: 0.42,
        rear: 0.58,
      },
    },
    chassis: {
      massKg: 1840,
      centerOfMassLocal: [0, -0.09, 0],
      inertiaDiagonal: [980, 1520, 1710],
    },
    aero: {
      cdA: 0.61,
      clA: 0.18,
    },
    axles: [
      { id: 'front', role: 'front', differential: 'open', antiRollStiffness: 0.78, wheels: wheelPair('awd-front', 1.01, true, true, carSuspension) },
      { id: 'rear', role: 'rear', differential: 'open', antiRollStiffness: 0.81, wheels: wheelPair('awd-rear', -0.97, true, false, carSuspension) },
    ],
  },
  {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id: 'bus-rwd-ev-city',
    label: 'City Bus RWD EV',
    class: 'bus',
    powertrain: {
      kind: 'ev',
      maxRpm: 13000,
      peakTorqueNm: 2600,
      regenTorqueNm: 780,
    },
    drivetrain: {
      layout: 'rwd',
      frontDifferential: 'open',
      rearDifferential: 'locked',
    },
    chassis: {
      massKg: 12600,
      centerOfMassLocal: [0, -0.2, -0.08],
      inertiaDiagonal: [14500, 26400, 31200],
    },
    aero: {
      cdA: 4.8,
      clA: 0.45,
    },
    axles: [
      { id: 'front', role: 'front', differential: 'open', antiRollStiffness: 1.18, wheels: wheelPair('bus-front', 2.05, false, true, heavySuspension) },
      { id: 'rear', role: 'rear', differential: 'locked', antiRollStiffness: 1.26, wheels: wheelPair('bus-rear', -2.3, true, false, heavySuspension) },
    ],
  },
  {
    schemaVersion: VEHICLE_DEFINITION_SCHEMA_VERSION,
    id: 'lorry-awd-ice-hauler',
    label: 'Hauler AWD ICE',
    class: 'lorry',
    powertrain: {
      kind: 'ice',
      idleRpm: 700,
      maxRpm: 3900,
      engineBrakeNm: 520,
      torqueCurve: [
        [900, 900],
        [1400, 1320],
        [2000, 1460],
        [2800, 1340],
        [3600, 1040],
      ],
    },
    drivetrain: {
      layout: 'awd',
      frontDifferential: 'open',
      rearDifferential: 'locked',
      centerSplit: {
        front: 0.38,
        rear: 0.62,
      },
    },
    chassis: {
      massKg: 16400,
      centerOfMassLocal: [0, -0.22, 0.18],
      inertiaDiagonal: [19600, 35200, 38800],
    },
    aero: {
      cdA: 6.3,
      clA: 0.52,
    },
    axles: [
      { id: 'front', role: 'front', differential: 'open', antiRollStiffness: 1.24, wheels: wheelPair('lorry-front', 2.28, true, true, heavySuspension) },
      { id: 'rear', role: 'rear', differential: 'locked', antiRollStiffness: 1.35, wheels: wheelPair('lorry-rear', -2.44, true, false, heavySuspension) },
    ],
  },
]

export const VEHICLE_DEFINITION_BY_ID = Object.freeze(
  Object.fromEntries(VEHICLE_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<string, VehicleDefinition>,
)
