import { create } from 'zustand'
import { MAX_DAMAGE } from './config'
import { createInputState } from './keys'
import type { DriveInputState } from './keys'

type GameStatus = 'running' | 'lost'

type GameState = {
  damage: number
  score: number
  bestScore: number
  status: GameStatus
  restartToken: number
  keyboardInput: DriveInputState
  hitFxToken: number
  hitFxStrength: number
  addDamage: (amount: number) => void
  addScore: (amount: number) => void
  repair: (amount: number) => void
  setKeyboardInput: (key: keyof DriveInputState, active: boolean) => void
  triggerHitFx: (strength: number) => void
  restartRun: () => void
}

export const useGameStore = create<GameState>((set) => ({
  damage: 0,
  score: 0,
  bestScore: 0,
  status: 'running',
  restartToken: 0,
  keyboardInput: createInputState(),
  hitFxToken: 0,
  hitFxStrength: 0,
  addDamage: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      const nextDamage = Math.min(MAX_DAMAGE, state.damage + amount)
      return {
        ...state,
        damage: nextDamage,
        status: nextDamage >= MAX_DAMAGE ? 'lost' : 'running',
      }
    }),
  addScore: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      const nextScore = state.score + amount
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
      }
    }),
  repair: (amount) =>
    set((state) => {
      if (state.status === 'lost') {
        return state
      }

      return {
        ...state,
        damage: Math.max(0, state.damage - amount),
      }
    }),
  setKeyboardInput: (key, active) =>
    set((state) => ({
      ...state,
      keyboardInput: { ...state.keyboardInput, [key]: active },
    })),
  triggerHitFx: (strength) =>
    set((state) => ({
      ...state,
      hitFxToken: state.hitFxToken + 1,
      hitFxStrength: Math.max(0.15, Math.min(1, strength)),
    })),
  restartRun: () =>
    set((state) => ({
      ...state,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
    })),
}))
