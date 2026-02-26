import { create } from 'zustand'
import { CAR_COLOR_OPTIONS, MAX_DAMAGE } from './config'
import type { CarProfileId } from './config'
import { createInputState } from './keys'
import type { DriveInputState } from './keys'

type GameStatus = 'running' | 'lost'

type GameState = {
  damage: number
  score: number
  bestScore: number
  status: GameStatus
  restartToken: number
  engineMuted: boolean
  selectedCarColor: string
  selectedCarProfile: CarProfileId
  keyboardInput: DriveInputState
  hitFxToken: number
  hitFxStrength: number
  lastHitLabel: string
  addDamage: (amount: number) => void
  addScore: (amount: number) => void
  repair: (amount: number) => void
  toggleEngineMuted: () => void
  setSelectedCarColor: (color: string) => void
  setSelectedCarProfile: (profile: CarProfileId) => void
  setKeyboardInput: (key: keyof DriveInputState, active: boolean) => void
  triggerHitFx: (strength: number, label?: string) => void
  restartRun: () => void
}

export const useGameStore = create<GameState>((set) => ({
  damage: 0,
  score: 0,
  bestScore: 0,
  status: 'running',
  restartToken: 0,
  engineMuted: true,
  selectedCarColor: CAR_COLOR_OPTIONS[0],
  selectedCarProfile: 'steady',
  keyboardInput: createInputState(),
  hitFxToken: 0,
  hitFxStrength: 0,
  lastHitLabel: '',
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
  toggleEngineMuted: () =>
    set((state) => ({
      ...state,
      engineMuted: !state.engineMuted,
    })),
  setSelectedCarColor: (color) =>
    set((state) => ({
      ...state,
      selectedCarColor: color,
    })),
  setSelectedCarProfile: (profile) =>
    set((state) => ({
      ...state,
      selectedCarProfile: profile,
    })),
  setKeyboardInput: (key, active) =>
    set((state) => ({
      ...state,
      keyboardInput: { ...state.keyboardInput, [key]: active },
    })),
  triggerHitFx: (strength, label = '') =>
    set((state) => ({
      ...state,
      hitFxToken: state.hitFxToken + 1,
      hitFxStrength: Math.max(0.15, Math.min(1, strength)),
      lastHitLabel: label,
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
