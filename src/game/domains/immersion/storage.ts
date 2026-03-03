import type { BatterySaverMode } from '../../store/types'

const UI_SETUP_KEY = 'autos.uiSetup.v1'

type PersistedUiSetup = {
  batterySaverMode: BatterySaverMode
  engineMuted: boolean
}

export const DEFAULT_UI_SETUP: PersistedUiSetup = {
  batterySaverMode: 'auto',
  engineMuted: true,
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
