import { createInitialPhysicsDebugTelemetryV2 } from '../../physics'
import type { GameplaySlice, SliceCreator } from '../../store/types'
import { buildMission } from './mission'

const MAX_DAMAGE = 100

export const createGameplaySlice: SliceCreator<GameplaySlice> = (set) => ({
  damage: 0,
  score: 0,
  bestScore: 0,
  status: 'running',
  restartToken: 0,
  mission: buildMission(0),
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
  advanceMission: (event, amount = 1) =>
    set((state) => {
      if (state.status === 'lost' || state.mission.type !== event) {
        return state
      }
      const nextProgress = Math.min(state.mission.target, state.mission.progress + Math.max(0, amount))
      if (nextProgress < state.mission.target) {
        return {
          ...state,
          mission: { ...state.mission, progress: nextProgress },
        }
      }
      const nextMission = buildMission(state.mission.id + 1)
      const reward = state.mission.reward
      const nextScore = state.score + reward
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
        mission: nextMission,
        hitFxToken: state.hitFxToken + 1,
        hitFxStrength: 0.45,
        lastHitLabel: `Mission Complete! +${reward}`,
      }
    }),
  setMissionProgress: (event, progress) =>
    set((state) => {
      if (state.status === 'lost' || state.mission.type !== event) {
        return state
      }
      const clamped = Math.max(0, Math.min(state.mission.target, progress))
      if (clamped === state.mission.progress) {
        return state
      }
      if (clamped < state.mission.target) {
        return {
          ...state,
          mission: { ...state.mission, progress: clamped },
        }
      }
      const nextMission = buildMission(state.mission.id + 1)
      const reward = state.mission.reward
      const nextScore = state.score + reward
      return {
        ...state,
        score: nextScore,
        bestScore: Math.max(state.bestScore, nextScore),
        mission: nextMission,
        hitFxToken: state.hitFxToken + 1,
        hitFxStrength: 0.45,
        lastHitLabel: `Mission Complete! +${reward}`,
      }
    }),
  restartRun: () =>
    set((state) => ({
      ...state,
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
    })),
})
