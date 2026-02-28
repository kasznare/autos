import { TRACK_SIZE } from './config'

export type MapId = 'classic' | 'city' | 'meadow' | 'procedural'

type MapShape = 'ring' | 'path'

export type TrackGate = {
  position: [number, number, number]
  rotation?: [number, number, number]
}

export type TrackTree = {
  id: string
  position: [number, number, number]
  scale: number
  variant: 'round' | 'cone'
}

export type TrackPoint = [number, number]

export type TrackMap = {
  id: MapId | `procedural-${number}`
  sourceId: MapId
  label: string
  shape: MapShape
  worldHalf: number
  outerHalf: number
  innerHalf: number
  roadWidth: number
  roadPath: TrackPoint[]
  startPosition: [number, number, number]
  startYaw: number
  terrainAmplitude: number
  terrainFrequency: number
  gates: TrackGate[]
  trees: TrackTree[]
}

export const MAP_ORDER: MapId[] = ['classic', 'city', 'meadow', 'procedural']

export const MAP_LABELS: Record<MapId, string> = {
  classic: 'Classic',
  city: 'City',
  meadow: 'Meadow',
  procedural: 'Forest Loop',
}

const isRoadRingAt = (x: number, z: number, outerHalf: number, innerHalf: number) =>
  (Math.abs(x) <= outerHalf && Math.abs(z) <= outerHalf) && !(Math.abs(x) < innerHalf && Math.abs(z) < innerHalf)

const distanceToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const denom = abx * abx + abz * abz
  if (denom <= 0.0001) {
    return Math.hypot(px - ax, pz - az)
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom))
  const cx = ax + abx * t
  const cz = az + abz * t
  return Math.hypot(px - cx, pz - cz)
}

const isPathRoadAt = (x: number, z: number, points: TrackPoint[], roadWidth: number) => {
  if (points.length < 2) {
    return false
  }
  const halfWidth = roadWidth * 0.5
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (distanceToSegment(x, z, a[0], a[1], b[0], b[1]) <= halfWidth) {
      return true
    }
  }
  return false
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const smoothStep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

const getPathRoadProximity = (x: number, z: number, points: TrackPoint[]) => {
  if (points.length < 2) {
    return { distance: Infinity, signedDistance: 0 }
  }
  let minDist = Infinity
  let signedDistance = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const apx = x - a[0]
    const apz = z - a[1]
    const denom = abx * abx + abz * abz
    if (denom <= 0.0001) {
      continue
    }
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom))
    const cx = a[0] + abx * t
    const cz = a[1] + abz * t
    const dx = x - cx
    const dz = z - cz
    const dist = Math.hypot(dx, dz)
    if (dist < minDist) {
      minDist = dist
      const cross = abx * dz - abz * dx
      signedDistance = dist * (cross >= 0 ? 1 : -1)
    }
  }
  return { distance: minDist, signedDistance }
}

export const isPointOnRoad = (map: TrackMap, x: number, z: number) => {
  if (map.shape === 'ring') {
    return isRoadRingAt(x, z, map.outerHalf, map.innerHalf)
  }
  return isPathRoadAt(x, z, map.roadPath, map.roadWidth)
}

export const sampleTerrainHeight = (map: TrackMap, x: number, z: number) => {
  if (map.terrainAmplitude <= 0) {
    return 0
  }
  const f = map.terrainFrequency
  const base = Math.sin(x * f) * 0.6 + Math.cos(z * f * 1.08) * 0.55
  const cross = Math.sin((x + z) * f * 0.6) * 0.42
  let height = (base + cross) * map.terrainAmplitude
  if (map.shape === 'path') {
    const ridgeA = Math.abs(Math.sin(x * f * 1.6) * Math.cos(z * f * 1.2))
    const ridgeB = Math.abs(Math.sin((x - z) * f * 0.86))
    const mountain = (ridgeA * 0.9 + ridgeB * 0.7) * map.terrainAmplitude * 1.05
    height += mountain
    const roadInfo = getPathRoadProximity(x, z, map.roadPath)
    const sideSlopeRange = map.roadWidth * 2.2
    const sideSlopeFade = 1 - smoothStep(map.roadWidth * 0.45, sideSlopeRange, roadInfo.distance)
    const sideSlopeNorm = Math.max(-1, Math.min(1, roadInfo.signedDistance / Math.max(0.001, map.roadWidth * 0.9)))
    const sideSlope = sideSlopeNorm * map.terrainAmplitude * 0.06 * sideSlopeFade
    const roadBase =
      (Math.sin(x * f * 0.19) * 0.55 + Math.cos(z * f * 0.17) * 0.45 + Math.sin((x + z) * f * 0.12) * 0.35) *
      map.terrainAmplitude *
      0.1 +
      sideSlope
    const flattenStart = map.roadWidth * 0.68
    const flattenEnd = map.roadWidth * 4.6
    const blend = smoothStep(flattenStart, flattenEnd, roadInfo.distance)
    height = roadBase + (height - roadBase) * blend
  }
  return height
}

const mulberry32 = (seed: number) => {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const createTree = (id: string, x: number, z: number, scale: number, variant: 'round' | 'cone'): TrackTree => ({
  id,
  position: [x, 0, z],
  scale,
  variant,
})

const createGates = (offset: number): TrackGate[] => [
  { position: [0, 0, -offset], rotation: [0, Math.PI / 2, 0] },
  { position: [0, 0, offset], rotation: [0, Math.PI / 2, 0] },
  { position: [-offset, 0, 0] },
  { position: [offset, 0, 0] },
]

const fixedMaps: Record<Exclude<MapId, 'procedural'>, TrackMap> = {
  classic: {
    id: 'classic',
    sourceId: 'classic',
    label: MAP_LABELS.classic,
    shape: 'ring',
    worldHalf: TRACK_SIZE / 2,
    outerHalf: 23,
    innerHalf: 11,
    roadWidth: 12,
    roadPath: [],
    startPosition: [0, 0.38, 20],
    startYaw: Math.PI / 2,
    terrainAmplitude: 0,
    terrainFrequency: 0,
    gates: createGates(17),
    trees: [
      createTree('classic-t1', -26, -25, 1.15, 'round'),
      createTree('classic-t2', -23, 24, 1.05, 'cone'),
      createTree('classic-t3', 24, -24, 1.2, 'round'),
      createTree('classic-t4', 26, 23, 1.1, 'cone'),
      createTree('classic-t5', -7, -3, 0.95, 'round'),
      createTree('classic-t6', 8, 5, 1, 'round'),
      createTree('classic-t7', -3, 8, 0.9, 'cone'),
      createTree('classic-t8', 6, -7, 0.95, 'cone'),
    ],
  },
  city: {
    id: 'city',
    sourceId: 'city',
    label: MAP_LABELS.city,
    shape: 'ring',
    worldHalf: TRACK_SIZE / 2,
    outerHalf: 24,
    innerHalf: 10,
    roadWidth: 14,
    roadPath: [],
    startPosition: [0, 0.38, 21],
    startYaw: Math.PI / 2,
    terrainAmplitude: 0,
    terrainFrequency: 0,
    gates: createGates(17.5),
    trees: [
      createTree('city-t1', -27, -22, 1.1, 'cone'),
      createTree('city-t2', -27, 22, 1.05, 'cone'),
      createTree('city-t3', 27, -22, 1.1, 'cone'),
      createTree('city-t4', 27, 22, 1.05, 'cone'),
      createTree('city-t5', -5, -2, 0.85, 'round'),
      createTree('city-t6', 5, 2, 0.9, 'round'),
      createTree('city-t7', -2, 5, 0.85, 'round'),
      createTree('city-t8', 2, -5, 0.85, 'round'),
    ],
  },
  meadow: {
    id: 'meadow',
    sourceId: 'meadow',
    label: MAP_LABELS.meadow,
    shape: 'ring',
    worldHalf: TRACK_SIZE / 2,
    outerHalf: 21,
    innerHalf: 12,
    roadWidth: 9,
    roadPath: [],
    startPosition: [0, 0.38, 18],
    startYaw: Math.PI / 2,
    terrainAmplitude: 0,
    terrainFrequency: 0,
    gates: createGates(16),
    trees: [
      createTree('meadow-t1', -25, -24, 1.25, 'round'),
      createTree('meadow-t2', -24, 25, 1.15, 'round'),
      createTree('meadow-t3', 25, -24, 1.2, 'round'),
      createTree('meadow-t4', 24, 25, 1.15, 'round'),
      createTree('meadow-t5', -9, 3, 1, 'cone'),
      createTree('meadow-t6', 9, -3, 1, 'cone'),
      createTree('meadow-t7', -4, -8, 0.92, 'round'),
      createTree('meadow-t8', 4, 8, 0.92, 'round'),
      createTree('meadow-t9', -11, -10, 0.95, 'cone'),
      createTree('meadow-t10', 11, 10, 0.95, 'cone'),
    ],
  },
}

const generateProceduralPath = (seed: number, worldHalf: number) => {
  const rand = mulberry32(seed)
  const points: TrackPoint[] = []
  const count = 20
  const minRadius = worldHalf * 0.44
  const maxRadius = worldHalf * 0.78
  for (let i = 0; i < count; i += 1) {
    const t = i / count
    const jitter = (rand() - 0.5) * 0.34
    const angle = t * Math.PI * 2 + jitter
    const radius = minRadius + rand() * (maxRadius - minRadius)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    points.push([x, z])
  }
  return points
}

const generateProceduralTrees = (seed: number, map: TrackMap) => {
  const rand = mulberry32(seed * 23 + 7)
  const trees: TrackTree[] = []
  const half = map.worldHalf - 3
  const targetCount = 180
  for (let i = 0; i < 1000 && trees.length < targetCount; i += 1) {
    const x = (rand() * 2 - 1) * half
    const z = (rand() * 2 - 1) * half
    if (isPathRoadAt(x, z, map.roadPath, map.roadWidth + 4.2)) {
      continue
    }
    if (Math.hypot(x - map.startPosition[0], z - map.startPosition[2]) < 12) {
      continue
    }
    const scale = 0.82 + rand() * 0.6
    const variant = rand() > 0.46 ? 'round' : 'cone'
    trees.push(createTree(`procedural-tree-${seed}-${trees.length}`, x, z, scale, variant))
  }
  return trees
}

const gateFromPathSegment = (points: TrackPoint[], idx: number): TrackGate => {
  const a = points[idx % points.length]
  const b = points[(idx + 1) % points.length]
  const midX = (a[0] + b[0]) * 0.5
  const midZ = (a[1] + b[1]) * 0.5
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
  return { position: [midX, 0, midZ], rotation: [0, yaw, 0] }
}

const createProceduralMap = (seed: number): TrackMap => {
  const worldHalf = 125
  const roadPath = generateProceduralPath(seed, worldHalf)
  const roadWidth = 7.2
  const start = roadPath[0]
  const next = roadPath[1]
  const startYaw = Math.atan2(next[0] - start[0], next[1] - start[1])

  const map: TrackMap = {
    id: `procedural-${seed}`,
    sourceId: 'procedural',
    label: `${MAP_LABELS.procedural} #${seed % 1000}`,
    shape: 'path',
    worldHalf,
    outerHalf: 0,
    innerHalf: 0,
    roadWidth,
    roadPath,
    startPosition: [start[0], 0.38, start[1]],
    startYaw,
    terrainAmplitude: 7.8,
    terrainFrequency: 0.012,
    gates: [
      gateFromPathSegment(roadPath, 2),
      gateFromPathSegment(roadPath, 6),
      gateFromPathSegment(roadPath, 10),
      gateFromPathSegment(roadPath, 14),
      gateFromPathSegment(roadPath, 18),
    ],
    trees: [],
  }

  map.trees = generateProceduralTrees(seed, map)
  return map
}

export const getTrackMap = (selectedMapId: MapId, proceduralSeed: number): TrackMap => {
  if (selectedMapId === 'procedural') {
    return createProceduralMap(proceduralSeed)
  }
  return fixedMaps[selectedMapId]
}
