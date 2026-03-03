import { create } from 'zustand'
import { CAR_COLOR_OPTIONS, MAX_DAMAGE } from './config'
import type { CarProfileId } from './config'
import type { SpeedBand, SurfaceType } from './immersionEvents'
import { createInputState } from './keys'
import type { MapId } from './maps'
import type { DriveInputState } from './keys'

type GameStatus = 'running' | 'lost'
type BatterySaverMode = 'auto' | 'on' | 'off'
type MissionType = 'collect_stars' | 'collect_parts' | 'pass_gates' | 'clean_drive'

export type ActiveMission = {
  id: number
  type: MissionType
  label: string
  target: number
  progress: number
  reward: number
}

const MISSION_TEMPLATES: Array<Omit<ActiveMission, 'id' | 'progress'>> = [
  { type: 'collect_stars', label: 'Collect Stars', target: 5, reward: 90 },
  { type: 'pass_gates', label: 'Drive Through Gates', target: 4, reward: 105 },
  { type: 'collect_parts', label: 'Find Spare Parts', target: 3, reward: 120 },
  { type: 'clean_drive', label: 'Clean Drive Time', target: 20, reward: 130 },
]

const buildMission = (index: number): ActiveMission => {
  const template = MISSION_TEMPLATES[index % MISSION_TEMPLATES.length]
  return {
    id: index,
    type: template.type,
    label: template.label,
    target: template.target,
    reward: template.reward,
    progress: 0,
  }
}

type GameState = {
  damage: number
  score: number
  bestScore: number
  speedKph: number
  steeringDeg: number
  surface: SurfaceType
  tractionPct: number
  speedBand: SpeedBand
  lastImpactKph: number
  frameMsAvg: number
  frameMsWorst: number
  status: GameStatus
  restartToken: number
  engineMuted: boolean
  batterySaverMode: BatterySaverMode
  selectedMapId: MapId
  proceduralMapSeed: number
  selectedCarColor: string
  selectedCarProfile: CarProfileId
  mission: ActiveMission
  gamepadConnected: boolean
  keyboardInput: DriveInputState
  hitFxToken: number
  hitFxStrength: number
  lastHitLabel: string
  addDamage: (amount: number) => void
  addScore: (amount: number) => void
  repair: (amount: number) => void
  toggleEngineMuted: () => void
  setBatterySaverMode: (mode: BatterySaverMode) => void
  setSelectedMapId: (mapId: MapId) => void
  rerollProceduralMap: () => void
  setSelectedCarColor: (color: string) => void
  setSelectedCarProfile: (profile: CarProfileId) => void
  setKeyboardInput: (key: keyof DriveInputState, active: boolean) => void
  setGamepadConnected: (connected: boolean) => void
  triggerHitFx: (strength: number, label?: string) => void
  setTelemetry: (speedKph: number, steeringDeg: number) => void
  setDriveFeedback: (surface: SurfaceType, tractionPct: number, speedBand: SpeedBand) => void
  setLastImpactKph: (kph: number) => void
  setFrameTiming: (avgMs: number, worstMs: number) => void
  advanceMission: (event: MissionType, amount?: number) => void
  setMissionProgress: (event: MissionType, progress: number) => void
  restartRun: () => void
}

export const useGameStore = create<GameState>((set) => ({
  damage: 0,
  score: 0,
  bestScore: 0,
  speedKph: 0,
  steeringDeg: 0,
  surface: 'road',
  tractionPct: 100,
  speedBand: 'crawl',
  lastImpactKph: 0,
  frameMsAvg: 0,
  frameMsWorst: 0,
  status: 'running',
  restartToken: 0,
  engineMuted: true,
  batterySaverMode: 'auto',
  selectedMapId: 'city',
  proceduralMapSeed: 1,
  selectedCarColor: CAR_COLOR_OPTIONS[0],
  selectedCarProfile: 'steady',
  mission: buildMission(0),
  gamepadConnected: false,
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
  setBatterySaverMode: (mode) =>
    set((state) => ({
      ...state,
      batterySaverMode: mode,
    })),
  setSelectedMapId: (mapId) =>
    set((state) => ({
      ...state,
      selectedMapId: mapId,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
      speedKph: 0,
      steeringDeg: 0,
      surface: 'road',
      tractionPct: 100,
      speedBand: 'crawl',
      lastImpactKph: 0,
      frameMsAvg: 0,
      frameMsWorst: 0,
      mission: buildMission(0),
      proceduralMapSeed: mapId === 'procedural' ? state.proceduralMapSeed + 1 : state.proceduralMapSeed,
    })),
  rerollProceduralMap: () =>
    set((state) => ({
      ...state,
      proceduralMapSeed: state.proceduralMapSeed + 1,
      damage: 0,
      score: 0,
      status: 'running',
      restartToken: state.restartToken + 1,
      hitFxStrength: 0,
      speedKph: 0,
      steeringDeg: 0,
      surface: 'road',
      tractionPct: 100,
      speedBand: 'crawl',
      lastImpactKph: 0,
      frameMsAvg: 0,
      frameMsWorst: 0,
      mission: buildMission(0),
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
  setGamepadConnected: (connected) =>
    set((state) => ({
      ...state,
      gamepadConnected: connected,
    })),
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
  setDriveFeedback: (surface, tractionPct, speedBand) =>
    set((state) => ({
      ...state,
      surface,
      tractionPct: Math.max(0, Math.min(100, tractionPct)),
      speedBand,
    })),
  setLastImpactKph: (kph) =>
    set((state) => ({
      ...state,
      lastImpactKph: Math.max(0, kph),
    })),
  setFrameTiming: (avgMs, worstMs) =>
    set((state) => ({
      ...state,
      frameMsAvg: Math.max(0, avgMs),
      frameMsWorst: Math.max(0, worstMs),
    })),
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
      speedKph: 0,
      steeringDeg: 0,
      surface: 'road',
      tractionPct: 100,
      speedBand: 'crawl',
      lastImpactKph: 0,
      frameMsAvg: 0,
      frameMsWorst: 0,
      mission: buildMission(0),
    })),
}))
