import type { Pickup, WorldObstacle } from '../types'

export const MAP_SCHEMA_VERSION = '3.0.0' as const

export type MapSchemaVersion = typeof MAP_SCHEMA_VERSION

export type MapId =
  | 'orbital'
  | 'gaia'
  | 'titan'
  | 'ramp'
  | 'procedural'
  | 'test-flat'
  | 'test-slope'
  | 'test-curve'
export type MapShape = 'ring' | 'path'
export type SurfaceMaterial = 'asphalt' | 'regolith' | 'ice' | 'basalt' | 'dust'
export type TerrainProfile = 'flat' | 'rolling' | 'craggy'
export type MapInteractableCollider = 'fixed' | 'dynamic' | 'none'
export type MapEnvironmentKind = 'sun' | 'cloud' | 'bird'

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

export type MapInteractable = {
  id: string
  kind: 'block' | 'crate' | 'ramp' | 'tower' | 'barrier'
  position: [number, number, number]
  size: [number, number, number]
  rotation?: [number, number, number]
  material: 'soft' | 'medium' | 'hard'
  collider: MapInteractableCollider
  color: string
}

export type MapEnvironmentObject = {
  id: string
  kind: MapEnvironmentKind
  position: [number, number, number]
  scale: number
  color: string
  speed?: number
}

export type MaterialZone =
  | {
      id: string
      material: SurfaceMaterial
      shape: 'global'
    }
  | {
      id: string
      material: SurfaceMaterial
      shape: 'ring-band'
      minHalf: number
      maxHalf: number
    }
  | {
      id: string
      material: SurfaceMaterial
      shape: 'path-band'
      width: number
    }
  | {
      id: string
      material: SurfaceMaterial
      shape: 'circle'
      center: [number, number]
      radius: number
    }

export type MaterialTuning = {
  tractionMultiplier: number
  dragMultiplier: number
  topSpeedMultiplier: number
}

export type SpawnRules = {
  pickups: {
    initial: Pickup[]
    minCounts: {
      star: number
      repair: number
      part: number
    }
    bonusRepairChance: number
    bonusPartChance: number
  }
  hazards: {
    critters: {
      enabled: boolean
      count: number
      breakSpeed: number
      hitRadius: number
      hitCheckInterval: number
      respawnSeconds: number
    }
    destructibles: {
      initialCount: number
      spawnPoints: [number, number, number][]
      breakSpeed: number
      respawnSeconds: number
      palette: string[]
    }
  }
  obstacles: {
    static: WorldObstacle[]
    movable: WorldObstacle[]
  }
}

export type TrackMap = {
  schemaVersion: MapSchemaVersion
  id: MapId | `procedural-${number}`
  sourceId: MapId
  label: string
  shape: MapShape
  worldHalf: number
  outerHalf: number
  innerHalf: number
  roadWidth: number
  laneCount: number
  laneWidth: number
  detailDensity: number
  roadPath: TrackPoint[]
  startPosition: [number, number, number]
  startYaw: number
  gravity: [number, number, number]
  terrain: {
    profile: TerrainProfile
    amplitude: number
    frequency: number
  }
  materialZones: MaterialZone[]
  materialTuning: Partial<Record<SurfaceMaterial, MaterialTuning>>
  spawnRules: SpawnRules
  gates: TrackGate[]
  trees: TrackTree[]
  interactables: MapInteractable[]
  environmentObjects: MapEnvironmentObject[]
}
