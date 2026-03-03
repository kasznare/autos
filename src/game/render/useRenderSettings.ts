import { useMemo } from 'react'
import { useGameStore } from '../store'
import { resolveRenderSettings } from './settings'

export const useRenderSettings = () => {
  const renderMode = useGameStore((state) => state.renderMode)
  const renderQualityTier = useGameStore((state) => state.renderQualityTier)
  const renderWireframe = useGameStore((state) => state.renderWireframe)
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)

  return useMemo(
    () =>
      resolveRenderSettings({
        renderMode,
        renderQualityTier,
        renderWireframe,
        batterySaverMode,
      }),
    [batterySaverMode, renderMode, renderQualityTier, renderWireframe],
  )
}
