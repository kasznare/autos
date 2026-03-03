import type { CarProfileId } from './config'
import type { MapId } from './maps'
import type { CollisionMaterial } from './types'

export type SurfaceType = 'road' | 'grass'
export type SpeedBand = 'crawl' | 'cruise' | 'fast' | 'max'

export type ImmersionEventMap = {
  impact: {
    speedMps: number
    material: CollisionMaterial
    hard: boolean
    damageDelta: number
    position?: [number, number, number]
  }
  damage_applied: {
    amount: number
    totalDamage: number
    source: 'impact' | 'scrape'
  }
  vehicle_disabled: {
    totalDamage: number
  }
  terrain_feedback: {
    surface: SurfaceType
    traction: number
    slip: number
    speedKph: number
  }
  speed_feedback: {
    speedKph: number
    band: SpeedBand
  }
  map_loaded: {
    mapId: string
    sourceId: MapId
    shape: 'ring' | 'path'
    terrainAmplitude: number
  }
  build_profile_changed: {
    profile: CarProfileId
    color: string
    engineTone: 'steady' | 'speedy' | 'heavy'
  }
  destructible_event: {
    id: string
    state: 'broken' | 'respawned'
    by: 'player' | 'system'
    position: [number, number, number]
  }
}

type ImmersionListener<K extends keyof ImmersionEventMap> = (payload: ImmersionEventMap[K]) => void

const listeners = new Map<keyof ImmersionEventMap, Set<(payload: unknown) => void>>()

export const emitImmersionEvent = <K extends keyof ImmersionEventMap>(type: K, payload: ImmersionEventMap[K]) => {
  const bucket = listeners.get(type)
  if (!bucket || bucket.size === 0) {
    return
  }

  bucket.forEach((listener) => {
    listener(payload)
  })
}

export const onImmersionEvent = <K extends keyof ImmersionEventMap>(type: K, listener: ImmersionListener<K>) => {
  let bucket = listeners.get(type)
  if (!bucket) {
    bucket = new Set()
    listeners.set(type, bucket)
  }
  bucket.add(listener as (payload: unknown) => void)

  return () => {
    bucket.delete(listener as (payload: unknown) => void)
    if (bucket.size === 0) {
      listeners.delete(type)
    }
  }
}

export const speedBandFromKph = (speedKph: number): SpeedBand => {
  if (speedKph < 12) return 'crawl'
  if (speedKph < 32) return 'cruise'
  if (speedKph < 56) return 'fast'
  return 'max'
}
