import type { KeyboardControlsEntry } from '@react-three/drei'

export const MAX_DAMAGE = 100
export const PLAYER_BODY_NAME = 'player-car'
export const TRACK_SIZE = 60
export const ROAD_OUTER_HALF = 23
export const ROAD_INNER_HALF = 11

export type ControlName = 'forward' | 'backward' | 'left' | 'right' | 'restart'

export const INPUT_MAP: KeyboardControlsEntry<ControlName>[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'restart', keys: ['KeyR', 'Space'] },
]

export const DAMAGE_TIERS = {
  low: 5,
  medium: 15,
  high: 30,
}

export const CAR_COLOR_OPTIONS = ['#1e63f0', '#f49b1a', '#14b86c', '#d83b2d', '#8f4df2', '#f2c230'] as const
