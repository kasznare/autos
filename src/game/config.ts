import type { KeyboardControlsEntry } from '@react-three/drei'

export const MAX_DAMAGE = 100
export const PLAYER_BODY_NAME = 'player-car'
export const TRACK_SIZE = 60

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

export const DAMAGE_COLORS = [
  { threshold: 39, body: '#1e63f0', accent: '#ffffff' },
  { threshold: 69, body: '#f49b1a', accent: '#2a1b04' },
  { threshold: 99, body: '#de2e24', accent: '#2d0a07' },
  { threshold: MAX_DAMAGE, body: '#5f1b18', accent: '#f4ccca' },
]
