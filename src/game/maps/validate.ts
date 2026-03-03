import { MAP_SCHEMA_VERSION } from './schema'
import type { TrackMap } from './schema'

const isFinite3 = (value: [number, number, number]) =>
  Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2])

export const validateMapConfig = (map: TrackMap): string[] => {
  const errors: string[] = []
  const idTag = `[${map.id}]`

  if (map.schemaVersion !== MAP_SCHEMA_VERSION) {
    errors.push(`${idTag} unsupported schema version ${map.schemaVersion}`)
  }
  if (!map.label.trim()) {
    errors.push(`${idTag} label is required`)
  }
  if (!isFinite3(map.gravity) || map.gravity[1] >= 0) {
    errors.push(`${idTag} gravity must be finite with negative Y`)
  }
  if (map.worldHalf <= 0 || map.roadWidth <= 0) {
    errors.push(`${idTag} worldHalf and roadWidth must be > 0`)
  }
  if (map.shape === 'ring' && !(map.outerHalf > map.innerHalf && map.innerHalf > 0)) {
    errors.push(`${idTag} ring maps require outerHalf > innerHalf > 0`)
  }
  if (map.shape === 'path' && map.roadPath.length < 3) {
    errors.push(`${idTag} path maps require at least 3 roadPath points`)
  }
  if (map.gates.length === 0) {
    errors.push(`${idTag} at least one gate is required`)
  }

  const withinWorld = (x: number, z: number) => Math.abs(x) <= map.worldHalf && Math.abs(z) <= map.worldHalf

  const pickupIds = new Set<string>()
  map.spawnRules.pickups.initial.forEach((pickup) => {
    if (pickupIds.has(pickup.id)) {
      errors.push(`${idTag} duplicate pickup id ${pickup.id}`)
    }
    pickupIds.add(pickup.id)
    if (!withinWorld(pickup.position[0], pickup.position[2])) {
      errors.push(`${idTag} pickup ${pickup.id} outside world bounds`)
    }
  })

  const destructiblePointIds = new Set<string>()
  map.spawnRules.hazards.destructibles.spawnPoints.forEach((point, idx) => {
    const pointId = `${point[0]}:${point[2]}`
    if (destructiblePointIds.has(pointId)) {
      errors.push(`${idTag} duplicate destructible spawn point at index ${idx}`)
    }
    destructiblePointIds.add(pointId)
    if (!withinWorld(point[0], point[2])) {
      errors.push(`${idTag} destructible spawn point index ${idx} outside world bounds`)
    }
  })
  if (map.spawnRules.hazards.destructibles.initialCount > map.spawnRules.hazards.destructibles.spawnPoints.length) {
    errors.push(`${idTag} destructible initialCount exceeds available spawn points`)
  }
  if (map.spawnRules.hazards.destructibles.palette.length === 0) {
    errors.push(`${idTag} destructible palette cannot be empty`)
  }

  const zoneIds = new Set<string>()
  map.materialZones.forEach((zone) => {
    if (zoneIds.has(zone.id)) {
      errors.push(`${idTag} duplicate material zone id ${zone.id}`)
    }
    zoneIds.add(zone.id)
    if (zone.shape === 'path-band' && zone.width <= 0) {
      errors.push(`${idTag} material zone ${zone.id} path-band width must be > 0`)
    }
    if (zone.shape === 'ring-band' && !(zone.maxHalf > zone.minHalf && zone.minHalf >= 0)) {
      errors.push(`${idTag} material zone ${zone.id} ring-band range is invalid`)
    }
    if (zone.shape === 'circle' && zone.radius <= 0) {
      errors.push(`${idTag} material zone ${zone.id} circle radius must be > 0`)
    }
  })
  if (map.materialZones.length === 0 || map.materialZones[0].shape !== 'global') {
    errors.push(`${idTag} first material zone must be a global fallback`)
  }

  return errors
}

export const assertMapConfigs = (maps: TrackMap[]) => {
  const errors = maps.flatMap((map) => validateMapConfig(map))
  const ids = maps.map((map) => map.id)
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) {
    errors.push('Duplicate map ids detected in map registry')
  }

  if (errors.length > 0) {
    throw new Error(`Map config validation failed:\n${errors.map((line) => `- ${line}`).join('\n')}`)
  }
}
