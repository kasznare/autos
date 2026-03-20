import type { DestructibleProp } from '../types'
import { FIXED_MAPS, getTestSlopeHeight } from './data'
import type { MapId, MaterialTuning, SurfaceMaterial, TrackMap, TrackPoint } from './schema'
import { assertMapConfigs } from './validate'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const smoothStep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

const normalizeAngleDelta = (angle: number) => {
  let wrapped = angle
  while (wrapped > Math.PI) wrapped -= Math.PI * 2
  while (wrapped < -Math.PI) wrapped += Math.PI * 2
  return wrapped
}

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

const isRoadRingAt = (x: number, z: number, outerHalf: number, innerHalf: number) =>
  Math.abs(x) <= outerHalf &&
  Math.abs(z) <= outerHalf &&
  !(Math.abs(x) < innerHalf && Math.abs(z) < innerHalf)

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

const isPathRoadAt = (x: number, z: number, points: TrackPoint[], roadWidth: number) => {
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

export const isPointOnRoad = (map: TrackMap, x: number, z: number) => {
  if (map.shape === 'ring') {
    return isRoadRingAt(x, z, map.outerHalf, map.innerHalf)
  }
  return isPathRoadAt(x, z, map.roadPath, map.roadWidth)
}

export const isPointNearRoad = (map: TrackMap, x: number, z: number, margin = 0) => {
  if (map.shape === 'ring') {
    const half = Math.max(Math.abs(x), Math.abs(z))
    return half >= map.innerHalf - margin && half <= map.outerHalf + margin
  }
  return getPathRoadProximity(x, z, map.roadPath).distance <= map.roadWidth * 0.5 + margin
}

const materialZoneContainsPoint = (map: TrackMap, x: number, z: number, zone: TrackMap['materialZones'][number]) => {
  if (zone.shape === 'global') {
    return true
  }
  if (zone.shape === 'circle') {
    return Math.hypot(x - zone.center[0], z - zone.center[1]) <= zone.radius
  }
  if (zone.shape === 'ring-band') {
    const half = Math.max(Math.abs(x), Math.abs(z))
    return half >= zone.minHalf && half <= zone.maxHalf
  }
  const pathInfo = getPathRoadProximity(x, z, map.roadPath)
  return pathInfo.distance <= zone.width * 0.5
}

export const getSurfaceMaterialAt = (map: TrackMap, x: number, z: number): SurfaceMaterial => {
  let material: SurfaceMaterial = 'dust'
  for (const zone of map.materialZones) {
    if (materialZoneContainsPoint(map, x, z, zone)) {
      material = zone.material
    }
  }
  return material
}

const DEFAULT_MATERIAL_TUNING: MaterialTuning = {
  tractionMultiplier: 1,
  dragMultiplier: 1,
  topSpeedMultiplier: 1,
}

export const getMaterialTuningAt = (map: TrackMap, x: number, z: number): MaterialTuning => {
  const material = getSurfaceMaterialAt(map, x, z)
  return map.materialTuning[material] ?? DEFAULT_MATERIAL_TUNING
}

export const sampleTerrainHeight = (map: TrackMap, x: number, z: number) => {
  if (map.sourceId === 'ramp') {
    const climbRange = Math.max(1, map.worldHalf - 8)
    const inclineT = Math.max(-1, Math.min(1, z / climbRange))
    return inclineT * map.terrain.amplitude
  }
  if (map.sourceId === 'test-slope') {
    return getTestSlopeHeight(map.worldHalf, map.terrain.amplitude, z)
  }
  if (map.terrain.amplitude <= 0) {
    return 0
  }
  const f = map.terrain.frequency
  const base = Math.sin(x * f) * 0.6 + Math.cos(z * f * 1.08) * 0.55
  const cross = Math.sin((x + z) * f * 0.6) * 0.42
  let height = (base + cross) * map.terrain.amplitude
  if (map.shape === 'path') {
    const ridgeA = Math.abs(Math.sin(x * f * 1.6) * Math.cos(z * f * 1.2))
    const ridgeB = Math.abs(Math.sin((x - z) * f * 0.86))
    const mountain = (ridgeA * 0.9 + ridgeB * 0.7) * map.terrain.amplitude * 0.96
    height += mountain
    const roadInfo = getPathRoadProximity(x, z, map.roadPath)
    const sideSlopeRange = map.roadWidth * 2.2
    const laneCoreStart = map.roadWidth * 0.9
    const laneCoreEnd = map.roadWidth * 1.9
    const laneCoreBlend = 1 - smoothStep(laneCoreStart, laneCoreEnd, roadInfo.distance)
    const sideSlopeFade = smoothStep(map.roadWidth * 0.95, sideSlopeRange, roadInfo.distance)
    const sideSlopeNorm = Math.max(-1, Math.min(1, roadInfo.signedDistance / Math.max(0.001, map.roadWidth * 0.9)))
    const sideSlope = sideSlopeNorm * map.terrain.amplitude * 0.045 * sideSlopeFade
    const startDistance = Math.hypot(x - map.startPosition[0], z - map.startPosition[2])
    const startFlatBlend = 1 - smoothStep(map.roadWidth * 1.1, map.roadWidth * 4.8, startDistance)
    const startRoadBase =
      (Math.sin(map.startPosition[0] * f * 0.19) * 0.55 +
        Math.cos(map.startPosition[2] * f * 0.17) * 0.45 +
        Math.sin((map.startPosition[0] + map.startPosition[2]) * f * 0.12) * 0.35) *
      map.terrain.amplitude *
      0.06
    const roadBase =
      (Math.sin(x * f * 0.19) * 0.55 + Math.cos(z * f * 0.17) * 0.45 + Math.sin((x + z) * f * 0.12) * 0.35) *
        map.terrain.amplitude *
        0.06 +
      sideSlope
    const flattenStart = map.roadWidth * 0.55
    const flattenEnd = map.roadWidth * 5.2
    const blend = smoothStep(flattenStart, flattenEnd, roadInfo.distance)
    const flattened = roadBase + (height - roadBase) * blend
    height = roadBase + (flattened - roadBase) * (1 - laneCoreBlend * 0.92)
    height = startRoadBase + (height - startRoadBase) * (1 - startFlatBlend * 0.94)
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

const wrapPathIndex = (points: TrackPoint[], idx: number) => ((idx % points.length) + points.length) % points.length

const getPathDirection = (points: TrackPoint[], idx: number) => {
  const a = points[wrapPathIndex(points, idx)]
  const b = points[wrapPathIndex(points, idx + 1)]
  return Math.atan2(b[0] - a[0], b[1] - a[1])
}

const getPathSegmentLength = (points: TrackPoint[], idx: number) => {
  const a = points[wrapPathIndex(points, idx)]
  const b = points[wrapPathIndex(points, idx + 1)]
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

const smoothProceduralPath = (points: TrackPoint[]) =>
  points.map((point, idx, arr) => {
    const prev = arr[(idx - 1 + arr.length) % arr.length]
    const next = arr[(idx + 1) % arr.length]
    return [
      point[0] * 0.52 + (prev[0] + next[0]) * 0.24,
      point[1] * 0.52 + (prev[1] + next[1]) * 0.24,
    ] as TrackPoint
  })

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
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
  }
  return smoothProceduralPath(smoothProceduralPath(points))
}

const getBestProceduralStartSegment = (points: TrackPoint[]) => {
  let bestIndex = 0
  let bestScore = Number.NEGATIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    const turnIn = Math.abs(normalizeAngleDelta(getPathDirection(points, i) - getPathDirection(points, i - 1)))
    const turnOut = Math.abs(normalizeAngleDelta(getPathDirection(points, i + 1) - getPathDirection(points, i)))
    const segmentLength = getPathSegmentLength(points, i)
    const score = segmentLength * 0.55 - Math.max(turnIn, turnOut) * 68 - (turnIn + turnOut) * 14
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestIndex
}

const createTree = (id: string, x: number, z: number, scale: number, variant: 'round' | 'cone') => ({
  id,
  position: [x, 0, z] as [number, number, number],
  scale,
  variant,
})

const generateProceduralTrees = (seed: number, map: TrackMap) => {
  const rand = mulberry32(seed * 23 + 7)
  const trees = []
  const half = map.worldHalf - 3
  const targetCount = 220
  for (let i = 0; i < 1200 && trees.length < targetCount; i += 1) {
    const x = (rand() * 2 - 1) * half
    const z = (rand() * 2 - 1) * half
    if (isPointNearRoad(map, x, z, 2.1)) {
      continue
    }
    if (Math.hypot(x - map.startPosition[0], z - map.startPosition[2]) < 14) {
      continue
    }
    trees.push(createTree(`procedural-tree-${seed}-${trees.length}`, x, z, 0.82 + rand() * 0.6, rand() > 0.46 ? 'round' : 'cone'))
  }
  return trees
}

const generateProceduralInteractables = (seed: number, map: TrackMap) => {
  const rand = mulberry32(seed * 11 + 17)
  const interactables: TrackMap['interactables'] = []
  for (let i = 0; i < 180 && interactables.length < 28; i += 1) {
    const x = (rand() * 2 - 1) * (map.worldHalf - 14)
    const z = (rand() * 2 - 1) * (map.worldHalf - 14)
    const asRamp = rand() > 0.64
    const size: [number, number, number] = asRamp ? [7.8, 1.05, 3.8] : [1, 1, 1]
    const roadClearance = Math.hypot(size[0] * 0.5, size[2] * 0.5) + 1.6
    const startClearance = 12 + roadClearance
    if (isPointNearRoad(map, x, z, roadClearance)) {
      continue
    }
    if (Math.hypot(x - map.startPosition[0], z - map.startPosition[2]) < startClearance) {
      continue
    }
    interactables.push({
      id: `proc-int-${seed}-${interactables.length}`,
      kind: asRamp ? 'ramp' : 'crate',
      position: [x, asRamp ? 0.56 : 0.52, z],
      size,
      rotation: asRamp ? [0, rand() * Math.PI * 2, 0] : undefined,
      material: asRamp ? 'medium' : 'soft',
      collider: asRamp ? 'fixed' : 'dynamic',
      color: asRamp ? '#b88958' : '#c58f45',
    })
  }
  return interactables
}

const gateFromPathSegment = (points: TrackPoint[], idx: number) => {
  const a = points[idx % points.length]
  const b = points[(idx + 1) % points.length]
  const midX = (a[0] + b[0]) * 0.5
  const midZ = (a[1] + b[1]) * 0.5
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
  return { position: [midX, 0, midZ] as [number, number, number], rotation: [0, yaw, 0] as [number, number, number] }
}

const createProceduralMap = (seed: number): TrackMap => {
  const worldHalf = 145
  const roadPath = generateProceduralPath(seed, worldHalf)
  const roadWidth = 10
  const laneCount = 2
  const startSegmentIndex = getBestProceduralStartSegment(roadPath)
  const startSegmentStart = roadPath[startSegmentIndex]
  const startSegmentEnd = roadPath[(startSegmentIndex + 1) % roadPath.length]
  const startT = 0.12
  const startPoint: TrackPoint = [
    startSegmentStart[0] + (startSegmentEnd[0] - startSegmentStart[0]) * startT,
    startSegmentStart[1] + (startSegmentEnd[1] - startSegmentStart[1]) * startT,
  ]
  const startYaw = Math.atan2(startSegmentEnd[0] - startSegmentStart[0], startSegmentEnd[1] - startSegmentStart[1])
  const pathPoint = (offset: number) => roadPath[wrapPathIndex(roadPath, startSegmentIndex + offset)]

  const map: TrackMap = {
    schemaVersion: '3.0.0',
    id: `procedural-${seed}`,
    sourceId: 'procedural',
    label: `Nebula Loop #${seed % 1000}`,
    shape: 'path',
    worldHalf,
    outerHalf: 0,
    innerHalf: 0,
    roadWidth,
    laneCount,
    laneWidth: roadWidth / laneCount,
    detailDensity: 2.6,
    roadPath,
    startPosition: [startPoint[0], 0.38, startPoint[1]],
    startYaw,
    gravity: [0, -7.8, 0],
    terrain: {
      profile: 'craggy',
      amplitude: 8.4,
      frequency: 0.011,
    },
    materialZones: [
      { id: 'global-dust', shape: 'global', material: 'dust' },
      { id: 'track-regolith', shape: 'path-band', material: 'regolith', width: 11.4 },
      { id: 'ice-sling', shape: 'circle', material: 'ice', center: [roadPath[5][0], roadPath[5][1]], radius: 8.5 },
    ],
    materialTuning: {
      regolith: { tractionMultiplier: 0.94, dragMultiplier: 1.07, topSpeedMultiplier: 0.98 },
      dust: { tractionMultiplier: 0.82, dragMultiplier: 1.16, topSpeedMultiplier: 0.94 },
      ice: { tractionMultiplier: 0.56, dragMultiplier: 0.88, topSpeedMultiplier: 1.03 },
    },
    spawnRules: {
      pickups: {
        initial: [
          { id: 's-1', position: [pathPoint(3)[0], 0.8, pathPoint(3)[1]], type: 'star' },
          { id: 's-2', position: [pathPoint(7)[0], 0.8, pathPoint(7)[1]], type: 'star' },
          { id: 's-3', position: [pathPoint(11)[0], 0.8, pathPoint(11)[1]], type: 'star' },
          { id: 'r-1', position: [pathPoint(15)[0], 0.8, pathPoint(15)[1]], type: 'repair' },
          { id: 'p-1', position: [pathPoint(19)[0], 0.8, pathPoint(19)[1]], type: 'part' },
        ],
        minCounts: { star: 5, repair: 3, part: 2 },
        bonusRepairChance: 0.45,
        bonusPartChance: 0.35,
      },
      hazards: {
        critters: {
          enabled: true,
          count: 8,
          breakSpeed: 3.2,
          hitRadius: 1.05,
          hitCheckInterval: 0.08,
          respawnSeconds: 4.2,
        },
        destructibles: {
          initialCount: 5,
          spawnPoints: [
            [pathPoint(4)[0], 0.7, pathPoint(4)[1]],
            [pathPoint(6)[0], 0.7, pathPoint(6)[1]],
            [pathPoint(8)[0], 0.7, pathPoint(8)[1]],
            [pathPoint(10)[0], 0.7, pathPoint(10)[1]],
            [pathPoint(12)[0], 0.7, pathPoint(12)[1]],
            [pathPoint(14)[0], 0.7, pathPoint(14)[1]],
            [pathPoint(16)[0], 0.7, pathPoint(16)[1]],
            [pathPoint(18)[0], 0.7, pathPoint(18)[1]],
          ],
          breakSpeed: 6.5,
          respawnSeconds: 3.2,
          palette: ['#d39d58', '#be8744', '#c19352', '#9d7241'],
        },
      },
      obstacles: {
        static: [],
        movable: [],
      },
    },
    gates: [
      gateFromPathSegment(roadPath, startSegmentIndex + 2),
      gateFromPathSegment(roadPath, startSegmentIndex + 6),
      gateFromPathSegment(roadPath, startSegmentIndex + 10),
      gateFromPathSegment(roadPath, startSegmentIndex + 14),
      gateFromPathSegment(roadPath, startSegmentIndex + 18),
    ],
    trees: [],
    interactables: [],
    environmentObjects: [
      { id: 'proc-sun', kind: 'sun', position: [84, 82, -38], scale: 9.1, color: '#ffd483' },
      { id: 'proc-cloud-a', kind: 'cloud', position: [-36, 56, -92], scale: 1.8, color: '#f3f9ff', speed: 0.62 },
      { id: 'proc-cloud-b', kind: 'cloud', position: [58, 52, 68], scale: 1.45, color: '#eaf5ff', speed: 0.45 },
      { id: 'proc-bird-a', kind: 'bird', position: [0, 39, 0], scale: 1.2, color: '#2f3b4b', speed: 1.52 },
      { id: 'proc-bird-b', kind: 'bird', position: [-26, 35, 39], scale: 1.04, color: '#334153', speed: 1.26 },
    ],
  }

  map.trees = generateProceduralTrees(seed, map)
  map.interactables = generateProceduralInteractables(seed, map)
  return map
}

assertMapConfigs(Object.values(FIXED_MAPS))

export const getTrackMap = (selectedMapId: MapId, proceduralSeed: number): TrackMap => {
  if (selectedMapId === 'procedural') {
    const procedural = createProceduralMap(proceduralSeed)
    assertMapConfigs([procedural])
    return procedural
  }
  return FIXED_MAPS[selectedMapId]
}

export const createInitialDestructibles = (map: TrackMap): DestructibleProp[] => {
  const { initialCount, spawnPoints, palette } = map.spawnRules.hazards.destructibles
  return spawnPoints.slice(0, initialCount).map((position, index) => ({
    id: `d-${index + 1}`,
    position,
    color: palette[index % palette.length],
  }))
}

export const getRoadDetailCount = (map: TrackMap) =>
  Math.max(24, Math.round((map.shape === 'path' ? 160 : 70) * map.detailDensity))

export const getLaneOffset = (map: TrackMap, laneIndex: number) => {
  const count = Math.max(1, map.laneCount)
  const laneWidth = map.laneWidth > 0 ? map.laneWidth : map.roadWidth / count
  return (laneIndex - (count - 1) / 2) * laneWidth
}

export const getRingLaneGuideHalfSizes = (map: TrackMap) => {
  if (map.shape !== 'ring' || map.laneCount <= 1) {
    return []
  }
  const laneWidth = Math.max(0.2, map.laneWidth)
  const guides: number[] = []
  for (let i = 1; i < map.laneCount; i += 1) {
    guides.push(map.innerHalf + laneWidth * i)
  }
  return guides
}
