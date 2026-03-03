import { create } from 'zustand'
import { createGameplaySlice, createInputSlice, createMapSlice, createUiSlice, createVehicleSlice } from './domains'
import type { ActiveMission, BatterySaverMode, GameState, GameStatus, MissionType } from './store/types'

export type { ActiveMission, BatterySaverMode, GameState, GameStatus, MissionType }

export const useGameStore = create<GameState>()((...args) => ({
  ...createGameplaySlice(...args),
  ...createMapSlice(...args),
  ...createVehicleSlice(...args),
  ...createInputSlice(...args),
  ...createUiSlice(...args),
}))

