import { TRACK_SIZE } from '../config'
import type { MapId, TrackMap, TrackPoint } from './schema'

const createTree = (id: string, x: number, z: number, scale: number, variant: 'round' | 'cone') => ({
  id,
  position: [x, 0, z] as [number, number, number],
  scale,
  variant,
})

const createGates = (offset: number) => [
  { position: [0, 0, -offset] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number] },
  { position: [0, 0, offset] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number] },
  { position: [-offset, 0, 0] as [number, number, number] },
  { position: [offset, 0, 0] as [number, number, number] },
]

const planetObstacles = {
  static: [
    { id: 'wall-north', position: [0, 1, -29] as [number, number, number], size: [29, 2, 1] as [number, number, number], material: 'hard' as const, mass: 15, color: '#5f6067' },
    { id: 'wall-south', position: [0, 1, 29] as [number, number, number], size: [29, 2, 1] as [number, number, number], material: 'hard' as const, mass: 15, color: '#5f6067' },
    { id: 'wall-east', position: [29, 1, 0] as [number, number, number], size: [1, 2, 29] as [number, number, number], material: 'hard' as const, mass: 15, color: '#5f6067' },
    { id: 'wall-west', position: [-29, 1, 0] as [number, number, number], size: [1, 2, 29] as [number, number, number], material: 'hard' as const, mass: 15, color: '#5f6067' },
  ],
  movable: [
    { id: 'cone-1', position: [5, 0.45, 2] as [number, number, number], size: [0.7, 0.9, 0.7] as [number, number, number], material: 'soft' as const, movable: true, mass: 0.3, color: '#f2871b' },
    { id: 'cone-2', position: [-3, 0.45, 7] as [number, number, number], size: [0.7, 0.9, 0.7] as [number, number, number], material: 'soft' as const, movable: true, mass: 0.3, color: '#f2871b' },
    { id: 'crate-1', position: [4, 0.6, -8] as [number, number, number], size: [1, 1.2, 1] as [number, number, number], material: 'medium' as const, movable: true, mass: 0.95, color: '#c7904a' },
    { id: 'crate-2', position: [-13, 0.6, 12] as [number, number, number], size: [1, 1.2, 1] as [number, number, number], material: 'medium' as const, movable: true, mass: 0.95, color: '#c7904a' },
  ],
}

const basePickups = [
  { id: 's-1', position: [0, 0.8, 0] as [number, number, number], type: 'star' as const },
  { id: 's-2', position: [10, 0.8, -6] as [number, number, number], type: 'star' as const },
  { id: 's-3', position: [-10, 0.8, 8] as [number, number, number], type: 'star' as const },
  { id: 's-4', position: [16, 0.8, 12] as [number, number, number], type: 'star' as const },
  { id: 's-5', position: [-18, 0.8, -14] as [number, number, number], type: 'star' as const },
  { id: 'r-1', position: [20, 0.8, -3] as [number, number, number], type: 'repair' as const },
  { id: 'r-2', position: [-20, 0.8, 4] as [number, number, number], type: 'repair' as const },
  { id: 'p-1', position: [12, 0.8, 16] as [number, number, number], type: 'part' as const },
  { id: 'p-2', position: [-14, 0.8, -18] as [number, number, number], type: 'part' as const },
]

const baseDestructiblePoints: [number, number, number][] = [
  [0, 0.7, 20],
  [0, 0.7, -20],
  [20, 0.7, 0],
  [-20, 0.7, 0],
  [15, 0.7, 15],
  [15, 0.7, -15],
  [-15, 0.7, 15],
  [-15, 0.7, -15],
  [6, 0.7, 20],
  [-6, 0.7, -20],
]

const orbitalPath: TrackPoint[] = [
  [8, -44],
  [40, -36],
  [49, -10],
  [44, 18],
  [24, 42],
  [-2, 52],
  [-31, 40],
  [-47, 14],
  [-44, -18],
  [-25, -40],
]

const titanPath: TrackPoint[] = [
  [9, -26],
  [23, -20],
  [26, -2],
  [21, 16],
  [6, 24],
  [-11, 23],
  [-23, 11],
  [-24, -7],
  [-13, -22],
]

export const MAP_ORDER: MapId[] = ['orbital', 'gaia', 'titan', 'procedural']

export const MAP_LABELS: Record<MapId, string> = {
  orbital: 'Orbital Rift',
  gaia: 'Gaia Circuit',
  titan: 'Titan Brakefield',
  procedural: 'Nebula Loop',
}

export const FIXED_MAPS: Record<Exclude<MapId, 'procedural'>, TrackMap> = {
  orbital: {
    schemaVersion: '2.0.0',
    id: 'orbital',
    sourceId: 'orbital',
    label: MAP_LABELS.orbital,
    shape: 'path',
    worldHalf: 64,
    outerHalf: 0,
    innerHalf: 0,
    roadWidth: 8,
    roadPath: orbitalPath,
    startPosition: [orbitalPath[0][0], 0.38, orbitalPath[0][1]],
    startYaw: Math.atan2(orbitalPath[1][0] - orbitalPath[0][0], orbitalPath[1][1] - orbitalPath[0][1]),
    gravity: [0, -4.25, 0],
    terrain: {
      profile: 'craggy',
      amplitude: 10.5,
      frequency: 0.016,
    },
    materialZones: [
      { id: 'global-dust', shape: 'global', material: 'dust' },
      { id: 'track-regolith', shape: 'path-band', material: 'regolith', width: 10.5 },
      { id: 'ice-pocket-north', shape: 'circle', material: 'ice', center: [12, 32], radius: 7 },
      { id: 'ice-pocket-west', shape: 'circle', material: 'ice', center: [-29, -8], radius: 6 },
    ],
    materialTuning: {
      regolith: { tractionMultiplier: 0.95, dragMultiplier: 1.08, topSpeedMultiplier: 0.98 },
      dust: { tractionMultiplier: 0.82, dragMultiplier: 1.18, topSpeedMultiplier: 0.92 },
      ice: { tractionMultiplier: 0.55, dragMultiplier: 0.88, topSpeedMultiplier: 1.02 },
    },
    spawnRules: {
      pickups: {
        initial: basePickups,
        minCounts: { star: 5, repair: 3, part: 2 },
        bonusRepairChance: 0.42,
        bonusPartChance: 0.35,
      },
      hazards: {
        critters: {
          enabled: true,
          count: 10,
          breakSpeed: 2.8,
          hitRadius: 1.15,
          hitCheckInterval: 0.08,
          respawnSeconds: 5.2,
        },
        destructibles: {
          initialCount: 6,
          spawnPoints: baseDestructiblePoints,
          breakSpeed: 5.8,
          respawnSeconds: 3.8,
          palette: ['#d39d58', '#be8744', '#c19352', '#9d7241'],
        },
      },
      obstacles: {
        static: [],
        movable: [],
      },
    },
    gates: [
      { position: [44.5, 0, -23], rotation: [0, 2.82, 0] },
      { position: [34, 0, 33], rotation: [0, 2.24, 0] },
      { position: [-16, 0, 46], rotation: [0, 1.15, 0] },
      { position: [-45.5, 0, -2], rotation: [0, 0.42, 0] },
      { position: [-20, 0, -41], rotation: [0, -1.01, 0] },
    ],
    trees: [
      createTree('orbital-t1', -52, -47, 1.2, 'cone'),
      createTree('orbital-t2', -50, 46, 1.08, 'round'),
      createTree('orbital-t3', 53, 47, 1.14, 'cone'),
      createTree('orbital-t4', 51, -48, 1.1, 'round'),
    ],
  },
  gaia: {
    schemaVersion: '2.0.0',
    id: 'gaia',
    sourceId: 'gaia',
    label: MAP_LABELS.gaia,
    shape: 'ring',
    worldHalf: TRACK_SIZE / 2,
    outerHalf: 24,
    innerHalf: 10,
    roadWidth: 14,
    roadPath: [],
    startPosition: [0, 0.38, 21],
    startYaw: Math.PI / 2,
    gravity: [0, -12, 0],
    terrain: {
      profile: 'rolling',
      amplitude: 1.9,
      frequency: 0.032,
    },
    materialZones: [
      { id: 'global-basalt', shape: 'global', material: 'basalt' },
      { id: 'track-asphalt', shape: 'ring-band', material: 'asphalt', minHalf: 10, maxHalf: 24 },
      { id: 'inner-ice-patch', shape: 'circle', material: 'ice', center: [0, 0], radius: 4.2 },
    ],
    materialTuning: {
      asphalt: { tractionMultiplier: 1, dragMultiplier: 1, topSpeedMultiplier: 1 },
      basalt: { tractionMultiplier: 0.9, dragMultiplier: 1.1, topSpeedMultiplier: 0.95 },
      ice: { tractionMultiplier: 0.62, dragMultiplier: 0.9, topSpeedMultiplier: 1.02 },
    },
    spawnRules: {
      pickups: {
        initial: basePickups,
        minCounts: { star: 5, repair: 3, part: 2 },
        bonusRepairChance: 0.45,
        bonusPartChance: 0.32,
      },
      hazards: {
        critters: {
          enabled: false,
          count: 0,
          breakSpeed: 3.2,
          hitRadius: 1.05,
          hitCheckInterval: 0.08,
          respawnSeconds: 4.2,
        },
        destructibles: {
          initialCount: 5,
          spawnPoints: baseDestructiblePoints,
          breakSpeed: 6.5,
          respawnSeconds: 3.2,
          palette: ['#d39d58', '#be8744', '#c19352', '#9d7241'],
        },
      },
      obstacles: planetObstacles,
    },
    gates: createGates(17.5),
    trees: [
      createTree('gaia-t1', -27, -22, 1.1, 'cone'),
      createTree('gaia-t2', -27, 22, 1.05, 'cone'),
      createTree('gaia-t3', 27, -22, 1.1, 'cone'),
      createTree('gaia-t4', 27, 22, 1.05, 'cone'),
      createTree('gaia-t5', -5, -2, 0.85, 'round'),
      createTree('gaia-t6', 5, 2, 0.9, 'round'),
      createTree('gaia-t7', -2, 5, 0.85, 'round'),
      createTree('gaia-t8', 2, -5, 0.85, 'round'),
    ],
  },
  titan: {
    schemaVersion: '2.0.0',
    id: 'titan',
    sourceId: 'titan',
    label: MAP_LABELS.titan,
    shape: 'path',
    worldHalf: 34,
    outerHalf: 0,
    innerHalf: 0,
    roadWidth: 7.2,
    roadPath: titanPath,
    startPosition: [titanPath[0][0], 0.38, titanPath[0][1]],
    startYaw: Math.atan2(titanPath[1][0] - titanPath[0][0], titanPath[1][1] - titanPath[0][1]),
    gravity: [0, -18.5, 0],
    terrain: {
      profile: 'rolling',
      amplitude: 4.2,
      frequency: 0.02,
    },
    materialZones: [
      { id: 'global-regolith', shape: 'global', material: 'regolith' },
      { id: 'track-basalt', shape: 'path-band', material: 'basalt', width: 8.8 },
      { id: 'brake-zone-east', shape: 'circle', material: 'dust', center: [21, -2], radius: 4.5 },
      { id: 'brake-zone-west', shape: 'circle', material: 'dust', center: [-22, 10], radius: 4.5 },
    ],
    materialTuning: {
      basalt: { tractionMultiplier: 1.04, dragMultiplier: 1.18, topSpeedMultiplier: 0.9 },
      regolith: { tractionMultiplier: 0.86, dragMultiplier: 1.2, topSpeedMultiplier: 0.9 },
      dust: { tractionMultiplier: 0.75, dragMultiplier: 1.28, topSpeedMultiplier: 0.84 },
    },
    spawnRules: {
      pickups: {
        initial: basePickups,
        minCounts: { star: 5, repair: 3, part: 2 },
        bonusRepairChance: 0.5,
        bonusPartChance: 0.36,
      },
      hazards: {
        critters: {
          enabled: true,
          count: 4,
          breakSpeed: 3,
          hitRadius: 1.05,
          hitCheckInterval: 0.08,
          respawnSeconds: 3.8,
        },
        destructibles: {
          initialCount: 7,
          spawnPoints: baseDestructiblePoints,
          breakSpeed: 5.4,
          respawnSeconds: 2.8,
          palette: ['#d39d58', '#be8744', '#c19352', '#9d7241'],
        },
      },
      obstacles: {
        static: [...planetObstacles.static, { id: 'truck-1', position: [10, 1, 5], size: [2, 2, 4], material: 'hard', mass: 8, color: '#2f3348' }],
        movable: [...planetObstacles.movable, { id: 'crate-3', position: [14, 0.6, -13], size: [1, 1.2, 1], material: 'medium', movable: true, mass: 1, color: '#c7904a' }],
      },
    },
    gates: [
      { position: [24.5, 0, -11], rotation: [0, 2.96, 0] },
      { position: [22.5, 0, 8], rotation: [0, 2.42, 0] },
      { position: [0, 0, 24], rotation: [0, 1.52, 0] },
      { position: [-22.5, 0, 3], rotation: [0, 0.28, 0] },
      { position: [-18, 0, -17], rotation: [0, -0.78, 0] },
    ],
    trees: [
      createTree('titan-t1', -25, -24, 1.2, 'round'),
      createTree('titan-t2', -24, 25, 1.1, 'round'),
      createTree('titan-t3', 25, -24, 1.2, 'round'),
      createTree('titan-t4', 24, 25, 1.1, 'round'),
      createTree('titan-t5', -9, 3, 1, 'cone'),
      createTree('titan-t6', 9, -3, 1, 'cone'),
    ],
  },
}
