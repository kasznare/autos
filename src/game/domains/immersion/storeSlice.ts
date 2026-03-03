import { createInitialPhysicsDebugTelemetryV2 } from '../../physics'
import type { RenderPerfTelemetry } from '../../systems/performance'
import type { SliceCreator, UiSlice } from '../../store/types'
import { DEFAULT_UI_SETUP, getInitialUiSetup, persistUiSetup, resetUiSetupStorage } from './storage'

const initialUiSetup = getInitialUiSetup()
const initialRenderPerf: RenderPerfTelemetry = {
  fps: 0,
  frameMsAvg: 0,
  frameMsWorst: 0,
  drawCalls: 0,
  triangles: 0,
  gpuHotspot: 'none',
}

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
  speedKph: 0,
  steeringDeg: 0,
  qualityTier: 'high',
  engineMuted: initialUiSetup.engineMuted,
  batterySaverMode: initialUiSetup.batterySaverMode,
  hitFxToken: 0,
  hitFxStrength: 0,
  lastHitLabel: '',
  physicsTelemetry: createInitialPhysicsDebugTelemetryV2(),
  renderPerf: initialRenderPerf,
  toggleEngineMuted: () =>
    set((state) => {
      const nextEngineMuted = !state.engineMuted
      persistUiSetup({ batterySaverMode: state.batterySaverMode, engineMuted: nextEngineMuted })
      return {
        ...state,
        engineMuted: nextEngineMuted,
      }
    }),
  setEngineMuted: (muted) =>
    set((state) => {
      persistUiSetup({ batterySaverMode: state.batterySaverMode, engineMuted: muted })
      return {
        ...state,
        engineMuted: muted,
      }
    }),
  setBatterySaverMode: (mode) =>
    set((state) => {
      persistUiSetup({ batterySaverMode: mode, engineMuted: state.engineMuted })
      return {
        ...state,
        batterySaverMode: mode,
      }
    }),
  setQualityTier: (tier) =>
    set((state) => ({
      ...state,
      qualityTier: tier,
    })),
  resetUiSetup: () =>
    set((state) => {
      resetUiSetupStorage()
      return {
        ...state,
        batterySaverMode: DEFAULT_UI_SETUP.batterySaverMode,
        engineMuted: DEFAULT_UI_SETUP.engineMuted,
      }
    }),
  triggerHitFx: (strength, label = '') =>
    set((state) => ({
      ...state,
      hitFxToken: state.hitFxToken + 1,
      hitFxStrength: Math.max(0.15, Math.min(1, strength)),
      lastHitLabel: label,
    })),
  setTelemetry: (speedKph, steeringDeg) =>
    set((state) => ({
      ...state,
      speedKph,
      steeringDeg,
    })),
  setPhysicsTelemetry: (next) =>
    set((state) => ({
      ...state,
      physicsTelemetry: {
        ...state.physicsTelemetry,
        ...next,
      },
    })),
  setRenderPerfTelemetry: (next) =>
    set((state) => ({
      ...state,
      renderPerf: next,
    })),
})
