import { isPointOnRoad, sampleTerrainHeight, type TrackMap } from '../maps'

export type RuntimeCritter = {
  id: string
  home: [number, number]
  speed: number
  radius: number
  phase: number
  headingOffset: number
  state: 'alive' | 'broken'
  position: [number, number, number]
  respawnAt: number | null
  burstSeed: number
}

const pseudoNoise = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const createCritters = (map: TrackMap, seed: number): RuntimeCritter[] => {
  const result: RuntimeCritter[] = []
  const critterCount = map.spawnRules.hazards.critters.count
  const half = map.worldHalf - 7
  for (let i = 0; i < 1200 && result.length < critterCount; i += 1) {
    const x = (pseudoNoise(seed + i, 301) * 2 - 1) * half
    const z = (pseudoNoise(seed + i, 302) * 2 - 1) * half
    if (isPointOnRoad(map, x, z)) {
      continue
    }
    const y = sampleTerrainHeight(map, x, z) + 0.38
    result.push({
      id: `critter-${seed}-${result.length}`,
      home: [x, z],
      speed: 0.7 + pseudoNoise(seed + i, 303) * 0.8,
      radius: 1 + pseudoNoise(seed + i, 304) * 2.6,
      phase: pseudoNoise(seed + i, 305) * Math.PI * 2,
      headingOffset: pseudoNoise(seed + i, 306) * 1.6,
      state: 'alive',
      position: [x, y, z],
      respawnAt: null,
      burstSeed: i,
    })
  }
  return result
}

