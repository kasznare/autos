import type { BatterySaverMode } from '../store/types'

export type QualityTier = 'low' | 'medium' | 'high'

export type QualityConfig = {
  tier: QualityTier
  dpr: [number, number]
  antialias: boolean
  powerPreference: WebGLPowerPreference
  shadows: false | 'soft'
  directionalShadowMapSize: [number, number]
  enableEnvironment: boolean
  enableContactShadows: boolean
  terrainSegments: number
  roadsideDensity: number
  trafficUpdateHz: number
  critterUpdateHz: number
  critterCullDistance: number
}

export type RenderPerfTelemetry = {
  fps: number
  frameMsAvg: number
  frameMsWorst: number
  drawCalls: number
  triangles: number
  gpuHotspot: 'none' | 'draw-calls' | 'geometry' | 'particles'
}

const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    dpr: [1, 1.8],
    antialias: true,
    powerPreference: 'high-performance',
    shadows: 'soft',
    directionalShadowMapSize: [1024, 1024],
    enableEnvironment: true,
    enableContactShadows: true,
    terrainSegments: 280,
    roadsideDensity: 1,
    trafficUpdateHz: 50,
    critterUpdateHz: 45,
    critterCullDistance: 180,
  },
  medium: {
    tier: 'medium',
    dpr: [0.95, 1.35],
    antialias: false,
    powerPreference: 'low-power',
    shadows: false,
    directionalShadowMapSize: [512, 512],
    enableEnvironment: false,
    enableContactShadows: false,
    terrainSegments: 180,
    roadsideDensity: 0.7,
    trafficUpdateHz: 35,
    critterUpdateHz: 25,
    critterCullDistance: 125,
  },
  low: {
    tier: 'low',
    dpr: [0.75, 1.05],
    antialias: false,
    powerPreference: 'low-power',
    shadows: false,
    directionalShadowMapSize: [256, 256],
    enableEnvironment: false,
    enableContactShadows: false,
    terrainSegments: 120,
    roadsideDensity: 0.45,
    trafficUpdateHz: 25,
    critterUpdateHz: 16,
    critterCullDistance: 90,
  },
}

export const deriveQualityTier = ({
  batterySaverMode,
  touchDevice,
  frameMsAvg,
}: {
  batterySaverMode: BatterySaverMode
  touchDevice: boolean
  frameMsAvg: number
}): QualityTier => {
  if (batterySaverMode === 'on') return 'low'
  if (batterySaverMode === 'auto' && touchDevice) return 'low'
  if (frameMsAvg > 19) return 'low'
  if (frameMsAvg > 15) return 'medium'
  return 'high'
}

export const getQualityConfig = (tier: QualityTier) => QUALITY_PRESETS[tier]

export const detectGpuHotspot = ({
  drawCalls,
  triangles,
  points,
}: {
  drawCalls: number
  triangles: number
  points: number
}): RenderPerfTelemetry['gpuHotspot'] => {
  if (drawCalls > 220) return 'draw-calls'
  if (triangles > 700000) return 'geometry'
  if (points > 10000) return 'particles'
  return 'none'
}

