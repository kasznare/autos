import { isPointOnRoad, type TrackMap } from '../maps'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export const TRAFFIC_CAR_COUNT = 4

export const buildTrafficPath = (map: TrackMap): [number, number][] => {
  if (map.shape === 'path' && map.roadPath.length >= 3) {
    return map.roadPath
  }
  const mid = (map.outerHalf + map.innerHalf) * 0.5
  return [
    [-mid, -mid],
    [mid, -mid],
    [mid, mid],
    [-mid, mid],
  ]
}

export const getLoopLength = (points: [number, number][]) => {
  if (points.length < 2) return 1
  let length = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    length += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return Math.max(1, length)
}

export const sampleLoop = (points: [number, number][], tRaw: number) => {
  if (points.length < 2) {
    return { x: 0, z: 0, yaw: 0 }
  }
  const t = ((tRaw % 1) + 1) % 1
  const total = getLoopLength(points)
  let target = t * total
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (target <= segLen) {
      const alpha = clamp01(target / Math.max(0.0001, segLen))
      const x = a[0] + (b[0] - a[0]) * alpha
      const z = a[1] + (b[1] - a[1]) * alpha
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
      return { x, z, yaw }
    }
    target -= segLen
  }
  const a = points[points.length - 1]
  const b = points[0]
  return { x: a[0], z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }
}

export const sampleLoopWithOffset = (points: [number, number][], tRaw: number, laneOffset: number) => {
  const base = sampleLoop(points, tRaw)
  const nx = Math.cos(base.yaw)
  const nz = -Math.sin(base.yaw)
  return {
    x: base.x + nx * laneOffset,
    z: base.z + nz * laneOffset,
    yaw: base.yaw,
  }
}

export const getClosestProgressOnLoop = (points: [number, number][], x: number, z: number) => {
  if (points.length < 2) {
    return { progress: 0, distance: Infinity }
  }
  const total = getLoopLength(points)
  let walked = 0
  let bestDistance = Infinity
  let bestProgress = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const apx = x - a[0]
    const apz = z - a[1]
    const segLenSq = abx * abx + abz * abz
    const segLen = Math.sqrt(segLenSq)
    if (segLen <= 0.0001) {
      continue
    }
    const t = clamp01((apx * abx + apz * abz) / segLenSq)
    const cx = a[0] + abx * t
    const cz = a[1] + abz * t
    const dist = Math.hypot(x - cx, z - cz)
    if (dist < bestDistance) {
      bestDistance = dist
      bestProgress = (walked + segLen * t) / total
    }
    walked += segLen
  }
  return { progress: ((bestProgress % 1) + 1) % 1, distance: bestDistance }
}

export const createTrafficProgresses = (points: [number, number][], startProgress: number, count: number, clearanceMeters = 38) => {
  if (count <= 0) {
    return []
  }
  const loopLength = getLoopLength(points)
  const blockedFraction = Math.min(0.32, clearanceMeters / Math.max(1, loopLength))
  const availableFraction = Math.max(0.08, 1 - blockedFraction)
  return Array.from({ length: count }, (_, idx) => {
    const progress = startProgress + blockedFraction * 0.5 + ((idx + 0.5) / count) * availableFraction
    return ((progress % 1) + 1) % 1
  })
}

export const isPlayerOnTrafficPath = (map: TrackMap, x: number, z: number, laneDistance: number) =>
  isPointOnRoad(map, x, z) && laneDistance <= map.roadWidth * 0.6
