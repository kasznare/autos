import type { BatterySaverMode, RenderMode, RenderQualityTier } from '../store/types'

type TierConfig = {
  terrainSegments: number
  roadTextureResolution: number
  detailDensity: number
  roadNearDistance: number
  terrainNearDistance: number
}

const TIER_CONFIGS: Record<RenderQualityTier, TierConfig> = {
  low: {
    terrainSegments: 120,
    roadTextureResolution: 384,
    detailDensity: 0.5,
    roadNearDistance: 16,
    terrainNearDistance: 18,
  },
  medium: {
    terrainSegments: 180,
    roadTextureResolution: 640,
    detailDensity: 0.78,
    roadNearDistance: 24,
    terrainNearDistance: 26,
  },
  high: {
    terrainSegments: 260,
    roadTextureResolution: 960,
    detailDensity: 1,
    roadNearDistance: 34,
    terrainNearDistance: 36,
  },
  ultra: {
    terrainSegments: 320,
    roadTextureResolution: 1280,
    detailDensity: 1.2,
    roadNearDistance: 44,
    terrainNearDistance: 46,
  },
}

const reduceTierForLowEnd = (tier: RenderQualityTier): RenderQualityTier => {
  if (tier === 'ultra' || tier === 'high') return 'medium'
  if (tier === 'medium') return 'low'
  return 'low'
}

export type RenderSettingsState = {
  renderMode: RenderMode
  renderQualityTier: RenderQualityTier
  renderWireframe: boolean
  batterySaverMode: BatterySaverMode
}

export type ResolvedRenderSettings = {
  mode: RenderMode
  qualityTier: RenderQualityTier
  effectiveTier: RenderQualityTier
  wireframe: boolean
  lowEnd: boolean
  terrainSegments: number
  roadTextureResolution: number
  detailDensity: number
  roadNearDistance: number
  terrainNearDistance: number
  sky: {
    horizonColor: string
    zenithColor: string
  }
}

export const resolveRenderSettings = (state: RenderSettingsState): ResolvedRenderSettings => {
  const lowEnd = state.renderMode === 'flat-debug' || state.batterySaverMode === 'on'
  const effectiveTier = lowEnd ? reduceTierForLowEnd(state.renderQualityTier) : state.renderQualityTier
  const tier = TIER_CONFIGS[effectiveTier]

  if (state.renderMode === 'flat-debug') {
    return {
      mode: state.renderMode,
      qualityTier: state.renderQualityTier,
      effectiveTier,
      wireframe: state.renderWireframe,
      lowEnd,
      terrainSegments: Math.max(80, Math.round(tier.terrainSegments * 0.65)),
      roadTextureResolution: Math.max(256, Math.round(tier.roadTextureResolution * 0.45)),
      detailDensity: 0.18,
      roadNearDistance: 999,
      terrainNearDistance: 999,
      sky: {
        horizonColor: '#9ab7c4',
        zenithColor: '#b6d0dc',
      },
    }
  }

  return {
    mode: state.renderMode,
    qualityTier: state.renderQualityTier,
    effectiveTier,
    wireframe: false,
    lowEnd,
    terrainSegments: tier.terrainSegments,
    roadTextureResolution: tier.roadTextureResolution,
    detailDensity: tier.detailDensity,
    roadNearDistance: tier.roadNearDistance,
    terrainNearDistance: tier.terrainNearDistance,
    sky: {
      horizonColor: '#dff4ff',
      zenithColor: '#79c6eb',
    },
  }
}
