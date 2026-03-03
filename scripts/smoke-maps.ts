import { MAP_ORDER, createInitialDestructibles, getTrackMap, isPointOnRoad, sampleTerrainHeight } from '../src/game/maps'

const seedsByMap: Record<string, number[]> = {
  procedural: [11, 37, 73],
}

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const runSmoke = () => {
  const lines: string[] = []
  for (const mapId of MAP_ORDER) {
    const seeds = seedsByMap[mapId] ?? [1]
    for (const seed of seeds) {
      const map = getTrackMap(mapId, seed)
      const destructibles = createInitialDestructibles(map)

      assert(map.schemaVersion === '2.0.0', `[${map.id}] schema version mismatch`)
      assert(map.gravity[1] < 0, `[${map.id}] gravity should point downward`)
      assert(map.gates.length > 0, `[${map.id}] expected at least one gate`)
      assert(destructibles.length === map.spawnRules.hazards.destructibles.initialCount, `[${map.id}] destructible initial count mismatch`)
      assert(map.spawnRules.pickups.initial.length > 0, `[${map.id}] expected initial pickups`)

      const probePoints: Array<[number, number]> = [
        [0, 0],
        [map.worldHalf * 0.35, map.worldHalf * 0.2],
        [-map.worldHalf * 0.45, map.worldHalf * 0.3],
        [map.startPosition[0], map.startPosition[2]],
      ]
      const heights = probePoints.map(([x, z]) => sampleTerrainHeight(map, x, z))
      const minHeight = Math.min(...heights)
      const maxHeight = Math.max(...heights)

      const onRoadAtStart = isPointOnRoad(map, map.startPosition[0], map.startPosition[2])
      assert(onRoadAtStart, `[${map.id}] start position should be on road`)

      lines.push(
        `${map.id} (seed ${seed}): gravity=${map.gravity.join(',')} terrainRange=${minHeight.toFixed(2)}..${maxHeight.toFixed(2)} pickups=${map.spawnRules.pickups.initial.length} destructibles=${destructibles.length}`,
      )
    }
  }

  console.log('Map smoke checks passed:')
  lines.forEach((line) => console.log(`- ${line}`))
}

runSmoke()
