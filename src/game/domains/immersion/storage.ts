import type { BatterySaverMode, RenderMode, RenderQualityTier } from '../../store/types'

const UI_SETUP_KEY = 'autos.uiSetup.v1'

type PersistedUiSetup = {
  batterySaverMode: BatterySaverMode
  engineMuted: boolean
  renderMode: RenderMode
  renderQualityTier: RenderQualityTier
  renderWireframe: boolean
}

export const DEFAULT_UI_SETUP: PersistedUiSetup = {
  batterySaverMode: 'auto',
  engineMuted: true,
  renderMode: 'pretty',
  renderQualityTier: 'high',
  renderWireframe: false,
}

const safeParse = <T,>(value: string | null): T | null => {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const isBatterySaverMode = (value: unknown): value is BatterySaverMode => value === 'auto' || value === 'on' || value === 'off'
const isRenderMode = (value: unknown): value is RenderMode => value === 'flat-debug' || value === 'pretty'
const isRenderQualityTier = (value: unknown): value is RenderQualityTier =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'ultra'

export const getInitialUiSetup = (): PersistedUiSetup => {
  if (typeof window === 'undefined') {
    return DEFAULT_UI_SETUP
  }
  const parsed = safeParse<PersistedUiSetup>(window.localStorage.getItem(UI_SETUP_KEY))
  if (!parsed) {
    return DEFAULT_UI_SETUP
  }
  return {
    batterySaverMode: isBatterySaverMode(parsed.batterySaverMode) ? parsed.batterySaverMode : 'auto',
    engineMuted: typeof parsed.engineMuted === 'boolean' ? parsed.engineMuted : true,
    renderMode: isRenderMode(parsed.renderMode) ? parsed.renderMode : DEFAULT_UI_SETUP.renderMode,
    renderQualityTier: isRenderQualityTier(parsed.renderQualityTier) ? parsed.renderQualityTier : DEFAULT_UI_SETUP.renderQualityTier,
    renderWireframe: typeof parsed.renderWireframe === 'boolean' ? parsed.renderWireframe : DEFAULT_UI_SETUP.renderWireframe,
  }
}

export const persistUiSetup = (setup: PersistedUiSetup) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(UI_SETUP_KEY, JSON.stringify(setup))
}

export const resetUiSetupStorage = () => {
  persistUiSetup(DEFAULT_UI_SETUP)
}
