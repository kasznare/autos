import type { TrackMap } from '../maps'
import type { Pickup, WorldObstacle } from '../types'

const SPAWN_MARGIN = 4
const MIN_DISTANCE_FROM_PLAYER = 9
const MIN_DISTANCE_FROM_PICKUP = 3.2

export const SPAWN_CHECK_SECONDS = 1.2

export const isSpawnBlocked = (
  x: number,
  z: number,
  playerPosition: [number, number, number],
  existingPickups: Pickup[],
  obstaclesForSpawn: WorldObstacle[],
) => {
  const px = playerPosition[0]
  const pz = playerPosition[2]
  const playerDistance = Math.hypot(x - px, z - pz)
  if (playerDistance < MIN_DISTANCE_FROM_PLAYER) {
    return true
  }

  for (const pickup of existingPickups) {
    const dist = Math.hypot(x - pickup.position[0], z - pickup.position[2])
    if (dist < MIN_DISTANCE_FROM_PICKUP) {
      return true
    }
  }

  for (const obstacle of obstaclesForSpawn) {
    const halfX = obstacle.size[0] / 2 + 1.2
    const halfZ = obstacle.size[2] / 2 + 1.2
    if (Math.abs(x - obstacle.position[0]) < halfX && Math.abs(z - obstacle.position[2]) < halfZ) {
      return true
    }
  }

  return false
}

export const generateSpawnPosition = (
  existingPickups: Pickup[],
  playerPosition: [number, number, number],
  worldHalf: number,
  obstaclesForSpawn: WorldObstacle[],
) => {
  const half = worldHalf - SPAWN_MARGIN
  for (let i = 0; i < 36; i += 1) {
    const x = (Math.random() * 2 - 1) * half
    const z = (Math.random() * 2 - 1) * half
    if (!isSpawnBlocked(x, z, playerPosition, existingPickups, obstaclesForSpawn)) {
      return [x, 0.8, z] as [number, number, number]
    }
  }
  return null
}

export const pickRespawnPoint = (map: TrackMap, usedIds: Set<string>) => {
  const available = map.spawnRules.hazards.destructibles.spawnPoints.filter((_, idx) => !usedIds.has(`p-${idx}`))
  if (available.length === 0) {
    return null
  }
  const point = available[Math.floor(Math.random() * available.length)]
  return point
}

