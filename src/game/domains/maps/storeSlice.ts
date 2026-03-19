import { createInitialPhysicsDebugTelemetryV2 } from '../../physics'
import type { MapSlice, SliceCreator } from '../../store/types'
import { buildMission } from '../gameplay/mission'
import { DEFAULT_MAP_SETUP, getInitialMapSetup, persistMapSetup, resetMapSetupStorage } from './storage'

const initialMapSetup = getInitialMapSetup()

export const createMapSlice: SliceCreator<MapSlice> = (set) => ({
  selectedMapId: initialMapSetup.selectedMapId,
  proceduralMapSeed: initialMapSetup.proceduralMapSeed,
  setSelectedMapId: (mapId) =>
    set((state) => {
      const nextSeed = mapId === 'procedural' ? state.proceduralMapSeed + 1 : state.proceduralMapSeed
      persistMapSetup({ selectedMapId: mapId, proceduralMapSeed: nextSeed })
      return {
        ...state,
        selectedMapId: mapId,
        damage: 0,
        score: 0,
        status: 'running',
        restartToken: state.restartToken + 1,
        hitFxStrength: 0,
        lastHitLabel: '',
        speedKph: 0,
        steeringDeg: 0,
        physicsTelemetry: createInitialPhysicsDebugTelemetryV2(),
        mission: buildMission(0),
        proceduralMapSeed: nextSeed,
      }
    }),
  rerollProceduralMap: () =>
    set((state) => {
      const nextSeed = state.proceduralMapSeed + 1
      persistMapSetup({ selectedMapId: state.selectedMapId, proceduralMapSeed: nextSeed })
      return {
        ...state,
        proceduralMapSeed: nextSeed,
        damage: 0,
        score: 0,
        status: 'running',
        restartToken: state.restartToken + 1,
        hitFxStrength: 0,
        lastHitLabel: '',
        speedKph: 0,
        steeringDeg: 0,
        physicsTelemetry: createInitialPhysicsDebugTelemetryV2(),
        mission: buildMission(0),
      }
    }),
  resetMapSetup: () =>
    set((state) => {
      resetMapSetupStorage()
      return {
        ...state,
        selectedMapId: DEFAULT_MAP_SETUP.selectedMapId,
        proceduralMapSeed: DEFAULT_MAP_SETUP.proceduralMapSeed,
        damage: 0,
        score: 0,
        status: 'running',
        restartToken: state.restartToken + 1,
        hitFxStrength: 0,
        lastHitLabel: '',
        speedKph: 0,
        steeringDeg: 0,
        physicsTelemetry: createInitialPhysicsDebugTelemetryV2(),
        mission: buildMission(0),
      }
    }),
})
